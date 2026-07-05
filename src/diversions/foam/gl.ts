import { simDims, seedFoam, buildLUT, kappaFor, dtFor } from './field'
import { hexToRgb } from '../../framework/color'
import type { FoamConfig } from './schema'

// ── Model constants (Fan–Chen multi-order-parameter Allen–Cahn grain growth) ──
// Coupling penalty on overlap of unlike order parameters. MUST be > 1: outside a
// grain the double-well's η³−η term pushes a field UP (0 is its unstable barrier),
// so only a coupling above 1 wins that tug and drives foreign fields back to 0,
// keeping grains distinct. 1.5 gives crisp, well-separated cells.
const COUPLING = 1.5

// ── Reseed loop (endless coarsening) ──
// Coarsening is measured, not scripted: a tiny readback pass estimates the fraction
// of the field that is interface (wall). It starts ~0 (salt-noise nuclei), spikes as
// cells form, then decays monotonically as von Neumann coarsening thins the wall
// network. When it falls below RESEED_WALL_FRAC the froth has coarsened to a few big
// cells → re-noise with a fresh per-cycle seed and start over. 🎚️ all Chrome-tuned.
const MEASURE_SIDE = 64            // readback grid (64² RGBA8 ≈ 16 KB, cheap + rare)
const MEASURE_INTERVAL = 300       // sim sub-steps between wall-fraction checks
const MIN_STEPS_SINCE_RESEED = 3000 // warmup: skip the boiling nucleation phase
const RESEED_WALL_FRAC = 0.05      // reseed once < 5% of samples are interface
const SAFETY_STEPS = 80000         // hard cap so it always eventually reseeds
const WALL_LEVEL = 0.7             // m1 (top field) below this counts as interface

const TRI_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// SIM: one Allen–Cahn step over all 8 order parameters at once. Two RGBA32F inputs
// (a = fields 0–3, b = fields 4–7), two MRT outputs. For each field η_i:
//   ∂η_i/∂t = -L( f'(η_i) + γ·η_i·Σ_{j≠i} η_j²  −  κ·∇²η_i ),  f'(η)=η³−η
// The κ∇²η term moves interfaces by mean curvature — the coarsening driver. All 8
// fields are updated as two vec4s, so the whole thing vectorizes.
const SIM_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform vec2  u_texel;   // 1/simSize
uniform float u_kappa;
uniform float u_dt;
layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;

// 9-tap Laplacian (ortho 0.2, diag 0.05, center -1.0) — same normalized stencil the
// reaction-diffusion diversions use; operates on all four packed fields at once.
vec4 lap(sampler2D s, vec2 uv) {
  vec4 acc = vec4(0.0);
  acc += texture(s, uv + vec2(-1.0, 0.0) * u_texel) * 0.2;
  acc += texture(s, uv + vec2( 1.0, 0.0) * u_texel) * 0.2;
  acc += texture(s, uv + vec2( 0.0,-1.0) * u_texel) * 0.2;
  acc += texture(s, uv + vec2( 0.0, 1.0) * u_texel) * 0.2;
  acc += texture(s, uv + vec2(-1.0,-1.0) * u_texel) * 0.05;
  acc += texture(s, uv + vec2( 1.0,-1.0) * u_texel) * 0.05;
  acc += texture(s, uv + vec2(-1.0, 1.0) * u_texel) * 0.05;
  acc += texture(s, uv + vec2( 1.0, 1.0) * u_texel) * 0.05;
  acc += texture(s, uv) * -1.0;
  return acc;
}

