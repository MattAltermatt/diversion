import { hexToRgb } from '../../framework/color'
import { mulberry32 } from '../../framework/rng'
import type { JuliaMorphConfig } from './schema'

export { hexToRgb }

export const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// Julia set: iterate z ← z² + c per pixel (z starts at the pixel's complex
// coordinate, c is a shared constant). Points that never escape are the trapped
// interior; escapees are smooth-colored by how fast they left. Orbiting c around
// a circle of radius `shape` morphs the whole fractal continuously.
export const FRAG_SRC = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform float u_view;    // complex half-width in view
uniform float u_shape;   // radius of the orbiting constant
uniform int   u_iter;
uniform float u_bands;
uniform vec3  u_colorA;
uniform vec3  u_colorB;
uniform vec3  u_colorInside;
out vec4 fragColor;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y) * u_view;
  vec2 c = u_shape * vec2(cos(u_time), sin(u_time));
  vec2 z = uv;
  int i = 0;
  float d = dot(z, z);
  // Loop bound must be a compile-time constant; keep 320 == schema iterations max.
  for (int k = 0; k < 320; k++) {
    if (k >= u_iter) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    d = dot(z, z);
    i = k + 1;
    if (d > 256.0) break;
  }
  vec3 col;
  if (d <= 256.0) {
    col = u_colorInside; // never escaped
  } else {
    // normalized (smooth) iteration count
    float log_zn = log(d) * 0.5;
    float nu = log(log_zn / log(2.0)) / log(2.0);
    float sm = float(i) + 1.0 - nu;
    float f = 0.5 + 0.5 * sin(sm * u_bands + u_time * 0.3);
    col = mix(u_colorA, u_colorB, f);
  }
  fragColor = vec4(col, 1.0);
}`

export type JuliaGL = {
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
    throw new Error(`Julia shader compile failed: ${log}`)
  }
  return sh
}

export function initGL(gl: WebGL2RenderingContext): JuliaGL {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC)
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
    throw new Error(`Julia program link failed: ${log}`)
  }
  const vao = gl.createVertexArray()!
  const name = (n: string) => gl.getUniformLocation(program, n)
  return {
    program, vao,
    locs: {
      res: name('u_res'), time: name('u_time'), view: name('u_view'), shape: name('u_shape'),
      iter: name('u_iter'), bands: name('u_bands'),
      colorA: name('u_colorA'), colorB: name('u_colorB'), colorInside: name('u_colorInside'),
    },
  }
}

export function render(
  gl: WebGL2RenderingContext, s: JuliaGL, cfg: JuliaMorphConfig, phase: number,
): void {
  // No gl.clear(): the fullscreen triangle covers every pixel opaquely each frame.
  gl.useProgram(s.program)
  gl.bindVertexArray(s.vao)
  gl.uniform2f(s.locs.res, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.uniform1f(s.locs.time, phase)
  gl.uniform1f(s.locs.view, cfg.view)
  gl.uniform1f(s.locs.shape, cfg.shape)
  gl.uniform1i(s.locs.iter, cfg.iterations)
  gl.uniform1f(s.locs.bands, cfg.bands)
  const a = hexToRgb(cfg.colorA), b = hexToRgb(cfg.colorB), ins = hexToRgb(cfg.colorInside)
  gl.uniform3f(s.locs.colorA, a[0], a[1], a[2])
  gl.uniform3f(s.locs.colorB, b[0], b[1], b[2])
  gl.uniform3f(s.locs.colorInside, ins[0], ins[1], ins[2])
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export function disposeGL(gl: WebGL2RenderingContext, s: JuliaGL): void {
  gl.deleteProgram(s.program)
  gl.deleteVertexArray(s.vao)
}

/** Seeded starting phase (0..2π) of the constant's orbit — each fresh visit opens
 *  on a different Julia form while staying reproducible for a given seed. */
export function seededPhase(seed: number): number {
  return mulberry32(seed)() * Math.PI * 2
}
