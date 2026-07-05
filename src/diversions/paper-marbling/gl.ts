import { hexToRgb } from '../../framework/color'

// WebGL backend for Paper Marbling. The sheet is a composition of drop/comb maps; each
// output pixel is coloured by walking the operator stack BACKWARD (last-applied first),
// inverting each map, until the pre-image lands inside a fresh drop's disk (→ that ink) or
// falls through the whole stack (→ procedural paper). Operators live in an RGBA32F data
// texture (NEAREST, texelFetch) — dodges the fragment-uniform-vector cap and scales past
// 128 ops with no bake/FBO. Plasma is the lifecycle reference.

export const MAX_OPS = 256 // must match MAX_OPS in the shader
export const MAX_INKS = 32 // must match u_ink[] size in the shader

// Fullscreen triangle from gl_VertexID — no attribute buffers.
export const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// Operator packing (2 texels per op, rows y=0 (A) and y=1 (B)):
//   DROP: A=(0, cx, cy, r)           B=(colorIdx, 0, 0, 0)
//   COMB: A=(1, mx, my, spacing)     B=(offset, z, falloff, 0)
//     offset = A·N + phase  (folds the rake anchor + phase; N ⟂ M) — perp distance is
//     invariant along M, so this single scalar is all the walk needs.
export const FRAG_SRC = `#version 300 es
precision highp float;
#define MAX_OPS 256
uniform vec2  u_res;
uniform sampler2D u_ops;   // 2 x MAX_OPS RGBA32F
uniform int   u_opCount;
uniform vec3  u_ink[32];
uniform int   u_inkCount;
uniform vec3  u_paper;
uniform float u_fade;      // 0 = full sheet, 1 = dissolved to blank paper
uniform float u_grain;     // paper mottling amount
out vec4 fragColor;

// cheap hash value-noise for the paper grain
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  // short screen axis → [0,1]; long axis bleeds beyond (full-bleed, viewport-independent)
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y) + 0.5;
  vec2 p0 = p;                                 // original position — paper is sampled here so
                                               // the bath stays still while only ink is combed

  // Walk the live stack backward (last-applied first). Dynamic bound (GLSL ES 3.00) skips the
  // MAX_OPS−opCount no-op iterations — cheaper on weak GPUs than a constant bound + continue.
  int inkIdx = -1;
  for (int i = u_opCount - 1; i >= 0; i--) {
    if (inkIdx >= 0) continue;                 // colour already resolved
    vec4 A = texelFetch(u_ops, ivec2(i, 0), 0);
    vec4 B = texelFetch(u_ops, ivec2(i, 1), 0);
    if (A.x < 0.5) {                           // DROP inverse
      vec2 c = A.yz; float r = A.w;
      vec2 dvec = p - c; float D2 = dot(dvec, dvec);
      if (D2 < r * r) { inkIdx = int(B.x + 0.5); }
      else { p = c + dvec * sqrt(max(0.0, 1.0 - r * r / D2)); }
    } else if (A.x < 1.5) {                    // COMB inverse
      vec2 M = A.yz; float spacing = A.w;
      float offset = B.x, z = B.y, falloff = B.z;
      vec2 N = vec2(-M.y, M.x);
      float perp = dot(p, N) - offset;
      float halfSp = spacing * 0.5;
      float m = mod(perp + halfSp, spacing);
      float dNear = abs(m - halfSp);
      p -= (z * exp(-dNear / falloff)) * M;
    } else {                                   // VORTEX inverse: rotate back by −θ(r)
      vec2 c = A.yz; float radius = A.w;
      float strength = B.x;
      vec2 d = p - c;
      float rr = length(d);
      float ang = -strength * exp(-rr / radius);
      float s = sin(ang), co = cos(ang);
      p = c + vec2(co * d.x - s * d.y, s * d.x + co * d.y);
    }
  }

  vec3 col;
  if (inkIdx >= 0) {
    col = u_ink[clamp(inkIdx, 0, u_inkCount - 1)];
  } else {
    // procedural paper (sampled in screen space, undisturbed by combing): base + fine grain
    float n = vnoise(p0 * 190.0) * 0.6 + vnoise(p0 * 47.0) * 0.4;
    col = u_paper * (1.0 - u_grain * 0.16 * (n - 0.5) * 2.0);
  }
  col = mix(col, u_paper, u_fade);
  fragColor = vec4(col, 1.0);
}`

