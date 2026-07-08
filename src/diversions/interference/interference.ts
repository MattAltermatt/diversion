import { hexToRgb } from '../../framework/color'
import { mulberry32 } from '../../framework/rng'
import type { InterferenceConfig } from './schema'

export { hexToRgb }

// Fixed-size uniform-array ceilings. `sourceCount`/`palette` sliders cap here;
// unused slots are zero-padded.
export const MAX_SOURCES = 8
export const MAX_STOPS = 8

// Fullscreen triangle from gl_VertexID — no attribute buffers (mirrors plasma/cwaves).
export const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// Interference — clean-room port of xscreensaver's `interference` hack (Hannu
// Mallat, 1998; https://github.com/Zygo/xscreensaver hacks/interference.c).
// The original sums, per pixel, a lookup-table "wave height" for each of several
// moving sources — a linearly-decaying-with-distance cosine bump — and colours by
// the summed height modulo the palette size. Each source itself wanders on a
// bounded Lissajous-style path: x = w/2 + cos(x_theta)·w/2, y = h/2 +
// cos(y_theta)·h/2, with x_theta/y_theta independently advancing (source_x/
// source_y macros + do_inter() in the original).
//
// This port keeps that shape — moving point sources, distance-attenuated waves,
// a cyclically-wrapped palette lookup — but reimplements the wave term as an
// explicit travelling wave (sin(dist·frequency − t) rather than a static
// per-distance LUT) so the ripple motion reads smoothly at any frame rate without
// needing a huge precomputed table:
//   height(p, t) = Σ_i amp(dist_i) · sin(dist_i · frequency − t·speed)
//   amp(d) = clamp(1 − d / radius, 0, 1)          — linear falloff, matches the original
//   colour = palette( fract(height · bands) )      — cyclic wrap, matches `% colors`
export const FRAG_SRC = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform float u_time;                    // accumulated ripple-travel phase (seconds · speed)
uniform float u_frequency;
uniform float u_radius;
uniform float u_bands;
uniform int   u_count;                   // active sources (<= ${MAX_SOURCES})
uniform vec2  u_srcPos[${MAX_SOURCES}];  // per-source position in uv space, updated every frame
uniform vec3  u_stops[${MAX_STOPS}];     // palette gradient stops
uniform int   u_stopCount;               // active stops (2..${MAX_STOPS})
out vec4 fragColor;

