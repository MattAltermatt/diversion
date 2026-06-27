import type { PlasmaConfig } from './schema'

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// Fullscreen triangle generated from gl_VertexID — no attribute buffers needed.
export const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

export const FRAG_SRC = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform float u_scale;
uniform float u_warp;
uniform int   u_octaves;
uniform float u_contrast;
uniform vec3  u_colorA;
uniform vec3  u_colorB;
out vec4 fragColor;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);
  vec2 p = uv * u_scale;
  float t = u_time;
  for (int i = 0; i < 5; i++) {
    if (i >= u_octaves) break;
    p += u_warp * vec2(
      sin(p.y * 1.3 + t * 0.7 + float(i)),
      cos(p.x * 1.7 - t * 0.6 + float(i))
    );
  }
  float f = sin(p.x) + sin(p.y) + sin((p.x + p.y) * 0.7 + t);
  f = 0.5 + 0.5 * sin(f * u_contrast);
  vec3 col = mix(u_colorA, u_colorB, f);
  fragColor = vec4(col, 1.0);
}`

export type PlasmaGL = {
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
    throw new Error(`Plasma shader compile failed: ${log}`)
  }
  return sh
}

export function initGL(gl: WebGL2RenderingContext): PlasmaGL {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
  const program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Plasma program link failed: ${gl.getProgramInfoLog(program)}`)
  }
  const vao = gl.createVertexArray()!
  const name = (n: string) => gl.getUniformLocation(program, n)
  return {
    program,
    vao,
    locs: {
      res: name('u_res'), time: name('u_time'), scale: name('u_scale'),
      warp: name('u_warp'), octaves: name('u_octaves'), contrast: name('u_contrast'),
      colorA: name('u_colorA'), colorB: name('u_colorB'),
    },
  }
}

export function render(
  gl: WebGL2RenderingContext, s: PlasmaGL, cfg: PlasmaConfig, phase: number,
): void {
  gl.useProgram(s.program)
  gl.bindVertexArray(s.vao)
  gl.uniform2f(s.locs.res, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.uniform1f(s.locs.time, phase)
  gl.uniform1f(s.locs.scale, cfg.scale)
  gl.uniform1f(s.locs.warp, cfg.warp)
  gl.uniform1i(s.locs.octaves, cfg.octaves)
  gl.uniform1f(s.locs.contrast, cfg.contrast)
  const a = hexToRgb(cfg.colorA)
  const b = hexToRgb(cfg.colorB)
  gl.uniform3f(s.locs.colorA, a[0], a[1], a[2])
  gl.uniform3f(s.locs.colorB, b[0], b[1], b[2])
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export function disposeGL(gl: WebGL2RenderingContext, s: PlasmaGL): void {
  gl.deleteProgram(s.program)
  gl.deleteVertexArray(s.vao)
}