export type PaperMarblingGL = {
  program: WebGLProgram
  vao: WebGLVertexArrayObject
  opTex: WebGLTexture
  opData: Float32Array // MAX_OPS * 2 texels * 4 — reused each frame
  inkData: Float32Array // MAX_INKS * 3 — repacked only on config change, not per frame
  inkCount: number
  paperRgb: [number, number, number]
  locs: Record<string, WebGLUniformLocation | null>
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`Paper Marbling shader compile failed: ${log}`)
  }
  return sh
}

export function initGL(gl: WebGL2RenderingContext): PaperMarblingGL {
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
    throw new Error(`Paper Marbling program link failed: ${log}`)
  }

  const vao = gl.createVertexArray()!
  const opTex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, opTex)
  // NEAREST + no mips: texelFetch reads exact operator floats, no filtering needed.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const opData = new Float32Array(MAX_OPS * 2 * 4)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, MAX_OPS, 2, 0, gl.RGBA, gl.FLOAT, opData)

  const name = (n: string) => gl.getUniformLocation(program, n)
  return {
    program,
    vao,
    opTex,
    opData,
    inkData: new Float32Array(MAX_INKS * 3),
    inkCount: 1,
    paperRgb: [0, 0, 0],
    locs: {
      res: name('u_res'), ops: name('u_ops'), opCount: name('u_opCount'),
      ink: name('u_ink'), inkCount: name('u_inkCount'),
      paper: name('u_paper'), fade: name('u_fade'), grain: name('u_grain'),
    },
  }
}

/** Repack the ink palette + paper colour into the reused `inkData` buffer. Called only from
 *  setup/update (colours are static between config edits), never per frame. */
export function packColors(s: PaperMarblingGL, inks: string[], paper: string): void {
  const inkCount = Math.min(Math.max(1, inks.length), MAX_INKS)
  for (let i = 0; i < inkCount; i++) {
    const c = hexToRgb(inks[i])
    s.inkData[i * 3] = c[0]
    s.inkData[i * 3 + 1] = c[1]
    s.inkData[i * 3 + 2] = c[2]
  }
  s.inkCount = inkCount
  s.paperRgb = hexToRgb(paper)
}

/** Draw one frame. `s.opData` (this frame's operators) and `s.inkData` (the palette) are both
 *  pre-filled by the caller — render allocates nothing. */
export function render(
  gl: WebGL2RenderingContext,
  s: PaperMarblingGL,
  opCount: number,
  fade: number,
  grain: number,
): void {
  gl.useProgram(s.program)
  gl.bindVertexArray(s.vao)

  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, s.opTex)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAX_OPS, 2, gl.RGBA, gl.FLOAT, s.opData)
  gl.uniform1i(s.locs.ops, 0)

  gl.uniform2f(s.locs.res, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.uniform1i(s.locs.opCount, opCount)
  gl.uniform3fv(s.locs.ink, s.inkData)
  gl.uniform1i(s.locs.inkCount, s.inkCount)
  gl.uniform3f(s.locs.paper, s.paperRgb[0], s.paperRgb[1], s.paperRgb[2])
  gl.uniform1f(s.locs.fade, fade)
  gl.uniform1f(s.locs.grain, grain)

  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export function disposeGL(gl: WebGL2RenderingContext, s: PaperMarblingGL): void {
  gl.deleteProgram(s.program)
  gl.deleteVertexArray(s.vao)
  gl.deleteTexture(s.opTex)
}
