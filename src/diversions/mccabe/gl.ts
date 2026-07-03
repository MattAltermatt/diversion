import { simDims, seedField, buildLUT, computeScales, type ScaleUniforms } from './field'
import type { MccabeConfig } from './schema'

const TRI_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// SIM: one McCabe multi-scale Turing step. Blurs at several radii come free from
// the field's mip pyramid (mip L ≈ a 2^L box average). For each scale we read an
// activator (small blur) and inhibitor (larger blur); the scale with the smallest
// activator/inhibitor difference is the locally "best-fit" one, and the pixel steps
// a small amount toward its activator (up if activator>inhibitor, else down). A
// gentle pull toward the global mean (top mip) keeps the field balanced without a
// separate min/max normalization pass; a final clamp bounds it to [-1,1].
const SIM_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_field;
uniform vec2  u_texel;
uniform float u_actLod[8];
uniform float u_inhLod[8];
uniform float u_amt[8];
uniform int   u_n;
uniform float u_meanLod;
out vec4 fragColor;
// A rounder blur than a bare mip fetch: average 4 diagonal taps offset by half the
// box, which softens the axis-aligned mip-box into an isotropic kernel so the
// patterns curve organically instead of snapping to a rectilinear circuit grid.
float rblur(vec2 uv, float lod) {
  vec2 o = u_texel * exp2(lod) * 0.5;
  return 0.25 * (
    textureLod(u_field, uv + vec2( o.x,  o.y), lod).r +
    textureLod(u_field, uv + vec2(-o.x,  o.y), lod).r +
    textureLod(u_field, uv + vec2( o.x, -o.y), lod).r +
    textureLod(u_field, uv + vec2(-o.x, -o.y), lod).r);
}
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  float v = texture(u_field, uv).r;
  float bestVar = 1e9;
  float delta = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= u_n) break;
    float act = rblur(uv, u_actLod[i]);
    float inh = rblur(uv, u_inhLod[i]);
    float variation = abs(act - inh);
    if (variation < bestVar) {
      bestVar = variation;
      delta = act > inh ? u_amt[i] : -u_amt[i];
    }
  }
  float mean = textureLod(u_field, uv, u_meanLod).r; // ≈ global average
  float nv = clamp((v - mean * 0.06) + delta, -1.0, 1.0);
  fragColor = vec4(nv, 0.0, 0.0, 1.0);
}`

// DISPLAY: value [-1,1] → ramp LUT, sharpened by contrast.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_field;
uniform sampler2D u_lut;
uniform vec2  u_texel;
uniform float u_contrast;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  float v = texture(u_field, uv).r;
  float t = clamp(v * 0.5 * u_contrast + 0.5, 0.0, 1.0);
  fragColor = vec4(texture(u_lut, vec2(t, 0.5)).rgb, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src); gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh)
    throw new Error(`McCabe shader compile failed: ${log}`)
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
    throw new Error(`McCabe program link failed: ${log}`)
  }
  return prog
}

function makeFieldTex(gl: WebGL2RenderingContext, w: number, h: number, data: Float32Array | null): WebGLTexture {
  const t = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, data)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
  gl.generateMipmap(gl.TEXTURE_2D) // allocate the mip chain
  return t
}

function makeLUT(gl: WebGL2RenderingContext, stops: string[]): WebGLTexture {
  const t = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLUT(stops))
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return t
}

function fboFor(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const fb = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  return fb
}

export type MccabeGL = {
  simProg: WebGLProgram
  displayProg: WebGLProgram
  vao: WebGLVertexArrayObject
  fieldTex: [WebGLTexture, WebGLTexture]
  fieldFbo: [WebGLFramebuffer, WebGLFramebuffer]
  lutTex: WebGLTexture
  simW: number
  simH: number
  maxLod: number
  cur: number
  stepAcc: number
  scales: ScaleUniforms
  locs: {
    sim: Record<string, WebGLUniformLocation | null>
    display: Record<string, WebGLUniformLocation | null>
  }
}

export function initGL(gl: WebGL2RenderingContext, cfg: MccabeConfig, w: number, h: number): MccabeGL {
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('McCabe requires float render targets (EXT_color_buffer_float)')
  }
  const simProg = link(gl, TRI_VERT, SIM_FRAG)
  const displayProg = link(gl, TRI_VERT, DISPLAY_FRAG)
  const vao = gl.createVertexArray()!

  const { sw: simW, sh: simH } = simDims(w, h)
  const maxLod = Math.floor(Math.log2(Math.max(1, Math.min(simW, simH))))
  const fieldTex: [WebGLTexture, WebGLTexture] = [
    makeFieldTex(gl, simW, simH, seedField(cfg.seed, simW, simH)),
    makeFieldTex(gl, simW, simH, null),
  ]
  const fieldFbo: [WebGLFramebuffer, WebGLFramebuffer] = [fboFor(gl, fieldTex[0]), fboFor(gl, fieldTex[1])]
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  const lutTex = makeLUT(gl, cfg.palette)

  const u = (p: WebGLProgram, names: string[]) =>
    Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]))
  const locs = {
    sim: u(simProg, ['u_field', 'u_texel', 'u_actLod', 'u_inhLod', 'u_amt', 'u_n', 'u_meanLod']),
    display: u(displayProg, ['u_field', 'u_lut', 'u_texel', 'u_contrast']),
  }
  return {
    simProg, displayProg, vao, fieldTex, fieldFbo, lutTex, simW, simH, maxLod,
    cur: 0, stepAcc: 0, scales: computeScales(cfg.scale, maxLod), locs,
  }
}

export function uploadLUT(gl: WebGL2RenderingContext, res: MccabeGL, stops: string[]): void {
  gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLUT(stops))
}

export function setScale(res: MccabeGL, scale: number): void {
  res.scales = computeScales(scale, res.maxLod)
}

export function disposeGL(gl: WebGL2RenderingContext, res: MccabeGL): void {
  for (const p of [res.simProg, res.displayProg]) gl.deleteProgram(p)
  gl.deleteVertexArray(res.vao)
  for (const t of [...res.fieldTex, res.lutTex]) gl.deleteTexture(t)
  for (const f of res.fieldFbo) gl.deleteFramebuffer(f)
}

function fullscreen(gl: WebGL2RenderingContext, res: MccabeGL) {
  gl.bindVertexArray(res.vao)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

function step(gl: WebGL2RenderingContext, res: MccabeGL): void {
  const src = res.cur, dst = src ^ 1
  gl.disable(gl.BLEND)
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.fieldFbo[dst])
  gl.viewport(0, 0, res.simW, res.simH)
  gl.useProgram(res.simProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.fieldTex[src])
  gl.uniform1i(res.locs.sim.u_field, 0)
  gl.uniform2f(res.locs.sim.u_texel, 1 / res.simW, 1 / res.simH)
  gl.uniform1fv(res.locs.sim.u_actLod, res.scales.actLod)
  gl.uniform1fv(res.locs.sim.u_inhLod, res.scales.inhLod)
  gl.uniform1fv(res.locs.sim.u_amt, res.scales.amt)
  gl.uniform1i(res.locs.sim.u_n, res.scales.n)
  gl.uniform1f(res.locs.sim.u_meanLod, res.maxLod)
  fullscreen(gl, res)
  // refresh the mip pyramid of the freshly written field for next step's blurs
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.bindTexture(gl.TEXTURE_2D, res.fieldTex[dst])
  gl.generateMipmap(gl.TEXTURE_2D)
  res.cur = dst
}

export function render(gl: WebGL2RenderingContext, res: MccabeGL, cfg: MccabeConfig): void {
  res.stepAcc += cfg.speed
  const steps = Math.floor(res.stepAcc)
  res.stepAcc -= steps
  for (let i = 0; i < steps; i++) step(gl, res)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.useProgram(res.displayProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.fieldTex[res.cur])
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.uniform1i(res.locs.display.u_field, 0)
  gl.uniform1i(res.locs.display.u_lut, 1)
  gl.uniform2f(res.locs.display.u_texel, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight)
  gl.uniform1f(res.locs.display.u_contrast, cfg.contrast)
  fullscreen(gl, res)
}
