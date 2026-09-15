import { hexToRgb } from '../../framework/color'
import type { Film } from './film'
import { LUT_MAX_OPD, LUT_N } from './optics'

/** One fullscreen triangle. The thickness field is uploaded as an R16F texture and the
 *  colour is one fetch from a baked RGBA16F LUT — there is no interference arithmetic in
 *  the shader at all, so no `highp` requirement and no thickness→0 guard.
 *
 *  ⚠️ R16F and RGBA16F, never the 32-bit forms: float32 textures are NOT filterable in
 *  core WebGL2, so a LINEAR sampler over R32F silently returns 0 with no GL error. The
 *  half-float formats need no extension. (`caustics/gl.ts` carries the same note.)
 *
 *  ⚠️ Allocate with `texImage2D`, never `texStorage2D`: `makeGLContext()` in
 *  `src/test-setup.ts` has no `texStorage2D`, and `diversionSmoke.test.ts` sweeps every
 *  diversion through that mock with zero exemptions — the immutable-storage path would
 *  throw for the whole gallery. */

export interface SoapGL {
  prog: WebGLProgram
  vao: WebGLVertexArrayObject
  thickTex: WebGLTexture
  lutTex: WebGLTexture
  /** Reused every frame — the render path allocates nothing after `initGL`. */
  thickData: Float32Array
  cols: number
  rows: number
  loc: Record<string, WebGLUniformLocation | null>
}

const VS = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const FS = `#version 300 es
precision mediump float;
precision mediump sampler2D;
uniform sampler2D uThick;     // R16F, nm of geometric thickness
uniform sampler2D uLut;       // RGBA16F, 1 x LUT_N, indexed by optical thickness
uniform vec2  uResolution;
uniform float uFilmIndex;
uniform float uLutMaxOpd;
uniform float uExposure;
uniform vec3  uBackground;
uniform vec4  uRupture;       // x, y, radius, rim width — in units of the SHORTER axis
uniform float uFade;          // 0..1, the new film fading in
out vec4 fragColor;

vec3 encodeSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  // The film's own coordinates run top-down; gl_FragCoord is bottom-up.
  vec2 fuv = vec2(uv.x, 1.0 - uv.y);

  if (uRupture.z > 0.0) {
    float aspect = uResolution.x / uResolution.y;
    vec2 p = vec2(fuv.x * aspect, fuv.y);
    float d = distance(p, uRupture.xy);
    if (d < uRupture.z) { fragColor = vec4(encodeSrgb(uBackground), 1.0); return; }
    if (d < uRupture.z + uRupture.w) {
      // The receding rim collects the film it sweeps up.
      float t = 1.0 - (d - uRupture.z) / uRupture.w;
      fragColor = vec4(encodeSrgb(mix(uBackground, vec3(0.92), t * t)), 1.0);
      return;
    }
  }

  float thickness = texture(uThick, fuv).r;
  float opd = uFilmIndex * thickness;
  vec3 film = texture(uLut, vec2(clamp(opd / uLutMaxOpd, 0.0, 1.0), 0.5)).rgb;
  fragColor = vec4(encodeSrgb(mix(uBackground, film * uExposure, uFade)), 1.0);
}`

function link(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = gl.createShader(gl.VERTEX_SHADER)!
  gl.shaderSource(vs, vsSrc)
  gl.compileShader(vs)
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!
  gl.shaderSource(fs, fsSrc)
  gl.compileShader(fs)
  const p = gl.createProgram()!
  gl.attachShader(p, vs)
  gl.attachShader(p, fs)
  gl.linkProgram(p)
  // ⚠️ THROW on failure. AnimationHost catches a throwing setup() and routes it to the
  // error boundary; returning a dead program opts out of that, and the symptom is a black
  // canvas with the fps pill counting up and per-frame validation spam. 16 of the 17
  // gl.ts files in this repo check this.
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) throw new Error(`soap-film vertex shader: ${gl.getShaderInfoLog(vs)}`)
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) throw new Error(`soap-film fragment shader: ${gl.getShaderInfoLog(fs)}`)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`soap-film link: ${gl.getProgramInfoLog(p)}`)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  return p
}

