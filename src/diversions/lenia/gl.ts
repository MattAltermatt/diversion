import { simDims, seedField, buildKernelLUT, buildLUT, KERNEL_LUT_W } from './field'
import type { LeniaConfig } from './schema'

// The sim runs exactly ONE step per frame (bounded compute). "Sim speed" instead
// scales the per-step timestep dt = simSpeed × BASE_DT, so it controls how fast the
// soup evolves WITHOUT changing the per-frame cost. BASE_DT is tuned so the slowest
// speed (0.1) takes ~10 minutes to condense from the seed — a meditative genesis —
// while staying far below the dt where the Euler step would go unstable. 🎚️
const BASE_DT = 0.00017

const TRI_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// SIM: one Lenia step — convolve the field with the radial ring kernel (sampled by
// distance from the 1-D kernel LUT), then apply the Gaussian growth function. R is
// compiled in as a constant (GLSL ES loop bounds must be constant).
const simFrag = (R: number) => `#version 300 es
precision highp float;
uniform sampler2D u_state;   // RGBA32F, field in .r
uniform sampler2D u_kernel;  // 1-D radial kernel LUT (R32F), normalized: sum over disc ~= 1
uniform vec2  u_texel;       // 1/simSize
uniform float u_mu;
uniform float u_sigma;
uniform float u_dt;
out vec4 fragColor;
const int R = ${R};
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  float pot = 0.0;             // convolution potential (weighted average, kernel pre-normalized)
  for (int dy = -R; dy <= R; dy++) {
    for (int dx = -R; dx <= R; dx++) {
      float r = sqrt(float(dx * dx + dy * dy)) / float(R);
      if (r > 1.0) continue;
      float w = texture(u_kernel, vec2(r, 0.5)).r;
      float s = texture(u_state, uv + vec2(float(dx), float(dy)) * u_texel).r;
      pot += w * s;
    }
  }
  // Gaussian growth mapped to [-1, +1].
  float g = 2.0 * exp(-(pot - u_mu) * (pot - u_mu) / (2.0 * u_sigma * u_sigma)) - 1.0;
  float field = texture(u_state, uv).r;
  float nf = clamp(field + u_dt * g, 0.0, 1.0);
  fragColor = vec4(nf, 0.0, 0.0, 1.0);
}`

// DISPLAY: sample the field in normalized UV (stretches sim field to fill canvas),
// index the color LUT directly (field is already 0..1), opaque to screen.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform sampler2D u_lut;
uniform vec2  u_texel;   // 1/screenSize
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  float v = texture(u_state, uv).r;
  vec3 col = texture(u_lut, vec2(clamp(v, 0.0, 1.0), 0.5)).rgb;
  fragColor = vec4(col, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src); gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh)
    throw new Error(`Lenia shader compile failed: ${log}`)
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
    throw new Error(`Lenia program link failed: ${log}`)
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

export type LeniaGL = {
  simProg: WebGLProgram
  displayProg: WebGLProgram
  vao: WebGLVertexArrayObject
  stateTex: [WebGLTexture, WebGLTexture]
  stateFbo: [WebGLFramebuffer, WebGLFramebuffer]
  kernelTex: WebGLTexture
  lutTex: WebGLTexture
  simW: number
  simH: number
  cur: number
  locs: {
    sim: Record<string, WebGLUniformLocation | null>
    display: Record<string, WebGLUniformLocation | null>
  }
}

