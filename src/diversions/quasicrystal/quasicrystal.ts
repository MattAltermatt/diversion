import { hexToRgb } from '../../framework/color'
import { mulberry32 } from '../../framework/rng'
import type { QuasicrystalConfig } from './schema'

export { hexToRgb }

// Fullscreen triangle from gl_VertexID — no attribute buffers.
export const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// A quasicrystal is the superposition of N cosine plane-wave gratings at equally
// spaced orientations (i·π/N). Their interference is quasiperiodic — an N-fold
// symmetric pattern that never exactly repeats. Drifting a shared phase through
// every grating makes the whole field shimmer and reorganize.
export const FRAG_SRC = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform float u_time;    // drifting phase
uniform float u_scale;
uniform int   u_waves;
uniform float u_fringes;
uniform float u_rot;     // seeded base rotation
uniform vec3  u_colorA;
uniform vec3  u_colorB;
out vec4 fragColor;

const float PI = 3.141592653589793;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);
  vec2 p = uv * u_scale;
  float sum = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= u_waves) break;
    float a = u_rot + float(i) * PI / float(u_waves);
    sum += cos(cos(a) * p.x + sin(a) * p.y + u_time);
  }
  // sum ∈ [-waves, waves]; iso-contours of the sum are the interference fringes.
  float f = 0.5 + 0.5 * sin(sum * u_fringes);
  vec3 col = mix(u_colorA, u_colorB, f);
  fragColor = vec4(col, 1.0);
}`

export type QuasicrystalGL = {
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
    throw new Error(`Quasicrystal shader compile failed: ${log}`)
  }
  return sh
}

export function initGL(gl: WebGL2RenderingContext): QuasicrystalGL {
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
    throw new Error(`Quasicrystal program link failed: ${log}`)
  }
  const vao = gl.createVertexArray()!
  const name = (n: string) => gl.getUniformLocation(program, n)
  return {
    program, vao,
    locs: {
      res: name('u_res'), time: name('u_time'), scale: name('u_scale'),
      waves: name('u_waves'), fringes: name('u_fringes'), rot: name('u_rot'),
      colorA: name('u_colorA'), colorB: name('u_colorB'),
    },
  }
}

export function render(
  gl: WebGL2RenderingContext, s: QuasicrystalGL, cfg: QuasicrystalConfig, phase: number, rot: number,
): void {
  // No gl.clear(): the fullscreen triangle covers every pixel opaquely each frame.
  gl.useProgram(s.program)
  gl.bindVertexArray(s.vao)
  gl.uniform2f(s.locs.res, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.uniform1f(s.locs.time, phase)
  gl.uniform1f(s.locs.scale, cfg.scale)
  gl.uniform1i(s.locs.waves, cfg.waves)
  gl.uniform1f(s.locs.fringes, cfg.fringes)
  gl.uniform1f(s.locs.rot, rot)
  const a = hexToRgb(cfg.colorA)
  const b = hexToRgb(cfg.colorB)
  gl.uniform3f(s.locs.colorA, a[0], a[1], a[2])
  gl.uniform3f(s.locs.colorB, b[0], b[1], b[2])
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export function disposeGL(gl: WebGL2RenderingContext, s: QuasicrystalGL): void {
  gl.deleteProgram(s.program)
  gl.deleteVertexArray(s.vao)
}

/** Seeded base rotation of the whole lattice (0..2π) — makes each fresh visit
 *  show a different quasicrystal while staying reproducible for a given seed. */
export function seededRotation(seed: number): number {
  return mulberry32(seed)() * Math.PI * 2
}
