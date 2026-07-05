// WebGL2 star renderer. The CPU integrates the sim; each frame we upload star
// state into a small RGBA32F "position texture" and draw one gl.POINTS per star,
// pulling its position/colour with texelFetch(gl_VertexID) in the vertex shader
// (the physarum deposit-pass idiom — no per-star vertex attributes, so no array
// buffers to churn). Colour lives in a second, static texture rebuilt only when
// the palette changes.
//
// Two-layer draw so hue survives density (project memory: pure additive blows out
// to white and kills colour): a faint ADDITIVE halo pass builds gentle bloom, then
// an opaque-ish SOURCE-OVER core pass lays crisp coloured dots on top. A fullscreen
// fade quad first washes the previous frame toward the background — trailFade 0 =
// full wipe, higher = glowing motion-trails along the tidal streams.

import { sampleGradientRGBA } from '../../framework/gradient'
import type { Sim } from './physics'

// gl_VertexID → texel; texelFetch pulls (x, y, brightness, coreness).
const STAR_VERT = `#version 300 es
precision highp float;
uniform sampler2D u_pos;
uniform sampler2D u_col;
uniform int   u_dim;
uniform vec2  u_center;   // world-space camera centre
uniform float u_scale;    // pixels per world unit
uniform vec2  u_res;      // device-pixel drawing-buffer size
uniform float u_pointSize;
out vec3  v_col;
out float v_bright;
void main() {
  int id = gl_VertexID;
  ivec2 idx = ivec2(id % u_dim, id / u_dim);
  vec4 P = texelFetch(u_pos, idx, 0);
  vec3 C = texelFetch(u_col, idx, 0).rgb;
  vec2 sp = (P.xy - u_center) * u_scale;      // pixels from centre
  gl_Position = vec4(sp / (u_res * 0.5), 0.0, 1.0);
  gl_PointSize = clamp(u_pointSize * (0.7 + P.w * 0.9), 1.0, 64.0);
  v_col = C;
  v_bright = P.z;
}`

const STAR_FRAG = `#version 300 es
precision highp float;
uniform int   u_mode;       // 0 = opaque core (source-over), 1 = additive halo
uniform float u_intensity;
in vec3  v_col;
in float v_bright;
out vec4 fragColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;                 // 0 centre → 1 edge
  if (r > 1.0) discard;
  if (u_mode == 1) {
    // soft gaussian glow, premultiplied for ONE,ONE additive blending
    float a = exp(-r * r * 3.0) * u_intensity * v_bright;
    fragColor = vec4(v_col * a, 1.0);
  } else {
    // crisp coloured dot, source-over so the hue always shows through the bloom
    float a = (1.0 - smoothstep(0.35, 1.0, r)) * u_intensity * (0.55 + 0.45 * v_bright);
    fragColor = vec4(v_col, a);
  }
}`

// Fullscreen triangle from gl_VertexID — the fade/background wash.
const FADE_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const FADE_FRAG = `#version 300 es
precision highp float;
uniform vec3  u_bg;
uniform float u_fade;   // alpha of the bg wash: 1 = full clear, low = long trails
out vec4 fragColor;
void main() { fragColor = vec4(u_bg, u_fade); }`

export interface GalaxyGL {
  starProg: WebGLProgram
  fadeProg: WebGLProgram
  vao: WebGLVertexArrayObject // empty; WebGL2 wants a VAO bound for attributeless draws
  posTex: WebGLTexture
  colTex: WebGLTexture
  dim: number // texture side (dim*dim ≥ n)
  n: number
  posData: Float32Array // reused each frame → zero per-frame allocation
  colData: Float32Array
  starLoc: Record<string, WebGLUniformLocation | null>
  fadeLoc: Record<string, WebGLUniformLocation | null>
}

/** Camera + look state passed to render() each frame. */
export interface View {
  centerX: number
  centerY: number
  scale: number // pixels per world unit
  resW: number
  resH: number
  pointSize: number
  fade: number // 0..1 alpha of the background wash
  bg: [number, number, number]
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`Galaxy shader compile failed: ${log}`)
  }
  return sh
}

function link(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc)
  let fs: WebGLShader
  try {
    fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc)
  } catch (e) {
    gl.deleteShader(vs)
    throw e
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog)
    gl.deleteProgram(prog)
    throw new Error(`Galaxy program link failed: ${log}`)
  }
  return prog
}

function makeDataTex(gl: WebGL2RenderingContext, dim: number): WebGLTexture {
  const t = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, dim, dim, 0, gl.RGBA, gl.FLOAT, null)
  // NEAREST + CLAMP: texelFetch ignores filtering, but a filterable float texture
  // isn't guaranteed, so never ask for LINEAR here.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return t
}