export function initGL(gl: WebGL2RenderingContext, cfg: LeniaConfig, w: number, h: number): LeniaGL {
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('Lenia requires float render targets (EXT_color_buffer_float)')
  }
  // RGBA32F is color-renderable via the extension above, but LINEAR-filterable ONLY
  // with this one — without it a float32 texture set to LINEAR is texture-incomplete
  // and every sample returns 0 (dead field). Fall back to NEAREST where absent.
  const stateFilter = gl.getExtension('OES_texture_float_linear') ? gl.LINEAR : gl.NEAREST

  const simProg = link(gl, TRI_VERT, simFrag(cfg.kernelRadius))
  const displayProg = link(gl, TRI_VERT, DISPLAY_FRAG)
  const vao = gl.createVertexArray()!

  const { sw: simW, sh: simH } = simDims(w, h)
  const seed = seedField(cfg.seed, simW, simH)
  // REPEAT wrap → the soup is toroidal (blobs drifting off one edge re-enter the
  // other), and the convolution's neighbor taps wrap cleanly.
  const stateTex: [WebGLTexture, WebGLTexture] = [
    makeTex(gl, simW, simH, gl.RGBA32F, gl.RGBA, gl.FLOAT, stateFilter, gl.REPEAT, seed),
    makeTex(gl, simW, simH, gl.RGBA32F, gl.RGBA, gl.FLOAT, stateFilter, gl.REPEAT, null),
  ]
  const stateFbo: [WebGLFramebuffer, WebGLFramebuffer] = [fboFor(gl, stateTex[0]), fboFor(gl, stateTex[1])]
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  // Kernel LUT: R32F sampled NEAREST (no linear-filter extension needed); REPEAT/CLAMP
  // irrelevant since r is clamped to [0,1] in the shader.
  const kernelTex = makeTex(
    gl, KERNEL_LUT_W, 1, gl.R32F, gl.RED, gl.FLOAT, gl.NEAREST, gl.CLAMP_TO_EDGE,
    buildKernelLUT(cfg.kernelRadius, cfg.kernel),
  )
  const lutTex = makeTex(gl, 256, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE, buildLUT(cfg.stops))

  const u = (p: WebGLProgram, names: string[]) =>
    Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]))
  const locs = {
    sim: u(simProg, ['u_state', 'u_kernel', 'u_texel', 'u_mu', 'u_sigma', 'u_dt']),
    display: u(displayProg, ['u_state', 'u_lut', 'u_texel']),
  }
  return { simProg, displayProg, vao, stateTex, stateFbo, kernelTex, lutTex, simW, simH, cur: 0, locs }
}

export function uploadLUT(gl: WebGL2RenderingContext, res: LeniaGL, stops: string[]): void {
  gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLUT(stops))
}

/** Live kernel-profile swap (β change at the same radius) — no shader recompile. */
export function uploadKernel(gl: WebGL2RenderingContext, res: LeniaGL, radius: number, kernel: 'Smooth' | 'Layered'): void {
  gl.bindTexture(gl.TEXTURE_2D, res.kernelTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, KERNEL_LUT_W, 1, 0, gl.RED, gl.FLOAT, buildKernelLUT(radius, kernel))
}

export function disposeGL(gl: WebGL2RenderingContext, res: LeniaGL): void {
  for (const p of [res.simProg, res.displayProg]) gl.deleteProgram(p)
  gl.deleteVertexArray(res.vao)
  for (const t of [...res.stateTex, res.kernelTex, res.lutTex]) gl.deleteTexture(t)
  for (const f of res.stateFbo) gl.deleteFramebuffer(f)
}

function fullscreen(gl: WebGL2RenderingContext, res: LeniaGL) {
  gl.bindVertexArray(res.vao)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

/** One Lenia step: render src→dst over the field. */
export function step(gl: WebGL2RenderingContext, res: LeniaGL, cfg: LeniaConfig): void {
  const src = res.cur, dst = src ^ 1
  gl.disable(gl.BLEND)
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.stateFbo[dst])
  gl.viewport(0, 0, res.simW, res.simH)
  gl.useProgram(res.simProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.stateTex[src])
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, res.kernelTex)
  gl.uniform1i(res.locs.sim.u_state, 0)
  gl.uniform1i(res.locs.sim.u_kernel, 1)
  gl.uniform2f(res.locs.sim.u_texel, 1 / res.simW, 1 / res.simH)
  gl.uniform1f(res.locs.sim.u_mu, cfg.mu)
  gl.uniform1f(res.locs.sim.u_sigma, cfg.sigma)
  // Sim speed scales the timestep, not the step count — one step per frame, evolving
  // by simSpeed × BASE_DT each tick (slowest ≈ a 10-minute genesis).
  gl.uniform1f(res.locs.sim.u_dt, cfg.simSpeed * BASE_DT)
  fullscreen(gl, res)
  res.cur = dst
}

/** Run exactly one Lenia step (cost is independent of speed — dt carries the rate),
 *  then display the current field to the screen. */
export function render(gl: WebGL2RenderingContext, res: LeniaGL, cfg: LeniaConfig): void {
  step(gl, res, cfg)
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
