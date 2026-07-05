import { hexToRgb } from '../../framework/color'
import { mulberry32 } from '../../framework/rng'
import type { AuroraConfig } from './schema'

export { hexToRgb }

// Palette stops are a fixed-size uniform array; the `paletteStops` colorList caps here.
export const MAX_STOPS = 8
// Number of stacked curtain layers (parallax). Fixed loop bound in the shader.
export const CURTAINS = 3

// Fullscreen triangle from gl_VertexID — no attribute buffers.
export const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// Aurora Curtains — a stateless procedural night sky. A domain-warped fbm field,
// scrolling slowly over accumulated time, is folded to a ridge so several luminous
// vertical curtains sway and reform. Each curtain hangs from a wavy base line with a
// bright lower edge fading upward (real hanging rays) and higher-frequency vertical
// striations gated by the curtain's intensity. Colour runs base → tip along the
// curtain height (oxygen green up into magenta/violet). Three layers at different
// scales/speeds give parallax. Additive over a deep-night gradient with sparse stars.
export const FRAG_SRC = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform float u_time;         // accumulated drift phase (seconds · speed)
uniform vec2  u_seed;         // per-seed noise offset (0..1000), keeps every fresh visit distinct
uniform float u_brightness;
uniform float u_curtainScale;
uniform float u_raySharpness;
uniform float u_starDensity;
uniform vec3  u_skyZenith;
uniform vec3  u_skyHorizon;
uniform vec3  u_stops[${MAX_STOPS}];  // palette base → tip
uniform int   u_stopCount;            // active stops (2..${MAX_STOPS})
out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.0; a *= 0.5; }
  return v;
}