void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  vec4 a = texture(u_a, uv);
  vec4 b = texture(u_b, uv);
  float S = dot(a, a) + dot(b, b);          // Σ η_j² over all 8 fields
  vec4 la = lap(u_a, uv);
  vec4 lb = lap(u_b, uv);
  // f'(η)=η³−η, plus coupling on (Σ − η_i²) = Σ_{j≠i} η_j², minus κ∇²η.
  vec4 fa = a * a * a - a + ${COUPLING.toFixed(1)} * a * (S - a * a) - u_kappa * la;
  vec4 fb = b * b * b - b + ${COUPLING.toFixed(1)} * b * (S - b * b) - u_kappa * lb;
  outA = clamp(a - u_dt * fa, 0.0, 1.0);    // L folded into u_dt
  outB = clamp(b - u_dt * fb, 0.0, 1.0);
}`

// argmax over the 8 fields → (label, top value). Shared by DISPLAY and MEASURE.
const ARGMAX_GLSL = `
void argmax(vec2 uv, out float lbl, out float m1) {
  vec4 a = texture(u_a, uv);
  vec4 b = texture(u_b, uv);
  m1 = a.x; lbl = 0.0;
  if (a.y > m1) { m1 = a.y; lbl = 1.0; }
  if (a.z > m1) { m1 = a.z; lbl = 2.0; }
  if (a.w > m1) { m1 = a.w; lbl = 3.0; }
  if (b.x > m1) { m1 = b.x; lbl = 4.0; }
  if (b.y > m1) { m1 = b.y; lbl = 5.0; }
  if (b.z > m1) { m1 = b.z; lbl = 6.0; }
  if (b.w > m1) { m1 = b.w; lbl = 7.0; }
}`

// DISPLAY: sample both state textures in normalized UV (stretch sim → screen), take
// the argmax field as the grain label → color via the LUT, and darken where the top
// field dips (an interface between grains) into anti-aliased curved walls. Because
// the field is smooth float data, the walls stay crisp at any canvas size — the
// whole point over an integer-label lattice. Opaque to screen.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform sampler2D u_lut;
uniform vec2  u_texel;      // 1/screenSize
uniform vec3  u_wallColor;
uniform float u_wallThresh; // interior cutoff (higher = thicker walls)
uniform float u_wallSoft;   // anti-alias band
uniform float u_wallContrast;
out vec4 fragColor;
${ARGMAX_GLSL}
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  float lbl, m1;
  argmax(uv, lbl, m1);
  vec3 grain = texture(u_lut, vec2((lbl + 0.5) / 8.0, 0.5)).rgb;
  // interior→1 deep in a grain (m1≈1), →0 at a wall (m1≈0.5); smooth = anti-aliased.
  float interior = smoothstep(u_wallThresh - u_wallSoft, u_wallThresh, m1);
  float wall = (1.0 - interior) * u_wallContrast;
  fragColor = vec4(mix(grain, u_wallColor, wall), 1.0);
}`

// MEASURE: render a tiny wall-mask (1 = interface, 0 = interior) so a cheap readback
// can estimate the coarsening progress. Samples the field in normalized UV too.
const MEASURE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform vec2  u_texel;
uniform float u_level;
out vec4 fragColor;
${ARGMAX_GLSL}
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  float lbl, m1;
  argmax(uv, lbl, m1);
  fragColor = vec4(m1 < u_level ? 1.0 : 0.0, 0.0, 0.0, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src); gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh)
    throw new Error(`Foam shader compile failed: ${log}`)
  }
  return sh
}

function link(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc)
  let fs: WebGLShader
  try { fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc) }
  catch (e) { gl.deleteShader(vs); throw e }
  const prog = gl.createProgram()!
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
  gl.deleteShader(vs); gl.deleteShader(fs)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog); gl.deleteProgram(prog)
    throw new Error(`Foam program link failed: ${log}`)
  }
  return prog
}

function makeTex(
  gl: WebGL2RenderingContext, w: number, h: number,
  internal: number, format: number, type: number,
  filter: number, wrap: number, data: ArrayBufferView | null,
): WebGLTexture {
  const t = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap)
  return t
}

/** FBO with two color attachments (MRT) so one sim pass writes both state textures.
 *  drawBuffers is per-FBO state, set once here — guarded (`?.`) so the jsdom mock,
 *  which has no drawBuffers, still runs setup(). */
