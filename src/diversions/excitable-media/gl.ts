import { simDims, seedField, buildLUT } from './field'
import type { ExcitableMediaConfig } from './schema'

const TRI_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// SIM: one step of the Gerhardt-Schuster "hodgepodge machine" — a cellular model
// of the Belousov-Zhabotinsky reaction that reliably fills with spiral + target
// waves. R holds the integer excitation 0..q (0 = healthy/rest, q = ill/crest),
// G holds the display intensity (state/q).
//   healthy (0):  s' = floor(A/k1) + floor(B/k2)
//   ill (q):      s' = 0                              (recovers to rest)
//   infected:     s' = floor(SUM/(A+B+1)) + g         (climbs toward the crest)
// where A = #infected neighbours, B = #ill neighbours, SUM = state of self + 8
// neighbours (Moore). Result clamped to [0, q].
const SIM_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform vec2  u_texel;
uniform float u_q;    // recovery ceiling (states)
uniform float u_k1;   // infection rate  (from infected neighbours)
uniform float u_k2;   // contagion rate  (from ill neighbours)
uniform float u_g;    // wave speed      (climb increment)
out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  float q = u_q;
  float self = texture(u_state, uv).x;

  float A = 0.0;   // infected neighbours (1..q-1)
  float B = 0.0;   // ill neighbours (== q)
  float sum = self;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dy == 0) continue;
      float v = texture(u_state, uv + vec2(float(dx), float(dy)) * u_texel).x;
      sum += v;
      if (v > q - 0.5) B += 1.0;
      else if (v > 0.5) A += 1.0;
    }
  }

  float ns;
  if (self < 0.5) {
    ns = floor(A / u_k1) + floor(B / u_k2);      // healthy → catch the wave
  } else if (self > q - 0.5) {
    ns = 0.0;                                     // ill → recover to rest
  } else {
    ns = floor(sum / (A + B + 1.0)) + u_g;        // infected → climb to crest
  }
  ns = clamp(ns, 0.0, q);

  fragColor = vec4(ns, ns / q, 0.0, 1.0);
}`

// DISPLAY: sample the intensity channel (LINEAR-smoothed), gamma-shape it, index
// the gradient LUT. Opaque to screen.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform sampler2D u_lut;
uniform vec2  u_texel;   // 1/screenSize
uniform float u_gamma;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  float inten = texture(u_state, uv).y;
  float f = pow(clamp(inten, 0.0, 1.0), u_gamma);
  vec3 col = texture(u_lut, vec2(f, 0.5)).rgb;
  fragColor = vec4(col, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src); gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh)
    throw new Error(`Excitable Media shader compile failed: ${log}`)
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
    throw new Error(`Excitable Media program link failed: ${log}`)
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

export type ExcitableGL = {
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

export function initGL(gl: WebGL2RenderingContext, cfg: ExcitableMediaConfig, w: number, h: number): ExcitableGL {
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('Excitable Media requires float render targets (EXT_color_buffer_float)')
  }
  // LINEAR on the intensity channel upsamples the discrete grid to smooth spirals;
  // float32 is only LINEAR-filterable with this extension, else the texture is
  // incomplete and every sample reads 0 (dead field). NEAREST fallback works too.
  const stateFilter = gl.getExtension('OES_texture_float_linear') ? gl.LINEAR : gl.NEAREST
  const simProg = link(gl, TRI_VERT, SIM_FRAG)
  const displayProg = link(gl, TRI_VERT, DISPLAY_FRAG)
  const vao = gl.createVertexArray()!

  const { sw: simW, sh: simH } = simDims(w, h)
  const seed = seedField(cfg.seed, simW, simH, cfg.states)
  // REPEAT wrap → toroidal field, spirals never hit an edge.
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
    sim: u(simProg, ['u_state', 'u_texel', 'u_q', 'u_k1', 'u_k2', 'u_g']),
    display: u(displayProg, ['u_state', 'u_lut', 'u_texel', 'u_gamma']),
  }
  return { simProg, displayProg, vao, stateTex, stateFbo, lutTex, simW, simH, cur: 0, stepAcc: 0, locs }
}

export function uploadLUT(gl: WebGL2RenderingContext, res: ExcitableGL, stops: string[]): void {
  gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLUT(stops))
}

export function disposeGL(gl: WebGL2RenderingContext, res: ExcitableGL): void {
  for (const p of [res.simProg, res.displayProg]) gl.deleteProgram(p)
  gl.deleteVertexArray(res.vao)
  for (const t of [...res.stateTex, res.lutTex]) gl.deleteTexture(t)
  for (const f of res.stateFbo) gl.deleteFramebuffer(f)
}

function fullscreen(gl: WebGL2RenderingContext, res: ExcitableGL) {
  gl.bindVertexArray(res.vao)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

/** One hodgepodge step: render src→dst over the state field. */
export function step(gl: WebGL2RenderingContext, res: ExcitableGL, cfg: ExcitableMediaConfig): void {
  const src = res.cur, dst = src ^ 1
  gl.disable(gl.BLEND)
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.stateFbo[dst])
  gl.viewport(0, 0, res.simW, res.simH)
  gl.useProgram(res.simProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.stateTex[src])
  gl.uniform1i(res.locs.sim.u_state, 0)
  gl.uniform2f(res.locs.sim.u_texel, 1 / res.simW, 1 / res.simH)
  gl.uniform1f(res.locs.sim.u_q, cfg.states)
  gl.uniform1f(res.locs.sim.u_k1, cfg.k1)
  gl.uniform1f(res.locs.sim.u_k2, cfg.k2)
  gl.uniform1f(res.locs.sim.u_g, cfg.g)
  fullscreen(gl, res)
  res.cur = dst
}

/** Advance cfg.simSpeed steps-per-frame (fractional carries forward), then display. */
export function render(gl: WebGL2RenderingContext, res: ExcitableGL, cfg: ExcitableMediaConfig): void {
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
  gl.uniform1f(res.locs.display.u_gamma, cfg.gamma)
  fullscreen(gl, res)
}
