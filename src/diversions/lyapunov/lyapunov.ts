import { hexToRgb } from '../../framework/color'
import { mulberry32 } from '../../framework/rng'
import type { LyapunovConfig } from './schema'

export { hexToRgb }

// Compile-time upper bound of the per-pixel iteration loop; must be >= the schema's
// `iterations` max so the loop unrolls with a constant bound (u_iter clamps below it).
export const MAX_ITER = 400
// Max supported sequence length — matches the shader's `uniform int u_seq[32]`.
export const MAX_SEQ = 32

// "AABAB" → [0,0,1,0,1] (A → 0 → uses parameter a; B → 1 → uses parameter b).
export function seqBits(name: string): number[] {
  return [...name].map((c) => (c === 'B' ? 1 : 0))
}

// Fullscreen triangle from gl_VertexID — no attribute buffers.
export const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// Markus–Lyapunov fractal. For each pixel the (a,b) pair drives the logistic map
// xₙ₊₁ = rₙ·xₙ·(1−xₙ), rₙ alternating a/b per the fixed binary sequence. The
// Lyapunov exponent λ = mean of log|rₙ·(1−2xₙ)| (after a warmup) measures orbital
// stability: λ<0 → stable/periodic "cities" (warm ramp); λ>0 → chaotic voids (cool).
export const FRAG_SRC = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform vec2  u_center;  // (a,b) window centre
uniform float u_hw;      // window half-width in parameter units
uniform float u_shimmer; // palette-cycle phase (bounded time)
uniform int   u_iter;
uniform int   u_seq[32];
uniform int   u_seqLen;
uniform float u_depth;
uniform float u_cycle;
uniform vec3  u_chaos;
uniform vec3  u_cityEdge;
uniform vec3  u_cityDeep;
out vec4 fragColor;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);
  float a = u_center.x + uv.x * u_hw;
  float b = u_center.y + uv.y * u_hw;

  float x = 0.5;
  int total = u_iter;
  int warm = total / 2;
  float sum = 0.0;
  int count = 0;
  // Loop bound must be a compile-time constant; keep 400 == MAX_ITER == schema max.
  for (int k = 0; k < 400; k++) {
    if (k >= total) break;
    int s = u_seq[k % u_seqLen];
    float r = (s == 0) ? a : b;
    x = r * x * (1.0 - x);
    if (k >= warm) {
      sum += log(abs(r * (1.0 - 2.0 * x)) + 1e-9);
      count++;
    }
  }
  float lambda = sum / float(max(count, 1));

  vec3 col;
  if (lambda > 0.0) {
    // chaotic void — stronger chaos reads darker
    float c = clamp(lambda / 1.2, 0.0, 1.0);
    col = u_chaos * (1.0 - 0.55 * c);
  } else {
    // stable city — warm ramp from the glowing edge (λ≈0) inward (λ≪0)
    float d = clamp(-lambda / u_depth, 0.0, 1.0);
    d = clamp(d + u_cycle * 0.18 * sin(u_shimmer * 0.7 + d * 6.28318), 0.0, 1.0);
    col = mix(u_cityEdge, u_cityDeep, d);
  }
  fragColor = vec4(col, 1.0);
}`

export type LyapunovGL = {
  program: WebGLProgram
  vao: WebGLVertexArrayObject
  locs: Record<string, WebGLUniformLocation | null>
  seqBuf: Int32Array // reused per-frame scratch for the sequence uniform (no per-frame alloc)
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`Lyapunov shader compile failed: ${log}`)
  }
  return sh
}

export function initGL(gl: WebGL2RenderingContext): LyapunovGL {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC)
  // Delete-before-throw on every error path so no GL object leaks.
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
    throw new Error(`Lyapunov program link failed: ${log}`)
  }
  const vao = gl.createVertexArray()!
  const name = (n: string) => gl.getUniformLocation(program, n)
  return {
    program, vao,
    seqBuf: new Int32Array(MAX_SEQ),
    locs: {
      res: name('u_res'), center: name('u_center'), hw: name('u_hw'),
      shimmer: name('u_shimmer'), iter: name('u_iter'),
      seq: name('u_seq[0]'), seqLen: name('u_seqLen'),
      depth: name('u_depth'), cycle: name('u_cycle'),
      chaos: name('u_chaos'), cityEdge: name('u_cityEdge'), cityDeep: name('u_cityDeep'),
    },
  }
}

export type View = { cx: number; cy: number; hw: number }

/** Deterministic window for a seed at a given time (seconds). Picks a base centre in
 *  the interesting region of (a,b) space, then slowly drifts it on a Lissajous path.
 *  The half-width is clamped so the window ALWAYS stays inside the valid logistic
 *  band [1.9, 4.0]² — the image is never partly diverged. Pure (double precision, so
 *  drift stays smooth over long unattended runs). */
export function computeView(seed: number, zoom: number, timeSec: number): View {
  const rng = mulberry32(seed)
  const cx0 = 3.3 + rng() * 0.45 // [3.3, 3.75] — the filigree band near the chaos onset
  const cy0 = 3.3 + rng() * 0.45
  const phase = rng() * Math.PI * 2
  const drift = 0.1
  const cx = cx0 + drift * Math.sin(timeSec * 0.13 + phase)
  const cy = cy0 + drift * Math.cos(timeSec * 0.11 + phase * 1.3)
  const hwMax = Math.min(cx - 1.9, 4.0 - cx, cy - 1.9, 4.0 - cy)
  const hw = Math.max(0.05, Math.min(zoom, hwMax))
  return { cx, cy, hw }
}

export function render(
  gl: WebGL2RenderingContext, s: LyapunovGL, cfg: LyapunovConfig, view: View, shimmer: number,
): void {
  // No gl.clear(): the fullscreen triangle covers every pixel opaquely each frame.
  gl.useProgram(s.program)
  gl.bindVertexArray(s.vao)
  gl.uniform2f(s.locs.res, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.uniform2f(s.locs.center, view.cx, view.cy)
  gl.uniform1f(s.locs.hw, view.hw)
  gl.uniform1f(s.locs.shimmer, shimmer)
  gl.uniform1i(s.locs.iter, cfg.iterations)
  const bits = seqBits(cfg.sequence)
  s.seqBuf.fill(0)
  for (let i = 0; i < bits.length && i < MAX_SEQ; i++) s.seqBuf[i] = bits[i]
  gl.uniform1iv(s.locs.seq, s.seqBuf)
  gl.uniform1i(s.locs.seqLen, Math.min(bits.length, MAX_SEQ))
  gl.uniform1f(s.locs.depth, cfg.depth)
  gl.uniform1f(s.locs.cycle, cfg.colorCycle)
  const chaos = hexToRgb(cfg.chaosColor)
  const edge = hexToRgb(cfg.cityEdge)
  const deep = hexToRgb(cfg.cityDeep)
  gl.uniform3f(s.locs.chaos, chaos[0], chaos[1], chaos[2])
  gl.uniform3f(s.locs.cityEdge, edge[0], edge[1], edge[2])
  gl.uniform3f(s.locs.cityDeep, deep[0], deep[1], deep[2])
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export function disposeGL(gl: WebGL2RenderingContext, s: LyapunovGL): void {
  gl.deleteProgram(s.program)
  gl.deleteVertexArray(s.vao)
}

/** CPU reference of the Lyapunov exponent — mirrors the shader loop exactly. Used by
 *  the unit tests to prove the sign of λ is right (stable region < 0, chaotic > 0). */
export function lyapunovExponent(a: number, b: number, bits: number[], iterations: number): number {
  let x = 0.5
  const total = iterations
  const warm = Math.floor(total / 2)
  let sum = 0
  let count = 0
  for (let k = 0; k < total; k++) {
    const r = bits[k % bits.length] === 0 ? a : b
    x = r * x * (1 - x)
    if (k >= warm) {
      sum += Math.log(Math.abs(r * (1 - 2 * x)) + 1e-9)
      count++
    }
  }
  return sum / Math.max(count, 1)
}