function fboMRT(gl: WebGL2RenderingContext, texA: WebGLTexture, texB: WebGLTexture): WebGLFramebuffer {
  const fb = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texA, 0)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, texB, 0)
  gl.drawBuffers?.([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
  return fb
}

function fboFor(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const fb = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  return fb
}

export type FoamGL = {
  simProg: WebGLProgram
  displayProg: WebGLProgram
  measureProg: WebGLProgram
  vao: WebGLVertexArrayObject
  aTex: [WebGLTexture, WebGLTexture]   // ping-pong, fields 0–3
  bTex: [WebGLTexture, WebGLTexture]   // ping-pong, fields 4–7
  fbo: [WebGLFramebuffer, WebGLFramebuffer]
  lutTex: WebGLTexture
  measureTex: WebGLTexture
  measureFbo: WebGLFramebuffer
  measureBuf: Uint8Array               // reused readback target
  simW: number
  simH: number
  cur: number        // current ping-pong index
  stepAcc: number    // fractional steps-per-frame accumulator
  totalSteps: number // steps since last reseed
  lastMeasure: number
  cycle: number      // reseed cycle index
  seed: number       // base seed (reseed derives per-cycle seeds)
  wallColorRgb: [number, number, number] // cached hexToRgb(cfg.wallColor) — frame-invariant
  locs: {
    sim: Record<string, WebGLUniformLocation | null>
    display: Record<string, WebGLUniformLocation | null>
    measure: Record<string, WebGLUniformLocation | null>
  }
}

export function initGL(gl: WebGL2RenderingContext, cfg: FoamConfig, w: number, h: number): FoamGL {
  // EXT_color_buffer_float makes RGBA32F color-renderable — including as the two MRT
  // attachments the sim writes (WebGL2 covers multi-attachment float draw here).
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('Foam requires float render targets (EXT_color_buffer_float)')
  }
  // RGBA32F is LINEAR-filterable only with this extension; without it a float32 tex
  // set to LINEAR is texture-incomplete and every sample returns 0 (a dead field).
  // Fall back to NEAREST (functional, blockier display stretch) where it's absent.
  const stateFilter = gl.getExtension('OES_texture_float_linear') ? gl.LINEAR : gl.NEAREST
  const simProg = link(gl, TRI_VERT, SIM_FRAG)
  const displayProg = link(gl, TRI_VERT, DISPLAY_FRAG)
  const measureProg = link(gl, TRI_VERT, MEASURE_FRAG)
  const vao = gl.createVertexArray()!

  const { sw: simW, sh: simH } = simDims(w, h)
  const { a, b } = seedFoam(cfg.seed, simW, simH)
  // REPEAT wrap → the froth tiles seamlessly (a boundless soap film), and the
  // white-noise seed is periodic so no edge seam forms.
  const aTex: [WebGLTexture, WebGLTexture] = [
    makeTex(gl, simW, simH, gl.RGBA32F, gl.RGBA, gl.FLOAT, stateFilter, gl.REPEAT, a),
    makeTex(gl, simW, simH, gl.RGBA32F, gl.RGBA, gl.FLOAT, stateFilter, gl.REPEAT, null),
  ]
  const bTex: [WebGLTexture, WebGLTexture] = [
    makeTex(gl, simW, simH, gl.RGBA32F, gl.RGBA, gl.FLOAT, stateFilter, gl.REPEAT, b),
    makeTex(gl, simW, simH, gl.RGBA32F, gl.RGBA, gl.FLOAT, stateFilter, gl.REPEAT, null),
  ]
  const fbo: [WebGLFramebuffer, WebGLFramebuffer] = [
    fboMRT(gl, aTex[0], bTex[0]),
    fboMRT(gl, aTex[1], bTex[1]),
  ]

  const measureTex = makeTex(gl, MEASURE_SIDE, MEASURE_SIDE, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST, gl.CLAMP_TO_EDGE, null)
  const measureFbo = fboFor(gl, measureTex)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  const lutTex = makeTex(gl, 256, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE, buildLUT(cfg.stops))

  const u = (p: WebGLProgram, names: string[]) =>
    Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]))
  const locs = {
    sim: u(simProg, ['u_a', 'u_b', 'u_texel', 'u_kappa', 'u_dt']),
    display: u(displayProg, ['u_a', 'u_b', 'u_lut', 'u_texel', 'u_wallColor', 'u_wallThresh', 'u_wallSoft', 'u_wallContrast']),
    measure: u(measureProg, ['u_a', 'u_b', 'u_texel', 'u_level']),
  }
  return {
    simProg, displayProg, measureProg, vao, aTex, bTex, fbo, lutTex,
    measureTex, measureFbo, measureBuf: new Uint8Array(MEASURE_SIDE * MEASURE_SIDE * 4),
    simW, simH, cur: 0, stepAcc: 0, totalSteps: 0, lastMeasure: 0, cycle: 0, seed: cfg.seed,
    wallColorRgb: hexToRgb(cfg.wallColor), locs,
  }
}

/** Refresh the cached wall-colour uniform — call whenever cfg.wallColor edits. */
export function refreshWallColor(res: FoamGL, cfg: FoamConfig): void {
  res.wallColorRgb = hexToRgb(cfg.wallColor)
}

export function uploadLUT(gl: WebGL2RenderingContext, res: FoamGL, stops: string[]): void {
  gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLUT(stops))
}

export function disposeGL(gl: WebGL2RenderingContext, res: FoamGL): void {
  for (const p of [res.simProg, res.displayProg, res.measureProg]) gl.deleteProgram(p)
  gl.deleteVertexArray(res.vao)
  for (const t of [...res.aTex, ...res.bTex, res.lutTex, res.measureTex]) gl.deleteTexture(t)
  for (const f of [...res.fbo, res.measureFbo]) gl.deleteFramebuffer(f)
}

function fullscreen(gl: WebGL2RenderingContext, res: FoamGL) {
  gl.bindVertexArray(res.vao)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

/** Re-noise the current state textures from a fresh per-cycle seed, restarting the
 *  coarsening story. Cheap (no GPU readback), rare (once the froth has coarsened).
 *  The per-cycle seed keeps the whole run deterministic. */
function reseed(gl: WebGL2RenderingContext, res: FoamGL): void {
  res.cycle++
  res.totalSteps = 0
  res.lastMeasure = 0
  const { a, b } = seedFoam((res.seed + res.cycle * 7919) >>> 0, res.simW, res.simH)
  gl.bindTexture(gl.TEXTURE_2D, res.aTex[res.cur])
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, res.simW, res.simH, gl.RGBA, gl.FLOAT, a)
  gl.bindTexture(gl.TEXTURE_2D, res.bTex[res.cur])
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, res.simW, res.simH, gl.RGBA, gl.FLOAT, b)
}

