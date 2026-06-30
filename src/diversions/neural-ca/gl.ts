// Neural CA — GPU core (faithful port of znah/hexells `ca.js`; see ARCHITECTURE.md).
//
// All-GPU, inference-only. State is a 12-channel uint8 tensor packed into one channel-tiled
// texture (createTensor). Each step:  perception → dense0(+implicit ReLU) → dense1 → update.
// Weights are base64-PNG images (one per dense layer) addressed by a per-cell modelIdx; ReLU is
// realised by the uint8 zero-clamp of the hidden tensor (layer0 stores with zero=0). Alignment is
// held CONSTANT (dir=(0,1) → axis-aligned sobels), faithful to the base trained textures; hexells'
// evolving flow-alignment is a backlog polish.

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Pure addressing / sizing math
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type TensorDims = { depth4: number; gridW: number; gridH: number; texW: number; texH: number }

export function tensorDims(w: number, h: number, depth: number): TensorDims {
  const depth4 = Math.ceil(depth / 4)
  const gridW = Math.ceil(Math.sqrt(depth4))
  const gridH = Math.ceil(depth4 / gridW)
  return { depth4, gridW, gridH, texW: w * gridW, texH: h * gridH }
}

export const GRID_MIN = 64
export const GRID_MAX = 256
export const GRID_BASE = 128

export function simGrid(scale: number): number {
  const g = Math.round(GRID_BASE * scale)
  const clamped = Math.max(GRID_MIN, Math.min(GRID_MAX, g))
  return clamped - (clamped % 2)
}

export const STATE_CHANNELS = 12
export const UPDATE_PROBABILITY = 0.5

/**
 * Per-step seed for the stochastic fire-rate mask, a PURE function of the genesis seed + step
 * index. hexells used `Math.random()*1000` per step, but this repo's share-link keystone requires
 * a run to be reproducible (same seed → same texture), so we derive it deterministically and keep
 * it in ~[0,1000) (the range the hash was tuned for). Same seed reproduces; a rolled seed varies.
 */
export function stepSeed(seed: number, i: number): number {
  const h = Math.imul((seed >>> 0) ^ Math.imul(i + 1, 0x9e3779b9), 0x85ebca6b) >>> 0
  return (h % 100000) / 100
}

// mulberry32 — deterministic PRNG so a seed reproduces the same genesis.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Initial state: all zeros (≈byte 127), matching hexells' clearCircle([0,0,0,0]). The texture
 *  grows via the stochastic fire-rate split + the steered perception (see seedAlignBytes). */
export function seedStateBytes(dims: TensorDims): Uint8Array {
  return new Uint8Array(dims.texW * dims.texH * 4).fill(127)
}

/** Seed the alignment field with random unit directions (hexells' disturb()). Stored in the RG
 *  channels of group 0 with packScaleZero [2, 127/255]; this steers the perception sobels. (The
 *  dominant genesis variety comes from the seed-driven fire-rate mask — see stepSeed; the align
 *  field is a second-order steering influence.) */
export function seedAlignBytes(n: number, dims: TensorDims, seed: number): Uint8Array {
  const buf = new Uint8Array(dims.texW * dims.texH * 4).fill(127)
  const rnd = mulberry32(seed || 1)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const a = rnd() * 2 * Math.PI
      const i = (y * dims.texW + x) * 4
      buf[i] = Math.max(0, Math.min(255, Math.round(127.5 + 127.5 * Math.cos(a))))
      buf[i + 1] = Math.max(0, Math.min(255, Math.round(127.5 + 127.5 * Math.sin(a))))
    }
  }
  return buf
}