export function initGL(gl: WebGL2RenderingContext, n: number): GalaxyGL {
  const starProg = link(gl, STAR_VERT, STAR_FRAG)
  const fadeProg = link(gl, FADE_VERT, FADE_FRAG)
  const dim = Math.max(1, Math.ceil(Math.sqrt(n)))
  const posTex = makeDataTex(gl, dim)
  const colTex = makeDataTex(gl, dim)
  const vao = gl.createVertexArray()!
  const sLoc = (nm: string) => gl.getUniformLocation(starProg, nm)
  const fLoc = (nm: string) => gl.getUniformLocation(fadeProg, nm)
  return {
    starProg,
    fadeProg,
    vao,
    posTex,
    colTex,
    dim,
    n,
    posData: new Float32Array(dim * dim * 4),
    colData: new Float32Array(dim * dim * 4),
    starLoc: {
      pos: sLoc('u_pos'), col: sLoc('u_col'), dim: sLoc('u_dim'),
      center: sLoc('u_center'), scale: sLoc('u_scale'), res: sLoc('u_res'),
      pointSize: sLoc('u_pointSize'), mode: sLoc('u_mode'), intensity: sLoc('u_intensity'),
    },
    fadeLoc: { bg: fLoc('u_bg'), fade: fLoc('u_fade') },
  }
}

/** Rebuild the static colour texture from the two disk ramps. Called on setup and
 *  whenever a palette edit lands. Each star is tinted by its coreness along its
 *  own galaxy's ramp. */
export function uploadColors(gl: WebGL2RenderingContext, res: GalaxyGL, sim: Sim, colorsA: string[], colorsB: string[]): void {
  const { colData, n } = res
  for (let i = 0; i < n; i++) {
    const stops = sim.gal[i] === 0 ? colorsA : colorsB
    const c = sampleGradientRGBA(stops, sim.coreness[i])
    const o = i * 4
    colData[o] = c.r / 255
    colData[o + 1] = c.g / 255
    colData[o + 2] = c.b / 255
    colData[o + 3] = 1
  }
  gl.bindTexture(gl.TEXTURE_2D, res.colTex)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, res.dim, res.dim, gl.RGBA, gl.FLOAT, colData)
}

/** Upload the live star positions (x, y, brightness, coreness) into the pos texture. */
export function uploadPositions(gl: WebGL2RenderingContext, res: GalaxyGL, sim: Sim): void {
  const { posData, n } = res
  const { x, y, bright, coreness } = sim
  for (let i = 0; i < n; i++) {
    const o = i * 4
    posData[o] = x[i]
    posData[o + 1] = y[i]
    posData[o + 2] = bright[i]
    posData[o + 3] = coreness[i]
  }
  gl.bindTexture(gl.TEXTURE_2D, res.posTex)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, res.dim, res.dim, gl.RGBA, gl.FLOAT, posData)
}

export function render(gl: WebGL2RenderingContext, res: GalaxyGL, view: View): void {
  gl.bindVertexArray(res.vao)
  gl.enable(gl.BLEND)

  // 1. fade / background wash (source-over): last frame decays toward bg.
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.useProgram(res.fadeProg)
  gl.uniform3f(res.fadeLoc.bg, view.bg[0], view.bg[1], view.bg[2])
  gl.uniform1f(res.fadeLoc.fade, view.fade)
  gl.drawArrays(gl.TRIANGLES, 0, 3)

  // shared star uniforms
  gl.useProgram(res.starProg)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, res.posTex)
  gl.uniform1i(res.starLoc.pos, 0)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, res.colTex)
  gl.uniform1i(res.starLoc.col, 1)
  gl.uniform1i(res.starLoc.dim, res.dim)
  gl.uniform2f(res.starLoc.center, view.centerX, view.centerY)
  gl.uniform1f(res.starLoc.scale, view.scale)
  gl.uniform2f(res.starLoc.res, view.resW, view.resH)

  // 2. additive halo pass (gentle bloom, larger points)
  gl.blendFunc(gl.ONE, gl.ONE)
  gl.uniform1i(res.starLoc.mode, 1)
  gl.uniform1f(res.starLoc.intensity, 0.5)
  gl.uniform1f(res.starLoc.pointSize, view.pointSize * 3.5)
  gl.drawArrays(gl.POINTS, 0, res.n)

  // 3. opaque-ish core pass (source-over, crisp coloured dots on top)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.uniform1i(res.starLoc.mode, 0)
  gl.uniform1f(res.starLoc.intensity, 0.95)
  gl.uniform1f(res.starLoc.pointSize, view.pointSize)
  gl.drawArrays(gl.POINTS, 0, res.n)
}

export function disposeGL(gl: WebGL2RenderingContext, res: GalaxyGL): void {
  gl.deleteProgram(res.starProg)
  gl.deleteProgram(res.fadeProg)
  gl.deleteVertexArray(res.vao)
  gl.deleteTexture(res.posTex)
  gl.deleteTexture(res.colTex)
}