// Cyclic palette lookup: the field wraps continuously through fract(), and the
// last stop blends back into the first (i1 wraps via modulo) — mirrors the
// original hack's result %= colors wraparound colouring.
vec3 cyclicPalette(float f) {
  f = fract(f);
  float x = f * float(u_stopCount);
  int i = int(floor(x));
  int i0 = i % u_stopCount;
  int i1 = (i + 1) % u_stopCount;
  return mix(u_stops[i0], u_stops[i1], x - float(i));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);
  float h = 0.0;
  for (int i = 0; i < ${MAX_SOURCES}; i++) {
    if (i >= u_count) break;
    float d = distance(uv, u_srcPos[i]);
    float amp = clamp(1.0 - d / u_radius, 0.0, 1.0);
    h += amp * sin(d * u_frequency - u_time);
  }
  fragColor = vec4(cyclicPalette(h * u_bands), 1.0);
}`

/** The seeded source set: fixed-length arrays (unused slots past `count` are
 *  zero, harmless — the shader loop breaks at u_count so they're never read). */
export type SourceSet = {
  thetaX: Float32Array // initial x-phase per source, length MAX_SOURCES
  thetaY: Float32Array // initial y-phase per source
  rateX: Float32Array  // per-source x drift-rate multiplier (~[0.8, 1.2))
  rateY: Float32Array  // per-source y drift-rate multiplier
  count: number
}

/** Derive the source set from config — pure + deterministic in `seed`. Same seed
 *  (and same sourceCount) → identical arrays, so a pinned seed reproduces the
 *  exact arrangement, including each source's position at t=0. */
export function buildSources(cfg: InterferenceConfig): SourceSet {
  const rnd = mulberry32(cfg.seed >>> 0)
  const count = Math.max(2, Math.min(MAX_SOURCES, cfg.sourceCount))
  const thetaX = new Float32Array(MAX_SOURCES)
  const thetaY = new Float32Array(MAX_SOURCES)
  const rateX = new Float32Array(MAX_SOURCES)
  const rateY = new Float32Array(MAX_SOURCES)
  for (let i = 0; i < count; i++) {
    thetaX[i] = rnd() * Math.PI * 2
    thetaY[i] = rnd() * Math.PI * 2
    rateX[i] = 0.8 + 0.4 * rnd() // keeps sources from drifting in lockstep
    rateY[i] = 0.8 + 0.4 * rnd()
  }
  return { thetaX, thetaY, rateX, rateY, count }
}

/** One source's position at drift-time `t` (seconds since setup, NOT wall clock —
 *  see index.ts) — a bounded Lissajous-style meander ported from the original
 *  hack's source_x/source_y macros: each axis oscillates via cos() of its own
 *  independently-advancing phase, so a source wanders the whole field and never
 *  needs edge wraparound. `rangeX`/`rangeY` are the uv-space half-extents (the
 *  same normalized space the shader draws in — see FRAG_SRC's `uv`). */
export function sourcePosition(
  s: SourceSet, i: number, t: number, driftSpeed: number, rangeX: number, rangeY: number,
): [number, number] {
  return [
    Math.cos(s.thetaX[i] + t * driftSpeed * s.rateX[i]) * rangeX,
    Math.cos(s.thetaY[i] + t * driftSpeed * s.rateY[i]) * rangeY,
  ]
}

// Sources roam within this fraction of the uv-space half-extent, leaving a
// margin so a source's own ripple crest stays visible even at the field's edge.
const DRIFT_MARGIN = 0.82

/** All active source positions at drift-time `t`, flattened for `gl.uniform2fv`
 *  (length MAX_SOURCES*2, zero-padded past `count`). `aspect` = width/min(w,h),
 *  matching the shader's uv normalization (uv.x spans ±aspect, uv.y spans ±1). */
export function computePositions(s: SourceSet, t: number, driftSpeed: number, aspect: number): Float32Array {
  const out = new Float32Array(MAX_SOURCES * 2)
  const rangeX = aspect * DRIFT_MARGIN
  const rangeY = DRIFT_MARGIN
  for (let i = 0; i < s.count; i++) {
    const [x, y] = sourcePosition(s, i, t, driftSpeed, rangeX, rangeY)
    out[i * 2] = x
    out[i * 2 + 1] = y
  }
  return out
}

/** CPU mirror of the shader's summed wave height at a point (pre-palette) —
 *  finite and bounded by `count` (each term's |amp·sin| <= 1). Used by tests;
 *  the GPU is the real renderer. */
export function heightAt(
  positions: { x: number; y: number }[], px: number, py: number,
  t: number, frequency: number, radius: number,
): number {
  let h = 0
  for (const p of positions) {
    const d = Math.hypot(px - p.x, py - p.y)
    const amp = Math.max(0, Math.min(1, 1 - d / radius))
    h += amp * Math.sin(d * frequency - t)
  }
  return h
}

/** Flat length-`MAX_STOPS*3` palette (0..1 floats), zero-padded, + active stop count. */
export function buildPalette(cfg: InterferenceConfig): { stops: Float32Array; count: number } {
  const stops = new Float32Array(MAX_STOPS * 3)
  const n = Math.min(MAX_STOPS, cfg.palette.length)
  for (let i = 0; i < n; i++) {
    const [r, g, b] = hexToRgb(cfg.palette[i])
    stops[i * 3] = r
    stops[i * 3 + 1] = g
    stops[i * 3 + 2] = b
  }
  return { stops, count: Math.max(2, n) }
}

export type InterferenceGL = {
  program: WebGLProgram
  vao: WebGLVertexArrayObject
  locs: Record<string, WebGLUniformLocation | null>
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`Interference shader compile failed: ${log}`)
  }
  return sh
}

export function initGL(gl: WebGL2RenderingContext): InterferenceGL {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC)
  // Delete-before-throw on every error path so no GL object leaks (mirrors plasma/cwaves).
  let fs: WebGLShader
  try {
    fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
  } catch (e) {
    gl.deleteShader(vs)
    throw e
  }
  const program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`Interference program link failed: ${log}`)
  }
  const vao = gl.createVertexArray()!
  const name = (n: string) => gl.getUniformLocation(program, n)
  return {
    program, vao,
    locs: {
      res: name('u_res'), time: name('u_time'), frequency: name('u_frequency'),
      radius: name('u_radius'), bands: name('u_bands'), count: name('u_count'),
      srcPos: name('u_srcPos'), stops: name('u_stops'), stopCount: name('u_stopCount'),
    },
  }
}

export function render(
  gl: WebGL2RenderingContext, s: InterferenceGL, cfg: InterferenceConfig,
  sources: SourceSet, palette: { stops: Float32Array; count: number },
  phase: number, driftT: number,
): void {
  // No gl.clear(): the fullscreen triangle covers every pixel opaquely each frame.
  gl.useProgram(s.program)
  gl.bindVertexArray(s.vao)
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight
  const aspect = w / Math.min(w, h)
  const positions = computePositions(sources, driftT, cfg.driftSpeed, aspect)
  gl.uniform2f(s.locs.res, w, h)
  gl.uniform1f(s.locs.time, phase)
  gl.uniform1f(s.locs.frequency, cfg.frequency)
  gl.uniform1f(s.locs.radius, cfg.radius)
  gl.uniform1f(s.locs.bands, cfg.bands)
  gl.uniform1i(s.locs.count, sources.count)
  gl.uniform2fv(s.locs.srcPos, positions)
  gl.uniform3fv(s.locs.stops, palette.stops)
  gl.uniform1i(s.locs.stopCount, palette.count)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export function disposeGL(gl: WebGL2RenderingContext, s: InterferenceGL): void {
  gl.deleteProgram(s.program)
  gl.deleteVertexArray(s.vao)
}