import { type ParsedLayer, loadLayers, curatedById } from './models'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// GLSL (WebGL2 / GLSL ES 3.00) — ported from ca.js PREFIX + programs
// ─────────────────────────────────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
out vec2 uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// Shared preamble: tensor addressing + read helpers + the main input tensor + align tensor.
const PREFIX = `precision highp float;
const float PI = 3.14159265359;

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash23(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

struct Tensor { vec2 size; vec2 gridSize; float depth; float depth4; vec2 packScaleZero; };
uniform Tensor u_output;
out vec4 fragColor;

vec4 _readUV(Tensor t, sampler2D tex, vec2 uv) {
  vec4 v = texture(tex, uv);
  return (v - t.packScaleZero.y) * t.packScaleZero.x;
}
vec2 _getUV(Tensor t, vec2 pos, float ch) {
  ch += 0.5;
  float tx = floor(mod(ch, t.gridSize.x));
  float ty = floor(ch / t.gridSize.x);
  vec2 p = fract(pos / t.size) + vec2(tx, ty);
  return p / t.gridSize;
}
vec4 _read01(Tensor t, sampler2D tex, vec2 pos, float ch) { return texture(tex, _getUV(t, pos, ch)); }
vec4 _read(Tensor t, sampler2D tex, vec2 pos, float ch) { return _readUV(t, tex, _getUV(t, pos, ch)); }

vec2 getOutputXY() { return mod(gl_FragCoord.xy, u_output.size); }
float getOutputChannel() {
  vec2 xy = floor(gl_FragCoord.xy / u_output.size);
  return xy.y * u_output.gridSize.x + xy.x;
}
void setOutput(vec4 v) { fragColor = v / u_output.packScaleZero.x + u_output.packScaleZero.y; }

const float u_hexGrid = 1.0;
vec2 ang2vec(float a) { return vec2(cos(a), sin(a)); }

uniform Tensor u_input;  uniform sampler2D u_input_tex;
vec4 u_input_read(vec2 pos, float ch) { return _read(u_input, u_input_tex, pos, ch); }
vec4 u_input_read01(vec2 pos, float ch) { return _read01(u_input, u_input_tex, pos, ch); }
vec4 u_input_readUV(vec2 uv) { return _readUV(u_input, u_input_tex, uv); }

uniform Tensor u_alignTex;  uniform sampler2D u_alignTex_tex;
vec2 getCellDirection(vec2 xy) { return _read(u_alignTex, u_alignTex_tex, xy, 0.0).xy; }

vec4 conv3x3(vec2 xy, float inputCh, mat3 kernel) {
  vec4 a = vec4(0.0);
  for (int y = 0; y < 3; ++y)
  for (int x = 0; x < 3; ++x) {
    vec2 p = xy + vec2(float(x - 1), float(y - 1));
    a += kernel[y][x] * u_input_read(p, inputCh);
  }
  return a;
}
`

// perception: identity + (rotated) hex-sobel x/y + hex-gauss, packed 4 bands × state-groups.
const PERCEPTION_FRAG = `#version 300 es
${PREFIX}
const mat3 sobelXhex = mat3( 0.0, -1.0, 1.0,  -2.0, 0.0, 2.0,  -1.0, 1.0, 0.0)/8.0;
const mat3 sobelYhex = mat3( 0.0, -2.0,-2.0,   0.0, 0.0, 0.0,   2.0, 2.0, 0.0)/8.0;
const mat3 gaussHex  = mat3( 0.0,  2.0, 2.0,   2.0, 4.0-16.0, 2.0, 2.0, 2.0, 0.0)/8.0;
void main() {
  vec2 xy = getOutputXY();
  float ch = getOutputChannel();
  if (ch >= u_output.depth4) return;
  float filterBand = floor((ch + 0.5) / u_input.depth4);
  float inputCh = ch - filterBand * u_input.depth4;
  if (filterBand < 0.5) {
    setOutput(u_input_read(xy, inputCh));
  } else if (filterBand < 2.5) {
    vec4 dx = conv3x3(xy, inputCh, sobelXhex);
    vec4 dy = conv3x3(xy, inputCh, sobelYhex);
    vec2 dir = getCellDirection(xy);
    float s = dir.x, c = dir.y;
    setOutput(filterBand < 1.5 ? dx*c - dy*s : dx*s + dy*c);
  } else {
    setOutput(conv3x3(xy, inputCh, gaussHex));
  }
}`