function makeTex(gl: WebGL2RenderingContext): WebGLTexture {
  const t = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return t
}

export function initGL(gl: WebGL2RenderingContext, cols: number, rows: number): SoapGL {
  const prog = link(gl, VS, FS)
  const vao = gl.createVertexArray()!
  const thickTex = makeTex(gl)
  const lutTex = makeTex(gl)
  const names = ['uThick', 'uLut', 'uResolution', 'uFilmIndex', 'uLutMaxOpd', 'uExposure',
    'uBackground', 'uRupture', 'uFade']
  const res: SoapGL = {
    prog,
    vao,
    thickTex,
    lutTex,
    thickData: new Float32Array(cols * rows),
    cols,
    rows,
    loc: Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)])),
  }
  allocThickness(gl, res, cols, rows)
  return res
}

/** (Re)allocate the thickness texture. Called by `initGL` and on resize only. */
export function allocThickness(gl: WebGL2RenderingContext, res: SoapGL, cols: number, rows: number): void {
  res.cols = cols
  res.rows = rows
  if (res.thickData.length !== cols * rows) res.thickData = new Float32Array(cols * rows)
  gl.bindTexture(gl.TEXTURE_2D, res.thickTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, cols, rows, 0, gl.RED, gl.FLOAT, null)
}

export function uploadLut(gl: WebGL2RenderingContext, res: SoapGL, lut: Float32Array): void {
  gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, LUT_N, 1, 0, gl.RGBA, gl.FLOAT, lut)
}

/** `texSubImage2D` from a REUSED Float32Array — zero per-frame allocation, the same path
 *  `galaxy-collision/gl.ts`'s `uploadPositions` uses. */
export function uploadThickness(gl: WebGL2RenderingContext, res: SoapGL, f: Film): void {
  res.thickData.set(f.h)
  gl.bindTexture(gl.TEXTURE_2D, res.thickTex)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, res.cols, res.rows, gl.RED, gl.FLOAT, res.thickData)
}

export interface RenderView {
  width: number
  height: number
  filmIndex: number
  exposure: number
  background: string
  /** x, y, radius, rim width — units of the shorter axis. Radius 0 means no rupture. */
  rupture: [number, number, number, number]
  fade: number
}

export function render(gl: WebGL2RenderingContext, res: SoapGL, view: RenderView): void {
  gl.useProgram(res.prog)
  gl.bindVertexArray(res.vao)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, res.thickTex)
  gl.uniform1i(res.loc.uThick, 0)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.uniform1i(res.loc.uLut, 1)
  gl.uniform2f(res.loc.uResolution, view.width, view.height)
  gl.uniform1f(res.loc.uFilmIndex, view.filmIndex)
  gl.uniform1f(res.loc.uLutMaxOpd, LUT_MAX_OPD)
  gl.uniform1f(res.loc.uExposure, view.exposure)
  // ⚠️ LINEAR. `hexToRgb` returns sRGB-ENCODED components and the shader encodes on
  // output, so passing them straight through encodes twice: the default #06080b painted
  // as ~#2A323B, i.e. the near-black you picked came out slate grey — through the rupture
  // hole, which is the piece's most dramatic beat. `caustics/gl.ts` sends pow(hex, 2.2)
  // for the same reason.
  const bg = hexToRgb(view.background)
  gl.uniform3f(res.loc.uBackground, Math.pow(bg[0], 2.2), Math.pow(bg[1], 2.2), Math.pow(bg[2], 2.2))
  gl.uniform4f(res.loc.uRupture, view.rupture[0], view.rupture[1], view.rupture[2], view.rupture[3])
  gl.uniform1f(res.loc.uFade, view.fade)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  gl.activeTexture(gl.TEXTURE0)
}

export function disposeGL(gl: WebGL2RenderingContext, res: SoapGL): void {
  gl.deleteProgram(res.prog)
  gl.deleteVertexArray(res.vao)
  gl.deleteTexture(res.thickTex)
  gl.deleteTexture(res.lutTex)
}
