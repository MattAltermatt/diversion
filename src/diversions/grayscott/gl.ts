import { simDims, seedField, buildLUT } from './field'
import type { GrayScottConfig } from './schema'

// Gray-Scott constants (Karl Sims regime — pairs with the feed/kill preset table).
// 🎚️ confirm at verify. 9-point Laplacian: ortho 0.2, diag 0.05, center -1.
const DU = 1.0, DV = 0.5, DT = 1.0
// V rarely exceeds ~0.4; normalize by this before the LUT lookup for contrast.
const VMAX = 0.4

const TRI_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// SIM: one update step of the Gray-Scott reaction-diffusion system.
const SIM_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_state;   // RGBA32F (U,V,_,_)
uniform vec2  u_texel;       // 1/simSize
uniform float u_feed;
uniform float u_kill;
out vec4 fragColor;
vec2 lap(vec2 uv) {
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
  vec2 st = texture(u_state, uv).xy;
  float u = st.x, v = st.y;
  vec2 l = lap(uv);
  float reaction = u * v * v;
  float du = ${DU.toFixed(1)} * l.x - reaction + u_feed * (1.0 - u);
  float dv = ${DV.toFixed(1)} * l.y + reaction - (u_kill + u_feed) * v;
  float nu = clamp(u + du * ${DT.toFixed(1)}, 0.0, 1.0);
  float nv = clamp(v + dv * ${DT.toFixed(1)}, 0.0, 1.0);
  fragColor = vec4(nu, nv, 0.0, 1.0);
}`

// DISPLAY: sample V in normalized UV (stretches sim field to fill canvas),
// normalize, index the gradient LUT, opaque to screen.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform sampler2D u_lut;
uniform vec2  u_texel;   // 1/screenSize
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  float v = texture(u_state, uv).y;
  float t = clamp(v / ${VMAX.toFixed(2)}, 0.0, 1.0);
  vec3 col = texture(u_lut, vec2(t, 0.5)).rgb;
  fragColor = vec4(col, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src); gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh)
    throw new Error(`Gray-Scott shader compile failed: ${log}`)
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
    throw new Error(`Gray-Scott program link failed: ${log}`)
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

export type GrayScottGL = {
  simProg: WebGLProgram
  displayProg: WebGLProgram
  vao: WebGLVertexArrayObject
  stateTex: [WebGLTexture, WebGLTexture]   // ping-pong (U,V)
  stateFbo: [WebGLFramebuffer, WebGLFramebuffer]
  lutTex: WebGLTexture
  simW: number
  simH: number
  cur: number                              // current ping-pong index
  stepAcc: number                          // fractional steps-per-frame accumulator (speed < 1)
  locs: {
    sim: Record<string, WebGLUniformLocation | null>
    display: Record<string, WebGLUniformLocation | null>
  }
}

export function initGL(gl: WebGL2RenderingContext, cfg: GrayScottConfig, w: number, h: number): GrayScottGL {
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('Gray-Scott requires float render targets (EXT_color_buffer_float)')
  }
  // RGBA32F is color-renderable via the extension above, but LINEAR-filterable
  // ONLY if this one is enabled — without it a float32 texture set to LINEAR is
  // texture-incomplete and every texture() sample returns 0 (dead field). Fall
  // back to NEAREST (functional, blockier display stretch) where it's absent.
  const stateFilter = gl.getExtension('OES_texture_float_linear') ? gl.LINEAR : gl.NEAREST
  const simProg = link(gl, TRI_VERT, SIM_FRAG)
  const displayProg = link(gl, TRI_VERT, DISPLAY_FRAG)
  const vao = gl.createVertexArray()!

  const { sw: simW, sh: simH } = simDims(w, h)
  const seed = seedField(cfg.seed, simW, simH)
  // REPEAT wrap → patterns tile seamlessly (toroidal), matching seedField's
  // toroidal patches; LINEAR so the display pass stretches the field smoothly
  // (neighbor taps land on texel centers, so the sim reads stay exact).
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
    sim: u(simProg, ['u_state', 'u_texel', 'u_feed', 'u_kill']),
    display: u(displayProg, ['u_state', 'u_lut', 'u_texel']),
  }
  return { simProg, displayProg, vao, stateTex, stateFbo, lutTex, simW, simH, cur: 0, stepAcc: 0, locs }
}

export function uploadLUT(gl: WebGL2RenderingContext, res: GrayScottGL, stops: string[]): void {
  gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLUT(stops))
}

export function disposeGL(gl: WebGL2RenderingContext, res: GrayScottGL): void {
  for (const p of [res.simProg, res.displayProg]) gl.deleteProgram(p)
  gl.deleteVertexArray(res.vao)
  for (const t of [...res.stateTex, res.lutTex]) gl.deleteTexture(t)
  for (const f of res.stateFbo) gl.deleteFramebuffer(f)
}

function fullscreen(gl: WebGL2RenderingContext, res: GrayScottGL) {
  gl.bindVertexArray(res.vao)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

/** One reaction-diffusion step: render src→dst over the state field. */
export function step(gl: WebGL2RenderingContext, res: GrayScottGL, cfg: GrayScottConfig): void {
  const src = res.cur, dst = src ^ 1
  gl.disable(gl.BLEND)
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.stateFbo[dst])
  gl.viewport(0, 0, res.simW, res.simH)
  gl.useProgram(res.simProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.stateTex[src])
  gl.uniform1i(res.locs.sim.u_state, 0)
  gl.uniform2f(res.locs.sim.u_texel, 1 / res.simW, 1 / res.simH)
  gl.uniform1f(res.locs.sim.u_feed, cfg.feed)
  gl.uniform1f(res.locs.sim.u_kill, cfg.kill)
  fullscreen(gl, res)
  res.cur = dst
}

/** Advance cfg.simSpeed steps-per-frame (fractional: a rate below 1 runs a step
 *  only every few frames for a calm drift; the remainder carries forward so the
 *  long-run rate is exact), then display the current field to the screen. */
export function render(gl: WebGL2RenderingContext, res: GrayScottGL, cfg: GrayScottConfig): void {
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