// align: blur + renormalize the direction field (hexells' flow-alignment that steers perception).
const ALIGN_FRAG = `#version 300 es
${PREFIX}
const mat3 blurHex = mat3(0.0, 1.0, 1.0,  1.0, 1.0, 1.0,  1.0, 1.0, 0.0)/7.0;
void main() {
  vec2 xy = getOutputXY();
  vec4 v = conv3x3(xy, 0.0, blurHex);
  v.xy = normalize(v.xy);
  setOutput(v);
}`

// dense: matmul over the packed-PNG weight texture, model selected per-cell via u_control.
const DENSE_FRAG = `#version 300 es
${PREFIX}
uniform Tensor u_control;  uniform sampler2D u_control_tex;
vec4 u_control_read(vec2 pos, float ch) { return _read(u_control, u_control_tex, pos, ch); }
uniform sampler2D u_weightTex;
uniform vec2 u_weightCoefs; // [scale, 127/255]
uniform vec2 u_layout;      // [cols, rows] model tiling in the weight image
const float MAX_PACKED_DEPTH = 32.0;
vec4 readWeightUnscaled(vec2 p) { return texture(u_weightTex, p) - u_weightCoefs.y; }
void main() {
  vec2 xy = getOutputXY();
  float ch = getOutputChannel();
  if (ch >= u_output.depth4) return;
  float dy = 1.0 / (u_input.depth + 1.0) / u_layout.y;
  vec2 p = vec2((ch + 0.5) / u_output.depth4, dy * 0.5);
  float modelIdx = u_control_read(xy, 0.0).x + 0.5;
  p.x += floor(mod(modelIdx, u_layout.x));
  p.y += floor(modelIdx / u_layout.x);
  p /= u_layout;
  vec4 result = vec4(0.0);
  for (float i = 0.0; i < MAX_PACKED_DEPTH; i += 1.0) {
    vec4 inVec = u_input_read(xy, i);
    result += inVec.x * readWeightUnscaled(p); p.y += dy;
    result += inVec.y * readWeightUnscaled(p); p.y += dy;
    result += inVec.z * readWeightUnscaled(p); p.y += dy;
    result += inVec.w * readWeightUnscaled(p); p.y += dy;
    if (i + 1.5 > u_input.depth4) break;
  }
  result += readWeightUnscaled(p); // bias
  setOutput(result * u_weightCoefs.x);
}`

// update: state += delta, gated by a per-cell stochastic fire-rate mask.
const UPDATE_FRAG = `#version 300 es
${PREFIX}
uniform Tensor u_update;  uniform sampler2D u_update_tex;
vec4 u_update_readUV(vec2 uv) { return _readUV(u_update, u_update_tex, uv); }
uniform float u_seed, u_updateProbability;
in vec2 uv;
void main() {
  vec2 xy = getOutputXY();
  vec4 state = u_input_readUV(uv);
  vec4 update = vec4(0.0);
  if (hash13(vec3(xy, u_seed)) <= u_updateProbability) update = u_update_readUV(uv);
  setOutput(state + update);
}`

