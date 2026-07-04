import { hexToRgb } from '../../framework/color'
import { mulberry32 } from '../../framework/rng'
import type { CwavesConfig } from './schema'

export { hexToRgb }

// Hard ceiling on gratings — the shader declares fixed-size uniform arrays, the
// `waveCount` slider caps at this, and unused slots are padded with zeros.
export const MAX_WAVES = 8
// Palette stops are a fixed-size uniform array too; the `palette` colorList caps here.
export const MAX_STOPS = 8
// The summed field's amplitudes are normalized to this total, so changing Wave
// count re-textures the pattern WITHOUT shifting overall contrast (Banding stays
// meaningful across counts).
const AMP_TOTAL = 3.0

// Fullscreen triangle from gl_VertexID — no attribute buffers.
export const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// cwaves — a scalar field is the superposition of several 1-D cosine gratings,
// each with its own direction, wavelength, starting phase and drift rate:
//   s(x,y,t) = Σ ampᵢ · cos( waveVecᵢ · p + phaseᵢ + t·driftᵢ )
// The field is folded through sin() into a smooth 0..1 value, then mapped through
// a multi-stop palette → flowing ribbons of colour that continuously reorganize
// as the phases drift.
export const FRAG_SRC = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform float u_time;                 // accumulated drift phase (seconds · driftSpeed)
uniform float u_scale;
uniform float u_banding;
uniform int   u_count;                // active gratings (≤ ${MAX_WAVES})
uniform vec2  u_wave[${MAX_WAVES}];   // direction·frequency per grating
uniform float u_phase[${MAX_WAVES}];  // seeded starting phase
uniform float u_drift[${MAX_WAVES}];  // per-grating drift multiplier
uniform float u_amp[${MAX_WAVES}];    // normalized amplitude (Σ = ${AMP_TOTAL.toFixed(1)})
uniform vec3  u_stops[${MAX_STOPS}];  // palette gradient stops
uniform int   u_stopCount;            // active stops (2..${MAX_STOPS})
out vec4 fragColor;

