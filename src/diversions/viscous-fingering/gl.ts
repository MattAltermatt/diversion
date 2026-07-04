import { simDims, seedField, buildLUT, FEED, DU, VMAX, killFor, dvFor } from './field'
import { hexToRgb } from '../../framework/color'
import type { ViscousFingeringConfig } from './schema'

// Injection source radius, in normalized UV (a small central disc). The invading
// fluid is continuously forced in here so the fingers grow OUTWARD from a point.
const INJ_RADIUS = 0.02
// Screensaver reseed loop: after this many sim sub-steps the field has filled, so
// clear it and re-inject from the centre with a fresh perturbation phase, restarting
// the outward-growth story. 🎚️ generous so most viewing is active growth.
const RESEED_STEPS = 24000
// Arrival clock: advanced per sub-step; stamped into a cell when it is first
// invaded, so the display can colour by front age. AGE_SCALE maps one reseed cycle
// worth of clock onto 0..1.
const CLOCK_PER_STEP = 0.0006
const AGE_SCALE = 1 / (RESEED_STEPS * CLOCK_PER_STEP)

const TRI_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// SIM: one reaction-diffusion step with a central injection source. High V = the
// invading (less-viscous) fluid; the front is unstable because the U·V² reaction
// runs fastest where V is already dense (positive feedback), while V-diffusion
// (surface tension) smooths the tip — Saffman–Taylor fingering.
const SIM_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_state;   // RGBA32F (U, V, arrival, 1)
uniform vec2  u_texel;       // 1/simSize
uniform float u_kill;
uniform float u_dv;          // V diffusion (surface tension → finger width)
uniform float u_noise;       // front perturbation (tip-splitting)
uniform float u_inject;      // injection strength 0..1
uniform float u_clock;       // arrival stamp clock
uniform float u_phase;       // drifting noise phase (per-cycle + per-time)
out vec4 fragColor;

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec2 lap(vec2 uv){
  vec2 s = vec2(0.0);
  s += texture(u_state, uv + vec2(-1.0, 0.0) * u_texel).xy * 0.2;
  s += texture(u_state, uv + vec2( 1.0, 0.0) * u_texel).xy * 0.2;
  s += texture(u_state, uv + vec2( 0.0,-1.0) * u_texel).xy * 0.2;
  s += texture(u_state, uv + vec2( 0.0, 1.0) * u_texel).xy * 0.2;
  s += texture(u_state, uv + vec2(-1.0,-1.0) * u_texel).xy * 0.05;
  s += texture(u_state, uv + vec2( 1.0,-1.0) * u_texel).xy * 0.05;
  s += texture(u_state, uv + vec2(-1.0, 1.0) * u_texel).xy * 0.05;
  s += texture(u_state, uv + vec2( 1.0, 1.0) * u_texel).xy * 0.05;
  s += texture(u_state, uv).xy * -1.0;
  return s;
}
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  vec4 st = texture(u_state, uv);
  float u = st.x, v = st.y, arrival = st.z;
  vec2 l = lap(uv);
  float reaction = u * v * v;
  // micro-roughness on the reaction seeds the interface instability so a smooth
  // ring breaks into branching fingers and keeps tip-splitting.
  float n = vnoise(gl_FragCoord.xy * 0.15 + u_phase) - 0.5;
  reaction *= (1.0 + u_noise * 2.0 * n);
  float du = ${DU.toFixed(1)} * l.x - reaction + ${FEED.toFixed(4)} * (1.0 - u);
  float dv = u_dv * l.y + reaction - (u_kill + ${FEED.toFixed(4)}) * v;
  float nu = clamp(u + du, 0.0, 1.0);
  float nv = clamp(v + dv, 0.0, 1.0);
  // central injection source — force invading fluid in, driving outward growth.
  float d = distance(uv, vec2(0.5));
  if (d < ${INJ_RADIUS.toFixed(3)}) {
    float k = u_inject * smoothstep(${INJ_RADIUS.toFixed(3)}, 0.0, d);
    nu = mix(nu, 0.5, k);
    nv = mix(nv, 0.35, k);
  }
  // stamp arrival time on first invasion; clear it if the cell recedes.
  if (arrival <= 0.0 && nv > 0.2) arrival = max(u_clock, 1e-4);
  if (nv <= 0.05) arrival = 0.0;
  fragColor = vec4(nu, nv, arrival, 1.0);
}`

// DISPLAY: sample the field in normalized UV (stretches sim → screen), colour the
// invading fluid via the LUT (by concentration or by front age), composite over the
// chosen background. Opaque to screen.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform sampler2D u_lut;
uniform vec2  u_texel;   // 1/screenSize
uniform vec3  u_bg;
uniform float u_clock;
uniform int   u_mode;    // 0 = concentration, 1 = arrival
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  vec4 st = texture(u_state, uv);
  float v = st.y, arrival = st.z;
  float tphase = clamp(v / ${VMAX.toFixed(2)}, 0.0, 1.0);
  float idx = tphase;
  if (u_mode == 1) {
    float age = clamp((u_clock - arrival) * ${AGE_SCALE.toFixed(5)}, 0.0, 1.0);
    idx = (arrival > 0.0) ? clamp(1.0 - age, 0.0, 1.0) : 0.0; // fresh tips = bright
  }
  vec3 ramp = texture(u_lut, vec2(idx, 0.5)).rgb;
  float alpha = smoothstep(0.03, 0.16, tphase); // invaded mask from V
  fragColor = vec4(mix(u_bg, ramp, alpha), 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src); gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh)
    throw new Error(`Viscous Fingering shader compile failed: ${log}`)
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
    throw new Error(`Viscous Fingering program link failed: ${log}`)
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

function fboFor(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const fb = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  return fb
}

export type ViscousFingeringGL = {
  simProg: WebGLProgram
  displayProg: WebGLProgram
  vao: WebGLVertexArrayObject
  stateTex: [WebGLTexture, WebGLTexture]   // ping-pong (U, V, arrival)
  stateFbo: [WebGLFramebuffer, WebGLFramebuffer]
  lutTex: WebGLTexture
  simW: number
  simH: number
  cur: number       // current ping-pong index
  stepAcc: number   // fractional steps-per-frame accumulator (speed < 1)
  totalSteps: number // steps since last reseed
  clock: number      // arrival clock (reset each reseed)
  cycle: number      // reseed cycle index (feeds the noise phase so cycles differ)
  seed: number       // base seed (reseed derives per-cycle seeds from it)
  locs: {
    sim: Record<string, WebGLUniformLocation | null>
    display: Record<string, WebGLUniformLocation | null>
  }
}

export function initGL(gl: WebGL2RenderingContext, cfg: ViscousFingeringConfig, w: number, h: number): ViscousFingeringGL {
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('Viscous Fingering requires float render targets (EXT_color_buffer_float)')
  }
  // RGBA32F is color-renderable via the extension above, but LINEAR-filterable
  // ONLY with this one — without it a float32 texture set to LINEAR is
  // texture-incomplete and every texture() sample returns 0 (a dead field). Fall
  // back to NEAREST (functional, blockier display stretch) where it's absent.
  const stateFilter = gl.getExtension('OES_texture_float_linear') ? gl.LINEAR : gl.NEAREST
  const simProg = link(gl, TRI_VERT, SIM_FRAG)
  const displayProg = link(gl, TRI_VERT, DISPLAY_FRAG)
  const vao = gl.createVertexArray()!

  const { sw: simW, sh: simH } = simDims(w, h)
  const seed = seedField(cfg.seed, simW, simH)
  // CLAMP_TO_EDGE (not toroidal) → the structure reads as a bounded blob growing
  // outward from the centre, not a tiling pattern.
  const stateTex: [WebGLTexture, WebGLTexture] = [
    makeTex(gl, simW, simH, gl.RGBA32F, gl.RGBA, gl.FLOAT, stateFilter, gl.CLAMP_TO_EDGE, seed),
    makeTex(gl, simW, simH, gl.RGBA32F, gl.RGBA, gl.FLOAT, stateFilter, gl.CLAMP_TO_EDGE, null),
  ]
  const stateFbo: [WebGLFramebuffer, WebGLFramebuffer] = [fboFor(gl, stateTex[0]), fboFor(gl, stateTex[1])]
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  const lutTex = makeTex(gl, 256, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE, buildLUT(cfg.palette))

  const u = (p: WebGLProgram, names: string[]) =>
    Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]))
  const locs = {
    sim: u(simProg, ['u_state', 'u_texel', 'u_kill', 'u_dv', 'u_noise', 'u_inject', 'u_clock', 'u_phase']),
    display: u(displayProg, ['u_state', 'u_lut', 'u_texel', 'u_bg', 'u_clock', 'u_mode']),
  }
  return {
    simProg, displayProg, vao, stateTex, stateFbo, lutTex, simW, simH,
    cur: 0, stepAcc: 0, totalSteps: 0, clock: 0, cycle: 0, seed: cfg.seed, locs,
  }
}

export function uploadLUT(gl: WebGL2RenderingContext, res: ViscousFingeringGL, stops: string[]): void {
  gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLUT(stops))
}

export function disposeGL(gl: WebGL2RenderingContext, res: ViscousFingeringGL): void {
  for (const p of [res.simProg, res.displayProg]) gl.deleteProgram(p)
  gl.deleteVertexArray(res.vao)
  for (const t of [...res.stateTex, res.lutTex]) gl.deleteTexture(t)
  for (const f of res.stateFbo) gl.deleteFramebuffer(f)
}

function fullscreen(gl: WebGL2RenderingContext, res: ViscousFingeringGL) {
  gl.bindVertexArray(res.vao)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

/** Clear + re-seed the current state texture from the centre with a per-cycle seed,
 *  restarting the outward-growth story. Cheap (no GPU readback); rare (once per
 *  RESEED_STEPS). The per-cycle seed keeps the whole run deterministic. */
function reseed(gl: WebGL2RenderingContext, res: ViscousFingeringGL): void {
  res.cycle++
  res.totalSteps = 0
  res.clock = 0
  const data = seedField((res.seed + res.cycle * 7919) >>> 0, res.simW, res.simH)
  gl.bindTexture(gl.TEXTURE_2D, res.stateTex[res.cur])
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, res.simW, res.simH, gl.RGBA, gl.FLOAT, data)
}

/** One reaction-diffusion step: render src→dst over the state field. */
export function step(gl: WebGL2RenderingContext, res: ViscousFingeringGL, cfg: ViscousFingeringConfig): void {
  const src = res.cur, dst = src ^ 1
  res.clock += CLOCK_PER_STEP
  res.totalSteps++
  gl.disable(gl.BLEND)
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.stateFbo[dst])
  gl.viewport(0, 0, res.simW, res.simH)
  gl.useProgram(res.simProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.stateTex[src])
  gl.uniform1i(res.locs.sim.u_state, 0)
  gl.uniform2f(res.locs.sim.u_texel, 1 / res.simW, 1 / res.simH)
  gl.uniform1f(res.locs.sim.u_kill, killFor(cfg.viscosityRatio))
  gl.uniform1f(res.locs.sim.u_dv, dvFor(cfg.surfaceTension))
  gl.uniform1f(res.locs.sim.u_noise, cfg.noise)
  gl.uniform1f(res.locs.sim.u_inject, cfg.injectionRate)
  gl.uniform1f(res.locs.sim.u_clock, res.clock)
  gl.uniform1f(res.locs.sim.u_phase, res.clock * 4.0 + res.cycle * 50.0)
  fullscreen(gl, res)
  res.cur = dst
}

/** Advance cfg.simSpeed steps-per-frame (fractional: a rate below 1 runs a step only
 *  every few frames; the remainder carries forward so the long-run rate is exact),
 *  reseed if the field has filled, then display the current field to the screen. */
export function render(gl: WebGL2RenderingContext, res: ViscousFingeringGL, cfg: ViscousFingeringConfig): void {
  res.stepAcc += cfg.simSpeed
  const steps = Math.floor(res.stepAcc)
  res.stepAcc -= steps
  for (let i = 0; i < steps; i++) step(gl, res, cfg)
  if (res.totalSteps >= RESEED_STEPS) reseed(gl, res)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.useProgram(res.displayProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.stateTex[res.cur])
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.uniform1i(res.locs.display.u_state, 0)
  gl.uniform1i(res.locs.display.u_lut, 1)
  gl.uniform2f(res.locs.display.u_texel, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight)
  const [br, bg, bb] = hexToRgb(cfg.background)
  gl.uniform3f(res.locs.display.u_bg, br, bg, bb)
  gl.uniform1f(res.locs.display.u_clock, res.clock)
  gl.uniform1i(res.locs.display.u_mode, cfg.colorMode === 'arrival' ? 1 : 0)
  fullscreen(gl, res)
}