const DISPLAY_FRAG = `#version 300 es
precision highp float;
struct Tensor { vec2 size; vec2 gridSize; vec2 packScaleZero; };
uniform Tensor u_input;  uniform sampler2D u_input_tex;
uniform vec2 u_viewSize;
in vec2 uv;
out vec4 fragColor;
vec4 readTensorUV(vec2 p) { vec4 v = texture(u_input_tex, p); return (v - u_input.packScaleZero.y) * u_input.packScaleZero.x; }
vec2 tileUV(vec2 pos, float ch) {
  ch += 0.5;
  float tx = floor(mod(ch, u_input.gridSize.x));
  float ty = floor(ch / u_input.gridSize.x);
  return (fract(pos / u_input.size) + vec2(tx, ty)) / u_input.gridSize;
}
vec4 readTensor(vec2 pos, float ch) { return readTensorUV(tileUV(pos, ch)); }
const float u_hexGrid = 1.0;
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
vec4 getHex(vec2 u) {
  vec2 s = vec2(1.0, mix(2.0, 1.732, u_hexGrid));
  vec2 p = vec2(0.5 * u_hexGrid, 0.5);
  vec2 a = mod(u, s) * 2.0 - s;
  vec2 b = mod(u + s*p, s) * 2.0 - s;
  vec2 ai = floor(u / s);
  vec2 bi = floor(u / s + p);
  ai = vec2(ai.x - ai.y*u_hexGrid, ai.y*2.0 + 1.0);
  bi = vec2(bi.x - bi.y*u_hexGrid, bi.y*2.0);
  return dot(a,a) < dot(b,b) ? vec4(a, ai) : vec4(b, bi);
}
struct Hexel { vec2 cellXY; vec2 p; float zoom; };
Hexel screen2hex(vec2 xy) {
  xy /= u_viewSize; xy.y = 1.0 - xy.y;
  vec2 nv = u_viewSize / length(u_viewSize);
  xy = (xy * 0.85 + 0.25) * nv;
  Hexel h; float n = length(xy); h.zoom = 4.0 / (n*n);
  xy = cmul(xy, xy); xy = cmul(xy, xy); xy *= 160.0;
  vec4 r = getHex(xy); h.cellXY = r.zw; h.p = r.xy; return h;
}
void main() {
  vec2 xy = vec2(uv.x, 1.0 - uv.y);
  Hexel h = screen2hex(xy * u_viewSize);
  h.cellXY += 0.5;
  vec3 rgb = readTensor(h.cellXY, 0.0).rgb / 2.0 + 0.5;
  fragColor = vec4(rgb, 1.0);
}`

// ─────────────────────────────────────────────────────────────────────────────────────────────
// GL objects
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Tensor = {
  tex: WebGLTexture
  fbo: WebGLFramebuffer
  n: number
  depth: number
  dims: TensorDims
  packScaleZero: [number, number]
}

export type NeuralCaGL = {
  programs: { align: WebGLProgram; perception: WebGLProgram; dense: WebGLProgram; update: WebGLProgram; display: WebGLProgram }
  vao: WebGLVertexArrayObject
  state: Tensor
  newState: Tensor
  perception: Tensor
  hidden: Tensor // dense0 output
  delta: Tensor // dense1 output
  control: Tensor
  align: Tensor
  newAlign: Tensor
  weightTex: WebGLTexture[] // [layer0, layer1]
  layers: ParsedLayer[]
  n: number
  ready: boolean
  disposed: boolean // set by disposeGL so an in-flight async weight load can't leak textures
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`neural-ca shader compile failed: ${log}`)
  }
  return sh
}

function link(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc)
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc)
  const prog = gl.createProgram()!
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog)
    gl.deleteProgram(prog)
    throw new Error(`neural-ca program link failed: ${log}`)
  }
  return prog
}

function makeTensor(
  gl: WebGL2RenderingContext, n: number, depth: number,
  packScaleZero: [number, number], bytes?: Uint8Array,
): Tensor {
  const dims = tensorDims(n, n, depth)
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, dims.texW, dims.texH, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes ?? null)
  const fbo = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { tex, fbo, n, depth, dims, packScaleZero }
}

// Fill a depth-4 tensor's visible group with a constant RGBA value (bytes).
function constBytes(n: number, dims: TensorDims, rgba: [number, number, number, number]): Uint8Array {
  const buf = new Uint8Array(dims.texW * dims.texH * 4)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = (y * dims.texW + x) * 4
      buf[i] = rgba[0]; buf[i + 1] = rgba[1]; buf[i + 2] = rgba[2]; buf[i + 3] = rgba[3]
    }
  return buf
}