/** One Allen–Cahn step: render (a,b)[src] → (a,b)[dst] via the MRT sim program. */
export function step(gl: WebGL2RenderingContext, res: FoamGL, cfg: FoamConfig): void {
  const src = res.cur, dst = src ^ 1
  const kappa = kappaFor(cfg.cellScale)
  res.totalSteps++
  gl.disable(gl.BLEND)
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo[dst])
  gl.viewport(0, 0, res.simW, res.simH)
  gl.useProgram(res.simProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.aTex[src])
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, res.bTex[src])
  gl.uniform1i(res.locs.sim.u_a, 0)
  gl.uniform1i(res.locs.sim.u_b, 1)
  gl.uniform2f(res.locs.sim.u_texel, 1 / res.simW, 1 / res.simH)
  gl.uniform1f(res.locs.sim.u_kappa, kappa)
  gl.uniform1f(res.locs.sim.u_dt, dtFor(kappa))
  fullscreen(gl, res)
  res.cur = dst
}

/** Wall-fraction of the current field via the MEASURE pass + a small readback:
 *  fraction of the MEASURE_SIDE² samples that sit on an interface. Monotonically
 *  decreasing as the froth coarsens. */
function measureWallFraction(gl: WebGL2RenderingContext, res: FoamGL): number {
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.measureFbo)
  gl.viewport(0, 0, MEASURE_SIDE, MEASURE_SIDE)
  gl.useProgram(res.measureProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.aTex[res.cur])
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, res.bTex[res.cur])
  gl.uniform1i(res.locs.measure.u_a, 0)
  gl.uniform1i(res.locs.measure.u_b, 1)
  gl.uniform2f(res.locs.measure.u_texel, 1 / MEASURE_SIDE, 1 / MEASURE_SIDE)
  gl.uniform1f(res.locs.measure.u_level, WALL_LEVEL)
  fullscreen(gl, res)
  gl.readPixels(0, 0, MEASURE_SIDE, MEASURE_SIDE, gl.RGBA, gl.UNSIGNED_BYTE, res.measureBuf)
  let sum = 0
  for (let i = 0; i < res.measureBuf.length; i += 4) sum += res.measureBuf[i]
  return sum / 255 / (MEASURE_SIDE * MEASURE_SIDE)
}

/** Advance cfg.simSpeed sub-steps/frame (fractional — a rate below 1 runs a step
 *  only every few frames; the remainder carries forward so the long-run rate is
 *  exact), reseed once the froth has coarsened away, then display the field. */
export function render(gl: WebGL2RenderingContext, res: FoamGL, cfg: FoamConfig): void {
  res.stepAcc += cfg.simSpeed
  const steps = Math.floor(res.stepAcc)
  res.stepAcc -= steps
  for (let i = 0; i < steps; i++) step(gl, res, cfg)

  if (res.totalSteps >= SAFETY_STEPS) {
    reseed(gl, res)
  } else if (res.totalSteps - res.lastMeasure >= MEASURE_INTERVAL) {
    res.lastMeasure = res.totalSteps
    if (res.totalSteps >= MIN_STEPS_SINCE_RESEED && measureWallFraction(gl, res) < RESEED_WALL_FRAC) {
      reseed(gl, res)
    }
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.useProgram(res.displayProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.aTex[res.cur])
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, res.bTex[res.cur])
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.uniform1i(res.locs.display.u_a, 0)
  gl.uniform1i(res.locs.display.u_b, 1)
  gl.uniform1i(res.locs.display.u_lut, 2)
  gl.uniform2f(res.locs.display.u_texel, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight)
  const [wr, wg, wb] = res.wallColorRgb
  gl.uniform3f(res.locs.display.u_wallColor, wr, wg, wb)
  // wallThickness 0..1 → interior cutoff 0.6..0.92 (higher = more pixels read as
  // wall = thicker) + a proportional anti-alias band.
  const thresh = 0.6 + 0.32 * cfg.wallThickness
  const soft = 0.1 + 0.14 * cfg.wallThickness
  gl.uniform1f(res.locs.display.u_wallThresh, thresh)
  gl.uniform1f(res.locs.display.u_wallSoft, soft)
  gl.uniform1f(res.locs.display.u_wallContrast, cfg.wallContrast)
  fullscreen(gl, res)
}
