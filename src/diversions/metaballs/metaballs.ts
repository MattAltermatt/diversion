import type { MetaballsConfig } from './schema'
import type { Blob } from './motion'

export const MAX_BLOBS = 16

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
uniform vec3  u_blobs[16]; // xy = center, z = radius. 16 === MAX_BLOBS (keep in sync)
uniform int   u_count;
uniform float u_threshold;
uniform float u_edge;
uniform float u_glow;
uniform vec3  u_colorA;    // rim / cooler (field-low)
uniform vec3  u_colorB;    // core / hotter (field-high)
uniform vec3  u_bg;
out vec4 fragColor;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);
  float field = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= u_count) break;
    vec2 d = uv - u_blobs[i].xy;
    float r = u_blobs[i].z;
    field += (r * r) / max(dot(d, d), 1e-4);
  }
  float iso  = smoothstep(u_threshold - u_edge, u_threshold + u_edge, field);
  float core = smoothstep(u_threshold, u_threshold * 2.0, field);
  vec3 blob  = mix(u_colorA, u_colorB, core);
  vec3 col   = mix(u_bg, blob, iso);
  // bounded sub-threshold glow halo
  float halo = smoothstep(u_threshold - u_edge - 0.6, u_threshold - u_edge, field) * (1.0 - iso);
  col += u_colorA * (u_glow * 0.6) * halo;
  fragColor = vec4(col, 1.0);
}`

export type MetaballsGL = {
  program: WebGLProgram
  vao: WebGLVertexArrayObject
  locs: Record<string, WebGLUniformLocation | null>
  blobData: Float32Array // reused upload buffer (MAX_BLOBS * 3)
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`Metaballs shader compile failed: ${log}`)
  }
  return sh
}

export function initGL(gl: WebGL2RenderingContext): MetaballsGL {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
  const program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Metaballs program link failed: ${gl.getProgramInfoLog(program)}`)
  }
  const vao = gl.createVertexArray()!
  const name = (n: string) => gl.getUniformLocation(program, n)
  return {
    program,
    vao,
    locs: {
      res: name('u_res'), blobs: name('u_blobs'), count: name('u_count'),
      threshold: name('u_threshold'), edge: name('u_edge'), glow: name('u_glow'),
      colorA: name('u_colorA'), colorB: name('u_colorB'), bg: name('u_bg'),
    },
    blobData: new Float32Array(MAX_BLOBS * 3),
  }
}

export function render(
  gl: WebGL2RenderingContext, s: MetaballsGL, cfg: MetaballsConfig, blobs: Blob[],
): void {
  gl.useProgram(s.program)
  gl.bindVertexArray(s.vao)
  const n = Math.min(blobs.length, MAX_BLOBS)
  for (let i = 0; i < n; i++) {
    s.blobData[i * 3] = blobs[i].x
    s.blobData[i * 3 + 1] = blobs[i].y
    s.blobData[i * 3 + 2] = blobs[i].radius
  }
  gl.uniform2f(s.locs.res, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.uniform3fv(s.locs.blobs, s.blobData)
  gl.uniform1i(s.locs.count, n)
  gl.uniform1f(s.locs.threshold, cfg.threshold)
  gl.uniform1f(s.locs.edge, cfg.edgeSoftness)
  gl.uniform1f(s.locs.glow, cfg.glow)
  const a = hexToRgb(cfg.colorA)
  const b = hexToRgb(cfg.colorB)
  const bg = hexToRgb(cfg.background)
  gl.uniform3f(s.locs.colorA, a[0], a[1], a[2])
  gl.uniform3f(s.locs.colorB, b[0], b[1], b[2])
  gl.uniform3f(s.locs.bg, bg[0], bg[1], bg[2])
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export function disposeGL(gl: WebGL2RenderingContext, s: MetaballsGL): void {
  gl.deleteProgram(s.program)
  gl.deleteVertexArray(s.vao)
}