export function initGL(gl: WebGL2RenderingContext, n: number, seed: number, modelId: string): NeuralCaGL {
  const programs = {
    perception: link(gl, VERT, PERCEPTION_FRAG),
    align: link(gl, VERT, ALIGN_FRAG),
    dense: link(gl, VERT, DENSE_FRAG),
    update: link(gl, VERT, UPDATE_FRAG),
    display: link(gl, VERT, DISPLAY_FRAG),
  }
  const vao = gl.createVertexArray()!

  const C = STATE_CHANNELS
  const PERCEPTION = C * 4 // identity + sobelX + sobelY + gauss
  const HIDDEN = 96
  const stateQuant: [number, number] = [4.0, 127 / 255] // overwritten from layer1 once loaded

  const stateDims = tensorDims(n, n, C)
  const ctlDims = tensorDims(n, n, 4)
  // control: per-cell modelIdx (constant). packScaleZero [255,0] → stored byte == modelIdx.
  const idx = curatedById(modelId).index
  const control = makeTensor(gl, n, 4, [255, 0], constBytes(n, ctlDims, [idx, 0, 0, 0]))
  // align: evolving direction field seeded with random unit vectors (hexells' disturb()).
  const alignQuant: [number, number] = [2.0, 127 / 255]

  const gl_ = {
    programs, vao,
    state: makeTensor(gl, n, C, stateQuant, seedStateBytes(stateDims)),
    newState: makeTensor(gl, n, C, stateQuant),
    perception: makeTensor(gl, n, PERCEPTION, stateQuant),
    hidden: makeTensor(gl, n, HIDDEN, [2.0, 0.0]), // zero=0 ⇒ uint8 clamp realises ReLU
    delta: makeTensor(gl, n, C, [4.0, 127 / 255]),
    control,
    align: makeTensor(gl, n, 4, alignQuant, seedAlignBytes(n, ctlDims, seed)),
    newAlign: makeTensor(gl, n, 4, alignQuant),
    weightTex: [] as WebGLTexture[],
    layers: [] as ParsedLayer[],
    n, ready: false, disposed: false,
  }

  // async: fetch models.json (code-split), decode weight PNGs, then mark ready.
  void loadLayers().then(async (layers) => {
    if (gl_.disposed) return // navigated away before models.json resolved
    // allSettled (not all) so a partial decode failure can't orphan the sibling texture.
    const settled = await Promise.allSettled(layers.map((l) => loadWeightTexture(gl, l)))
    const weightTex = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    if (gl_.disposed || weightTex.length !== layers.length) {
      for (const t of weightTex) gl.deleteTexture(t) // torn down mid-decode, or a layer failed → free + bail
      if (weightTex.length !== layers.length) throw new Error('neural-ca: a weight layer failed to decode')
      return
    }
    gl_.layers = layers
    gl_.weightTex = weightTex
    // size hidden/delta/state quantization from the real layers
    gl_.hidden.packScaleZero = layers[0].quantScaleZero
    const stateQ = layers[1].quantScaleZero
    gl_.state.packScaleZero = stateQ
    gl_.newState.packScaleZero = stateQ
    gl_.delta.packScaleZero = stateQ
    gl_.ready = true
  }).catch((err) => {
    // Network/parse failure (or a non-fetchable URL under test): degrade gracefully — stay
    // not-ready (renders the zero state) instead of leaving an unhandled rejection.
    if (!gl_.disposed) console.warn('neural-ca: weight load failed', err)
  })

  return gl_
}

// Decode a base64-PNG weight image to a uint8 texture WITHOUT premultiplied alpha or colour-space
// conversion — the weights pack real values into all of RGBA, so any premultiply/gamma munging
// corrupts them and the net collapses (this is exactly why hexells decoded via UPNG). createImageBitmap
// with both disabled gives the raw bytes.
async function loadWeightTexture(gl: WebGL2RenderingContext, layer: ParsedLayer): Promise<WebGLTexture> {
  const blob = await (await fetch(layer.dataUri)).blob()
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false) // FIDELITY: tried both true/false — neither fixed the uniform collapse
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bmp)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  bmp.close()
  return tex
}