vec3 palette(float f) {
  f = clamp(f, 0.0, 1.0);
  float x = f * float(u_stopCount - 1);
  int i = int(floor(x));
  if (i >= u_stopCount - 1) return u_stops[u_stopCount - 1];
  return mix(u_stops[i], u_stops[i + 1], x - float(i));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);
  vec2 p = uv * u_scale;
  float s = 0.0;
  for (int i = 0; i < ${MAX_WAVES}; i++) {
    if (i >= u_count) break;
    s += u_amp[i] * cos(dot(u_wave[i], p) + u_phase[i] + u_time * u_drift[i]);
  }
  // s ∈ [-${AMP_TOTAL.toFixed(1)}, ${AMP_TOTAL.toFixed(1)}]; sin() folds it into a smooth,
  // seam-free 0..1 that ping-pongs the palette (dark→light→dark) — no banding jump.
  float f = 0.5 + 0.5 * sin(s * u_banding);
  fragColor = vec4(palette(f), 1.0);
}`

/** The seeded grating set: flat uniform-ready arrays (fixed length ${MAX_WAVES},
 *  unused slots zero-padded) plus the active count. */
export type WaveSet = {
  wave: Float32Array // vec2 per grating: direction·frequency, length MAX_WAVES*2
  phase: Float32Array // length MAX_WAVES
  drift: Float32Array // length MAX_WAVES
  amp: Float32Array // length MAX_WAVES, active amps sum to AMP_TOTAL
  count: number
}

/** Derive the grating set from config — pure + deterministic in `seed`. Same seed
 *  (and same spread/count) → identical arrays, so a pinned seed reproduces the
 *  exact weave. Angles/wavelengths/phases all come from the one seeded stream. */
export function buildWaves(cfg: CwavesConfig): WaveSet {
  const rnd = mulberry32(cfg.seed >>> 0)
  const count = Math.max(3, Math.min(MAX_WAVES, cfg.waveCount))
  const wave = new Float32Array(MAX_WAVES * 2)
  const phase = new Float32Array(MAX_WAVES)
  const drift = new Float32Array(MAX_WAVES)
  const amp = new Float32Array(MAX_WAVES)
  const baseRot = rnd() * Math.PI * 2
  let ampSum = 0
  for (let i = 0; i < count; i++) {
    const angle = baseRot + (rnd() * 2 - 1) * cfg.angleSpread * Math.PI
    const freq = Math.max(0.15, 1 + (rnd() * 2 - 1) * cfg.frequencySpread)
    wave[i * 2] = Math.cos(angle) * freq
    wave[i * 2 + 1] = Math.sin(angle) * freq
    phase[i] = rnd() * Math.PI * 2
    drift[i] = 1 + (rnd() * 2 - 1) * 0.2 // small beat between gratings
    const a = 0.7 + 0.3 * rnd()
    amp[i] = a
    ampSum += a
  }
  // Normalize active amplitudes to a fixed total so Banding reads the same at any Wave count.
  const k = ampSum > 0 ? AMP_TOTAL / ampSum : 0
  for (let i = 0; i < count; i++) amp[i] *= k
  return { wave, phase, drift, amp, count }
}

/** CPU mirror of the shader's summed field (pre-fold). Finite and bounded by
 *  AMP_TOTAL — used by tests; the GPU is the real renderer. */
export function fieldAt(w: WaveSet, x: number, y: number, t: number): number {
  let s = 0
  for (let i = 0; i < w.count; i++) {
    s += w.amp[i] * Math.cos(w.wave[i * 2] * x + w.wave[i * 2 + 1] * y + w.phase[i] + t * w.drift[i])
  }
  return s
}

/** Flat length-`MAX_STOPS*3` palette (0..1 floats), zero-padded, + active stop count. */
export function buildPalette(cfg: CwavesConfig): { stops: Float32Array; count: number } {
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

export type CwavesGL = {
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
    throw new Error(`cwaves shader compile failed: ${log}`)
  }
  return sh
}

export function initGL(gl: WebGL2RenderingContext): CwavesGL {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC)
  // Delete-before-throw on every error path so no GL object leaks (mirrors plasma).
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
    throw new Error(`cwaves program link failed: ${log}`)
  }
  const vao = gl.createVertexArray()!
  const name = (n: string) => gl.getUniformLocation(program, n)
  return {
    program, vao,
    locs: {
      res: name('u_res'), time: name('u_time'), scale: name('u_scale'),
      banding: name('u_banding'), count: name('u_count'), wave: name('u_wave'),
      phase: name('u_phase'), drift: name('u_drift'), amp: name('u_amp'),
      stops: name('u_stops'), stopCount: name('u_stopCount'),
    },
  }
}

export function render(
  gl: WebGL2RenderingContext, s: CwavesGL, cfg: CwavesConfig,
  waves: WaveSet, palette: { stops: Float32Array; count: number }, phase: number,
): void {
  // No gl.clear(): the fullscreen triangle covers every pixel opaquely each frame.
  gl.useProgram(s.program)
  gl.bindVertexArray(s.vao)
  gl.uniform2f(s.locs.res, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.uniform1f(s.locs.time, phase)
  gl.uniform1f(s.locs.scale, cfg.scale)
  gl.uniform1f(s.locs.banding, cfg.banding)
  gl.uniform1i(s.locs.count, waves.count)
  gl.uniform2fv(s.locs.wave, waves.wave)
  gl.uniform1fv(s.locs.phase, waves.phase)
  gl.uniform1fv(s.locs.drift, waves.drift)
  gl.uniform1fv(s.locs.amp, waves.amp)
  gl.uniform3fv(s.locs.stops, palette.stops)
  gl.uniform1i(s.locs.stopCount, palette.count)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export function disposeGL(gl: WebGL2RenderingContext, s: CwavesGL): void {
  gl.deleteProgram(s.program)
  gl.deleteVertexArray(s.vao)
}
