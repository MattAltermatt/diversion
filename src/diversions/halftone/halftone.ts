import { hexToRgb } from '../../framework/color'
import type { HalftoneConfig } from './schema'
import { MAX_MASSES, type Mass } from './motion'

// hexToRgb (WebGL 0-1 float form) lives in the framework; re-exported so the
// co-located test keeps importing it from here (mirrors plasma/metaballs).
export { hexToRgb }

// Fullscreen triangle generated from gl_VertexID — no attribute buffers needed.
export const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// The field is sampled at each halftone cell's CENTRE (classic newsprint screen),
// so every cell holds one clean disc whose radius encodes the local field. The
// radius maps through 1 - exp(-field): scale-robust (saturates smoothly to a full
// cell at the peaks regardless of strength/spread/count) and always ≥ 0.
export const FRAG_SRC = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform vec3  u_masses[8]; // xy = centre (uv), z = strength. 8 === MAX_MASSES (keep in sync)
uniform int   u_count;
uniform float u_spread;    // field softening
uniform float u_grid;      // dots across the short (vertical) dimension
uniform float u_maxDot;    // largest dot as a fraction of the cell
uniform int   u_mode;      // 0 = ink, 1 = tinted
uniform vec3  u_ink;       // ink-mode dot colour
uniform vec3  u_tintLo;    // tinted-mode weak-field colour
uniform vec3  u_tintHi;    // tinted-mode strong-field colour
uniform vec3  u_bg;
out vec4 fragColor;

float fieldAt(vec2 p) {
  float f = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= u_count) break;
    vec2 d = p - u_masses[i].xy;
    f += u_masses[i].z / (length(d) + u_spread);
  }
  return f;
}

void main() {
  // Aspect-correct uv: y in [-1, 1], x in [-aspect, aspect]. Masses share this space.
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);
  // Square halftone cells: the short (vertical) dimension spans 2.0 uv units and
  // holds u_grid dots, so each cell is 2/u_grid on a side.
  float cell = 2.0 / u_grid;
  vec2 cellCentre = (floor(uv / cell) + 0.5) * cell;
  float field = fieldAt(cellCentre);
  float frac = 1.0 - exp(-field); // 0 (empty) .. 1 (saturated)
  float radius = frac * u_maxDot * (cell * 0.5);
  float dist = length(uv - cellCentre);
  // Anti-aliased disc: fade across one pixel's worth of uv distance at the rim.
  float aa = max(fwidth(dist), 1e-5);
  float coverage = 1.0 - smoothstep(radius - aa, radius + aa, dist);
  vec3 dot = (u_mode == 1) ? mix(u_tintLo, u_tintHi, frac) : u_ink;
  vec3 col = mix(u_bg, dot, coverage);
  fragColor = vec4(col, 1.0);
}`

export type HalftoneGL = {
  program: WebGLProgram
  vao: WebGLVertexArrayObject
  locs: Record<string, WebGLUniformLocation | null>
  massData: Float32Array // reused upload buffer (MAX_MASSES * 3)
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`Halftone shader compile failed: ${log}`)
  }
  return sh
}

export function initGL(gl: WebGL2RenderingContext): HalftoneGL {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC)
  // Delete-before-throw on every error path so NO GL object leaks: if the fs
  // fails to compile, the already-created vertex shader must be freed; if the
  // program fails to link, the program itself must be freed.
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
  gl.deleteShader(vs) // flagged for deletion; freed once detached from the program
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`Halftone program link failed: ${log}`)
  }
  const vao = gl.createVertexArray()!
  const name = (n: string) => gl.getUniformLocation(program, n)
  return {
    program,
    vao,
    locs: {
      res: name('u_res'), masses: name('u_masses'), count: name('u_count'),
      spread: name('u_spread'), grid: name('u_grid'), maxDot: name('u_maxDot'),
      mode: name('u_mode'), ink: name('u_ink'), tintLo: name('u_tintLo'),
      tintHi: name('u_tintHi'), bg: name('u_bg'),
    },
    massData: new Float32Array(MAX_MASSES * 3),
  }
}

export function render(
  gl: WebGL2RenderingContext, s: HalftoneGL, cfg: HalftoneConfig, masses: Mass[],
): void {
  // No gl.clear(): the fullscreen triangle covers every pixel with an opaque
  // fragColor (alpha = 1.0) each frame, so there is nothing stale to clear.
  gl.useProgram(s.program)
  gl.bindVertexArray(s.vao)
  const n = Math.min(masses.length, MAX_MASSES)
  for (let i = 0; i < n; i++) {
    s.massData[i * 3] = masses[i].x
    s.massData[i * 3 + 1] = masses[i].y
    s.massData[i * 3 + 2] = masses[i].strength
  }
  gl.uniform2f(s.locs.res, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.uniform3fv(s.locs.masses, s.massData)
  gl.uniform1i(s.locs.count, n)
  gl.uniform1f(s.locs.spread, cfg.spread)
  gl.uniform1f(s.locs.grid, cfg.gridDensity)
  gl.uniform1f(s.locs.maxDot, cfg.maxDotSize)
  gl.uniform1i(s.locs.mode, cfg.colorMode === 'tinted' ? 1 : 0)
  const ink = hexToRgb(cfg.inkColor)
  const lo = hexToRgb(cfg.tintLow)
  const hi = hexToRgb(cfg.tintHigh)
  const bg = hexToRgb(cfg.background)
  gl.uniform3f(s.locs.ink, ink[0], ink[1], ink[2])
  gl.uniform3f(s.locs.tintLo, lo[0], lo[1], lo[2])
  gl.uniform3f(s.locs.tintHi, hi[0], hi[1], hi[2])
  gl.uniform3f(s.locs.bg, bg[0], bg[1], bg[2])
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export function disposeGL(gl: WebGL2RenderingContext, s: HalftoneGL): void {
  gl.deleteProgram(s.program)
  gl.deleteVertexArray(s.vao)
}