// Uniform-location caches. getUniformLocation is a synchronous driver name-lookup; the hot path
// runs ~100 uniform sets per sim step, so we resolve each location ONCE per program and memoize
// it (mirrors plasma's link-time `locs` map). Also avoids rebuilding the `name.field` strings every
// draw (GC). WeakMap keyed by program so switching diversions doesn't leak.
type TensorLocs = {
  size: WebGLUniformLocation | null
  gridSize: WebGLUniformLocation | null
  depth: WebGLUniformLocation | null
  depth4: WebGLUniformLocation | null
  packScaleZero: WebGLUniformLocation | null
  tex: WebGLUniformLocation | null
}
const tensorLocCache = new WeakMap<WebGLProgram, Map<string, TensorLocs>>()
function tensorLocs(gl: WebGL2RenderingContext, prog: WebGLProgram, name: string): TensorLocs {
  let m = tensorLocCache.get(prog)
  if (!m) { m = new Map(); tensorLocCache.set(prog, m) }
  let l = m.get(name)
  if (!l) {
    l = {
      size: gl.getUniformLocation(prog, `${name}.size`),
      gridSize: gl.getUniformLocation(prog, `${name}.gridSize`),
      depth: gl.getUniformLocation(prog, `${name}.depth`),
      depth4: gl.getUniformLocation(prog, `${name}.depth4`),
      packScaleZero: gl.getUniformLocation(prog, `${name}.packScaleZero`),
      tex: gl.getUniformLocation(prog, `${name}_tex`),
    }
    m.set(name, l)
  }
  return l
}
const scalarLocCache = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>()
// Pass a string LITERAL as `name` (interned → no per-call allocation).
function uloc(gl: WebGL2RenderingContext, prog: WebGLProgram, name: string): WebGLUniformLocation | null {
  let m = scalarLocCache.get(prog)
  if (!m) { m = new Map(); scalarLocCache.set(prog, m) }
  if (!m.has(name)) m.set(name, gl.getUniformLocation(prog, name))
  return m.get(name)!
}

function setTensorUniforms(gl: WebGL2RenderingContext, prog: WebGLProgram, name: string, t: Tensor, unit: number) {
  const L = tensorLocs(gl, prog, name)
  gl.uniform2f(L.size, t.n, t.n)
  gl.uniform2f(L.gridSize, t.dims.gridW, t.dims.gridH)
  gl.uniform1f(L.depth, t.depth)
  gl.uniform1f(L.depth4, t.dims.depth4)
  gl.uniform2f(L.packScaleZero, t.packScaleZero[0], t.packScaleZero[1])
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, t.tex)
  gl.uniform1i(L.tex, unit)
}

function setOutputUniforms(gl: WebGL2RenderingContext, prog: WebGLProgram, t: Tensor) {
  const L = tensorLocs(gl, prog, 'u_output')
  gl.uniform2f(L.size, t.n, t.n)
  gl.uniform2f(L.gridSize, t.dims.gridW, t.dims.gridH)
  gl.uniform1f(L.depth, t.depth)
  gl.uniform1f(L.depth4, t.dims.depth4)
  gl.uniform2f(L.packScaleZero, t.packScaleZero[0], t.packScaleZero[1])
}

function bindFbo(gl: WebGL2RenderingContext, t: Tensor) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo)
  gl.viewport(0, 0, t.dims.texW, t.dims.texH)
}

