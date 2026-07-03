import { simDims, seedField, buildLUT } from './field'
import type { KuramotoConfig } from './schema'

// Per-step integration timestep. simSpeed controls steps/frame; this is the size
// of each Euler step (small enough to stay stable at the max coupling).
const DT = 0.15

const TRI_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// SIM: one step of the locally-coupled Kuramoto model. Each oscillator advances
// by its natural frequency plus a coupling pull toward the mean phase of its 4
// neighbours: dθ = ω + (K/4)·Σ sin(θⱼ − θ). cos/sin are stored so the display can
// LINEAR-interpolate hue seamlessly across the 2π wrap.
const SIM_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_state;  // R=phase, G=omega, B=cos, A=sin
uniform vec2  u_texel;
uniform float u_K;
uniform float u_dt;
out vec4 fragColor;
const float TAU = 6.28318530718;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  vec4 st = texture(u_state, uv);
  float th = st.x, om = st.y;
  float s = 0.0;
  s += sin(texture(u_state, uv + vec2(-1.0, 0.0) * u_texel).x - th);
  s += sin(texture(u_state, uv + vec2( 1.0, 0.0) * u_texel).x - th);
  s += sin(texture(u_state, uv + vec2( 0.0,-1.0) * u_texel).x - th);
  s += sin(texture(u_state, uv + vec2( 0.0, 1.0) * u_texel).x - th);
  float dth = om + u_K * 0.25 * s;
  float nth = mod(th + dth * u_dt, TAU);
  fragColor = vec4(nth, om, cos(nth), sin(nth));
}`

// DISPLAY: hue = atan2(sin, cos) of the LINEAR-smoothed phase vector → cyclic LUT.
// Brightness is modulated by the local phase coherence r = |(cos,sin)| — 1 inside a
// synchronized domain, dropping to 0 at domain walls and phase-defect cores — so
// synced regions glow and a dark web traces the defects.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform sampler2D u_lut;
uniform vec2  u_texel;
out vec4 fragColor;
const float TAU = 6.28318530718;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  vec4 st = texture(u_state, uv);
  float hue = atan(st.a, st.b);      // [-π, π]
  float t = hue / TAU + 0.5;         // [0, 1]
  float r = clamp(length(vec2(st.b, st.a)), 0.0, 1.0); // coherence
  vec3 col = texture(u_lut, vec2(t, 0.5)).rgb * (0.22 + 0.78 * pow(r, 0.7));
  fragColor = vec4(col, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src); gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh)
    throw new Error(`Kuramoto shader compile failed: ${log}`)
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
    throw new Error(`Kuramoto program link failed: ${log}`)
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

export type KuramotoGL = {
  simProg: WebGLProgram
  displayProg: WebGLProgram
  vao: WebGLVertexArrayObject
  stateTex: [WebGLTexture, WebGLTexture]
  stateFbo: [WebGLFramebuffer, WebGLFramebuffer]
  lutTex: WebGLTexture
  simW: number
  simH: number
  cur: number
  stepAcc: number
  locs: {
    sim: Record<string, WebGLUniformLocation | null>
    display: Record<string, WebGLUniformLocation | null>
  }
}

export function initGL(gl: WebGL2RenderingContext, cfg: KuramotoConfig, w: number, h: number): KuramotoGL {
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('Kuramoto requires float render targets (EXT_color_buffer_float)')
  }
  const stateFilter = gl.getExtension('OES_texture_float_linear') ? gl.LINEAR : gl.NEAREST
  const simProg = link(gl, TRI_VERT, SIM_FRAG)
  const displayProg = link(gl, TRI_VERT, DISPLAY_FRAG)
  const vao = gl.createVertexArray()!

  const { sw: simW, sh: simH } = simDims(w, h)
  const seed = seedField(cfg.seed, simW, simH, cfg.spread)
  const stateTex: [WebGLTexture, WebGLTexture] = [
    makeTex(gl, simW, simH, gl.RGBA32F, gl.RGBA, gl.FLOAT, stateFilter, gl.REPEAT, seed),
    makeTex(gl, simW, simH, gl.RGBA32F, gl.RGBA, gl.FLOAT, stateFilter, gl.REPEAT, null),
  ]
  const stateFbo: [WebGLFramebuffer, WebGLFramebuffer] = [fboFor(gl, stateTex[0]), fboFor(gl, stateTex[1])]
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  const lutTex = makeTex(gl, 256, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE, buildLUT(cfg.stops))

  const u = (p: WebGLProgram, names: string[]) =>
    Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]))
  const locs = {
    sim: u(simProg, ['u_state', 'u_texel', 'u_K', 'u_dt']),
    display: u(displayProg, ['u_state', 'u_lut', 'u_texel']),
  }
  return { simProg, displayProg, vao, stateTex, stateFbo, lutTex, simW, simH, cur: 0, stepAcc: 0, locs }
}

export function uploadLUT(gl: WebGL2RenderingContext, res: KuramotoGL, stops: string[]): void {
  gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLUT(stops))
}

export function disposeGL(gl: WebGL2RenderingContext, res: KuramotoGL): void {
  for (const p of [res.simProg, res.displayProg]) gl.deleteProgram(p)
  gl.deleteVertexArray(res.vao)
  for (const t of [...res.stateTex, res.lutTex]) gl.deleteTexture(t)
  for (const f of res.stateFbo) gl.deleteFramebuffer(f)
}

function fullscreen(gl: WebGL2RenderingContext, res: KuramotoGL) {
  gl.bindVertexArray(res.vao)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export function step(gl: WebGL2RenderingContext, res: KuramotoGL, cfg: KuramotoConfig): void {
  const src = res.cur, dst = src ^ 1
  gl.disable(gl.BLEND)
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.stateFbo[dst])
  gl.viewport(0, 0, res.simW, res.simH)
  gl.useProgram(res.simProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.stateTex[src])
  gl.uniform1i(res.locs.sim.u_state, 0)
  gl.uniform2f(res.locs.sim.u_texel, 1 / res.simW, 1 / res.simH)
  gl.uniform1f(res.locs.sim.u_K, cfg.coupling)
  gl.uniform1f(res.locs.sim.u_dt, DT)
  fullscreen(gl, res)
  res.cur = dst
}

export function render(gl: WebGL2RenderingContext, res: KuramotoGL, cfg: KuramotoConfig): void {
  res.stepAcc += cfg.simSpeed
  const steps = Math.floor(res.stepAcc)
  res.stepAcc -= steps
  for (let i = 0; i < steps; i++) step(gl, res, cfg)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.useProgram(res.displayProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.stateTex[res.cur])
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.uniform1i(res.locs.display.u_state, 0)
  gl.uniform1i(res.locs.display.u_lut, 1)
  gl.uniform2f(res.locs.display.u_texel, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight)
  fullscreen(gl, res)
}