vec3 palette(float f) {
  f = clamp(f, 0.0, 1.0);
  float x = f * float(u_stopCount - 1);
  int i = int(floor(x));
  if (i >= u_stopCount - 1) return u_stops[u_stopCount - 1];
  return mix(u_stops[i], u_stops[i + 1], x - float(i));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;      // 0..1, y = 0 at the horizon (bottom)
  float aspect = u_res.x / u_res.y;
  float x = (uv.x - 0.5) * aspect;
  float t = u_time;

  float aurora = 0.0;   // summed curtain intensity at this pixel
  float hsum = 0.0;     // intensity-weighted curtain height → palette lookup
  for (int i = 0; i < ${CURTAINS}; i++) {
    float fi = float(i);
    float lt = t * (1.0 - fi * 0.22);                 // per-layer time (parallax)
    float dir = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;      // alternate drift direction
    float sc = u_curtainScale * (1.0 + fi * 0.7);
    // Horizontal curtain coordinate, warped by slow noise so the drapes sway as they hang.
    float px = x * sc + u_seed.x + fi * 31.0;
    px += 0.8 * fbm(vec2(x * sc * 0.35 + lt * 0.05 * dir, uv.y * 1.3 - lt * 0.06));
    float scroll = lt * 0.08 * dir;
    // Curtains live where the scrolling field ridges — the moving threshold crossing.
    float n = fbm(vec2(px * 0.5 + scroll, fi * 11.0 + scroll * 0.3));
    float ridge = 1.0 - abs(2.0 * n - 1.0);
    float curtain = pow(clamp(ridge, 0.0, 1.0), 3.0);
    // Wavy base line; brightness fades upward from it (bright base, hanging rays fade up).
    float baseY = 0.22 + 0.14 * fbm(vec2(px * 0.3 + scroll, fi * 7.0)) - fi * 0.02;
    float above = uv.y - baseY;
    float tall = 0.45 + 0.2 * fbm(vec2(px * 0.2, fi * 3.0));
    float vprof = smoothstep(-0.04, 0.03, above) * exp(-max(above, 0.0) / tall);
    // Fine vertical striations (rays), gated in by Ray sharpness.
    float ray = mix(1.0,
      0.45 + 0.55 * sin(px * 22.0 + fbm(vec2(px * 2.5, uv.y * 5.0 - lt * 0.15)) * 6.2831),
      u_raySharpness);
    float inten = curtain * vprof * max(ray, 0.0);
    aurora += inten;
    hsum += inten * clamp(above / (tall * 1.6), 0.0, 1.0);
  }
  float hgt = aurora > 1e-4 ? hsum / aurora : 0.0;
  vec3 aur = palette(hgt) * aurora * u_brightness;

  // Deep-night gradient: horizon glow low, near-black overhead.
  vec3 sky = mix(u_skyHorizon, u_skyZenith, pow(clamp(uv.y, 0.0, 1.0), 0.7));

  // Sparse twinkling stars, dimmed behind the aurora.
  float star = 0.0;
  if (u_starDensity > 0.0) {
    vec2 g = uv * vec2(aspect, 1.0) * 220.0;
    vec2 gi = floor(g);
    float h = hash(gi + u_seed.y);
    if (h > 1.0 - u_starDensity * 0.06) {
      float d = length(fract(g) - 0.5);
      float tw = 0.6 + 0.4 * sin(t * 2.0 + h * 100.0);
      star = smoothstep(0.35, 0.0, d) * tw * (0.5 + 0.5 * hash(gi + 7.0));
    }
  }
  sky += vec3(star) * (1.0 - smoothstep(0.0, 0.4, aurora));

  vec3 col = sky + aur;
  col = col / (1.0 + col * 0.25);   // gentle roll-off so curtain cores keep hue instead of clipping white
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`

/** Per-seed noise offset (two 0..1000 floats). Pure + deterministic in `seed`, so a
 *  pinned seed reproduces the exact night; passing an offset (not the raw int) keeps
 *  the float32 uniform precise even for large randomized seeds. */
export function seedOffset(seed: number): [number, number] {
  const r = mulberry32((seed >>> 0) || 1)
  return [r() * 1000, r() * 1000]
}

/** Flat length-`MAX_STOPS*3` palette (0..1 floats), zero-padded, + active stop count. */
export function buildPalette(cfg: AuroraConfig): { stops: Float32Array; count: number } {
  const stops = new Float32Array(MAX_STOPS * 3)
  const n = Math.min(MAX_STOPS, cfg.paletteStops.length)
  for (let i = 0; i < n; i++) {
    const [r, g, b] = hexToRgb(cfg.paletteStops[i])
    stops[i * 3] = r
    stops[i * 3 + 1] = g
    stops[i * 3 + 2] = b
  }
  return { stops, count: Math.max(2, n) }
}

export type AuroraGL = {
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
    throw new Error(`aurora shader compile failed: ${log}`)
  }
  return sh
}

export function initGL(gl: WebGL2RenderingContext): AuroraGL {
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
    throw new Error(`aurora program link failed: ${log}`)
  }
  const vao = gl.createVertexArray()!
  const name = (n: string) => gl.getUniformLocation(program, n)
  return {
    program, vao,
    locs: {
      res: name('u_res'), time: name('u_time'), seed: name('u_seed'),
      brightness: name('u_brightness'), curtainScale: name('u_curtainScale'),
      raySharpness: name('u_raySharpness'), starDensity: name('u_starDensity'),
      skyZenith: name('u_skyZenith'), skyHorizon: name('u_skyHorizon'),
      stops: name('u_stops'), stopCount: name('u_stopCount'),
    },
  }
}

export function render(
  gl: WebGL2RenderingContext, s: AuroraGL, cfg: AuroraConfig,
  seed: [number, number], palette: { stops: Float32Array; count: number },
  sky: { zenith: [number, number, number]; horizon: [number, number, number] }, phase: number,
): void {
  // No gl.clear(): the fullscreen triangle covers every pixel opaquely each frame.
  gl.useProgram(s.program)
  gl.bindVertexArray(s.vao)
  gl.uniform2f(s.locs.res, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.uniform1f(s.locs.time, phase)
  gl.uniform2f(s.locs.seed, seed[0], seed[1])
  gl.uniform1f(s.locs.brightness, cfg.brightness)
  gl.uniform1f(s.locs.curtainScale, cfg.curtainScale)
  gl.uniform1f(s.locs.raySharpness, cfg.raySharpness)
  gl.uniform1f(s.locs.starDensity, cfg.starDensity)
  gl.uniform3f(s.locs.skyZenith, sky.zenith[0], sky.zenith[1], sky.zenith[2])
  gl.uniform3f(s.locs.skyHorizon, sky.horizon[0], sky.horizon[1], sky.horizon[2])
  gl.uniform3fv(s.locs.stops, palette.stops)
  gl.uniform1i(s.locs.stopCount, palette.count)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

/** Cached sky colours (frame-invariant) — recomputed in setup + update alongside the palette. */
export function buildSky(cfg: AuroraConfig): { zenith: [number, number, number]; horizon: [number, number, number] } {
  return { zenith: hexToRgb(cfg.skyZenith), horizon: hexToRgb(cfg.skyHorizon) }
}

export function disposeGL(gl: WebGL2RenderingContext, s: AuroraGL): void {
  gl.deleteProgram(s.program)
  gl.deleteVertexArray(s.vao)
}