function runDense(gl: WebGL2RenderingContext, r: NeuralCaGL, out: Tensor, input: Tensor, layerIdx: number) {
  const prog = r.programs.dense
  const layer = r.layers[layerIdx]
  bindFbo(gl, out)
  gl.useProgram(prog)
  gl.bindVertexArray(r.vao)
  setOutputUniforms(gl, prog, out)
  setTensorUniforms(gl, prog, 'u_input', input, 0)
  setTensorUniforms(gl, prog, 'u_control', r.control, 1)
  gl.activeTexture(gl.TEXTURE2)
  gl.bindTexture(gl.TEXTURE_2D, r.weightTex[layerIdx])
  gl.uniform1i(uloc(gl, prog, 'u_weightTex'), 2)
  gl.uniform2f(uloc(gl, prog, 'u_weightCoefs'), layer.scale, 127 / 255)
  gl.uniform2f(uloc(gl, prog, 'u_layout'), layer.cols, layer.rows)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export function step(gl: WebGL2RenderingContext, r: NeuralCaGL, seed: number): void {
  if (!r.ready) return
  // align: evolve the direction field (newAlign ← blur+normalize(align))
  {
    const prog = r.programs.align
    bindFbo(gl, r.newAlign)
    gl.useProgram(prog)
    gl.bindVertexArray(r.vao)
    setOutputUniforms(gl, prog, r.newAlign)
    setTensorUniforms(gl, prog, 'u_input', r.align, 0)
    setTensorUniforms(gl, prog, 'u_alignTex', r.align, 1) // declared in PREFIX (unused here)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  // perception (steered by the freshly-evolved align field)
  {
    const prog = r.programs.perception
    bindFbo(gl, r.perception)
    gl.useProgram(prog)
    gl.bindVertexArray(r.vao)
    setOutputUniforms(gl, prog, r.perception)
    setTensorUniforms(gl, prog, 'u_input', r.state, 0)
    setTensorUniforms(gl, prog, 'u_alignTex', r.newAlign, 1)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  runDense(gl, r, r.hidden, r.perception, 0)
  runDense(gl, r, r.delta, r.hidden, 1)
  // update
  {
    const prog = r.programs.update
    bindFbo(gl, r.newState)
    gl.useProgram(prog)
    gl.bindVertexArray(r.vao)
    setOutputUniforms(gl, prog, r.newState)
    setTensorUniforms(gl, prog, 'u_input', r.state, 0)
    setTensorUniforms(gl, prog, 'u_update', r.delta, 1)
    setTensorUniforms(gl, prog, 'u_alignTex', r.align, 2) // unused but declared in PREFIX
    gl.uniform1f(uloc(gl, prog, 'u_seed'), seed)
    gl.uniform1f(uloc(gl, prog, 'u_updateProbability'), UPDATE_PROBABILITY)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  // swap ping-pong (state + align)
  const tmp = r.state
  r.state = r.newState
  r.newState = tmp
  const tmpA = r.align
  r.align = r.newAlign
  r.newAlign = tmpA
}

export function render(gl: WebGL2RenderingContext, r: NeuralCaGL): void {
  const vw = gl.drawingBufferWidth, vh = gl.drawingBufferHeight
  const prog = r.programs.display
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, vw, vh)
  gl.useProgram(prog)
  gl.bindVertexArray(r.vao)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, r.state.tex)
  gl.uniform1i(uloc(gl, prog, 'u_input_tex'), 0)
  gl.uniform2f(uloc(gl, prog, 'u_input.size'), r.n, r.n)
  gl.uniform2f(uloc(gl, prog, 'u_input.gridSize'), r.state.dims.gridW, r.state.dims.gridH)
  gl.uniform2f(uloc(gl, prog, 'u_input.packScaleZero'), r.state.packScaleZero[0], r.state.packScaleZero[1])
  gl.uniform2f(uloc(gl, prog, 'u_viewSize'), vw, vh)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  gl.bindVertexArray(null)
}

export function disposeGL(gl: WebGL2RenderingContext, r: NeuralCaGL): void {
  r.disposed = true // a still-pending weight load will now bail + free its own textures
  for (const p of Object.values(r.programs)) gl.deleteProgram(p)
  gl.deleteVertexArray(r.vao)
  for (const t of [r.state, r.newState, r.perception, r.hidden, r.delta, r.control, r.align, r.newAlign]) {
    gl.deleteTexture(t.tex)
    gl.deleteFramebuffer(t.fbo)
  }
  for (const t of r.weightTex) gl.deleteTexture(t)
}
