import { simDims, buildLUT, buildTerritoryColors, decayFromReach, MAX_HUES } from './field'
import { MAX_SOURCES, type LiveSource } from './sources'
import type { MorphogenConfig } from './schema'

const TRI_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// SIM: one diffuse + decay + inject step over all 4 morphogen channels at once.
// The 9-point stencil is Gray-Scott's verbatim (ortho 0.2, diag 0.05, center -1).
// Injection is a self-limiting Dirichlet-ish `max` (holds a channel at ≥ the source
// signal, so it can never blow out and the field is never dead). The optional
// Allen-Cahn term (`c(c-.5)(1-c)`) is MONOSTABLE — it sharpens existing interfaces
// but cannot nucleate new spots, so it never becomes Turing/Gray-Scott.
const SIM_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_state;   // RGBA32F = M0..M3
uniform vec2  u_texel;       // 1/simSize
uniform float u_D;           // diffusion
uniform float u_k;           // decay
uniform float u_aspect;      // simW/simH (round injection discs)
uniform float u_coupling;    // Allen-Cahn edge sharpening (0 = pure gradient)
uniform int   u_srcCount;
uniform vec4  u_src[${MAX_SOURCES}];   // xy=pos(0..1), z=radius, w=strength
uniform ivec2 u_srcMeta[${MAX_SOURCES}]; // x=shape(0 pt,1 vLine,2 hLine), y=channel
out vec4 fragColor;
vec4 lap(vec2 uv) {
  vec4 s = vec4(0.0);
  s += texture(u_state, uv + vec2(-1.0, 0.0) * u_texel) * 0.2;
  s += texture(u_state, uv + vec2( 1.0, 0.0) * u_texel) * 0.2;
  s += texture(u_state, uv + vec2( 0.0,-1.0) * u_texel) * 0.2;
  s += texture(u_state, uv + vec2( 0.0, 1.0) * u_texel) * 0.2;
  s += texture(u_state, uv + vec2(-1.0,-1.0) * u_texel) * 0.05;
  s += texture(u_state, uv + vec2( 1.0,-1.0) * u_texel) * 0.05;
  s += texture(u_state, uv + vec2(-1.0, 1.0) * u_texel) * 0.05;
  s += texture(u_state, uv + vec2( 1.0, 1.0) * u_texel) * 0.05;
  s += texture(u_state, uv) * -1.0;
  return s;
}
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  vec4 c  = texture(u_state, uv);
  vec4 nc = c + u_D * lap(uv) - u_k * c;
  if (u_coupling > 0.0) {
    nc += u_coupling * 0.25 * c * (c - vec4(0.5)) * (vec4(1.0) - c);
  }
  for (int i = 0; i < ${MAX_SOURCES}; i++) {
    if (i >= u_srcCount) break;
    vec4 s = u_src[i];
    int shp = u_srcMeta[i].x;
    int ch  = u_srcMeta[i].y;
    float d;
    if (shp == 1) d = abs(uv.x - s.x);
    else if (shp == 2) d = abs(uv.y - s.y);
    else { vec2 q = (uv - s.xy) * vec2(u_aspect, 1.0); d = length(q); }
    float inj = s.w * exp(-(d * d) / (s.z * s.z));
    if (ch == 0) nc.r = max(nc.r, inj);
    else if (ch == 1) nc.g = max(nc.g, inj);
    else if (ch == 2) nc.b = max(nc.b, inj);
    else nc.a = max(nc.a, inj);
  }
  fragColor = clamp(nc, 0.0, 1.0);
}`

// DISPLAY: read the morphogen vector; territories = argmax fate, bands = thresholded
// scalar. fwidth-anti-aliased borders throughout (crisp, no stair-step / mach band).
const DISPLAY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_state, u_lut;
uniform vec2  u_texel;       // 1/screenSize
uniform int   u_fateMode;    // 0 territories, 1 bands
uniform int   u_count;       // active morphogens
uniform int   u_bands;
uniform int   u_readout;     // bands: 0 single, 1 opposing ratio
uniform float u_banding, u_gamma, u_underlay, u_edge, u_territoryMix;
uniform vec3  u_terrCol[${MAX_HUES}];
out vec4 fragColor;
const float REF = 0.55;      // concentration → shade normalization
vec3 lut(float t) { return texture(u_lut, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb; }
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  vec4 m  = texture(u_state, uv);
  vec3 bg = lut(0.0);
  vec3 col;
  if (u_fateMode == 0) {
    float best = -1.0, second = -1.0; int terr = 0;
    for (int i = 0; i < 4; i++) {
      if (i >= u_count) break;
      float ci = m[i];
      if (ci > best) { second = best; best = ci; terr = i; }
      else if (ci > second) { second = ci; }
    }
    float local = pow(clamp(best / REF, 0.0, 1.0), u_gamma);
    vec3 ramp = lut(local);
    vec3 hue  = u_terrCol[terr];
    col = mix(ramp, clamp(hue * ramp * 1.3, 0.0, 1.0), u_territoryMix);
    float gap = best - second;
    float aa  = fwidth(gap) + 1e-4;
    float border = smoothstep(0.0, aa * 1.5, gap);      // 0 at border → 1 inside
    col = mix(col * (1.0 - u_edge), col, border);
    col = mix(bg, col, smoothstep(0.0, REF * 0.25, best)); // fade empty ground
  } else {
    float p = (u_readout == 1) ? m.r / (m.r + m.g + 1e-4) : clamp(m.r / REF, 0.0, 1.0);
    p = pow(clamp(p, 0.0, 1.0), u_gamma);
    float fb = float(u_bands);
    float scaled = p * fb;
    float aa = max(fwidth(scaled), 1e-4) * 0.75;
    float nb = floor(scaled + 0.5);                     // nearest band boundary
    float w  = smoothstep(-aa, aa, scaled - nb);        // AA across the boundary
    float idxF = clamp(mix(nb - 1.0, nb, w), 0.0, fb - 1.0);
    float shadeCrisp = (idxF + 0.5) / fb;
    float shade = mix(p, shadeCrisp, u_banding);        // banding 0=gradient → 1=bands
    col = lut(shade);
    col *= mix(1.0, 0.6 + 0.4 * p, u_underlay);         // faint gradient inside bands
    float line = smoothstep(0.0, aa * 2.0, abs(scaled - nb));
    col = mix(col * (1.0 - u_edge * u_banding), col, line);
  }
  fragColor = vec4(col, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src); gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh)
    throw new Error(`Morphogen shader compile failed: ${log}`)
  }
  return sh
}

function link(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc)
  let fs: WebGLShader
  try { fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc) }
  catch (e) { gl.deleteShader(vs); throw e }
  const prog = gl.createProgram()!
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
  gl.deleteShader(vs); gl.deleteShader(fs)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog); gl.deleteProgram(prog)
    throw new Error(`Morphogen program link failed: ${log}`)
  }
  return prog
}

function makeTex(
  gl: WebGL2RenderingContext, w: number, h: number,
  internal: number, format: number, type: number,
  filter: number, wrap: number, data: ArrayBufferView | null,
): WebGLTexture {
  const t = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap)
  return t
}

function fboFor(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const fb = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  return fb
}

/** Seed the field with the source footprints already stamped (so frame 1 isn't black
 *  — good gallery thumbnails); diffusion then just refines the gradient over ~seconds. */
function seedField(sources: LiveSource[], w: number, h: number, aspect: number): Float32Array {
  const out = new Float32Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ux = (x + 0.5) / w, uy = (y + 0.5) / h
      const idx = (y * w + x) * 4
      for (const s of sources) {
        let d: number
        if (s.shape === 1) d = Math.abs(ux - s.x)
        else if (s.shape === 2) d = Math.abs(uy - s.y)
        else { const qx = (ux - s.x) * aspect, qy = uy - s.y; d = Math.hypot(qx, qy) }
        const inj = s.strength * Math.exp(-(d * d) / (s.radius * s.radius))
        if (inj > out[idx + s.channel]) out[idx + s.channel] = inj
      }
    }
  }
  return out
}

export type MorphogenGL = {
  simProg: WebGLProgram
  displayProg: WebGLProgram
  vao: WebGLVertexArrayObject
  stateTex: [WebGLTexture, WebGLTexture]
  stateFbo: [WebGLFramebuffer, WebGLFramebuffer]
  lutTex: WebGLTexture
  simW: number
  simH: number
  cur: number
  stepAcc: number
  srcData: Float32Array   // MAX_SOURCES*4
  srcMeta: Int32Array     // MAX_SOURCES*2
  terrCol: Float32Array   // MAX_HUES*3
  locs: {
    sim: Record<string, WebGLUniformLocation | null>
    display: Record<string, WebGLUniformLocation | null>
  }
}

export function initGL(
  gl: WebGL2RenderingContext, cfg: MorphogenConfig, seedSources: LiveSource[], w: number, h: number,
): MorphogenGL {
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('Morphogen requires float render targets (EXT_color_buffer_float)')
  }
  // Float32 LINEAR is texture-incomplete (reads 0 → dead field) without this; fall
  // back to NEAREST where absent (functional, blockier display stretch).
  const stateFilter = gl.getExtension('OES_texture_float_linear') ? gl.LINEAR : gl.NEAREST
  const simProg = link(gl, TRI_VERT, SIM_FRAG)
  const displayProg = link(gl, TRI_VERT, DISPLAY_FRAG)
  const vao = gl.createVertexArray()!

  const { sw: simW, sh: simH } = simDims(w, h, cfg.gridResolution)
  const seed = seedField(seedSources, simW, simH, simW / simH)
  // CLAMP_TO_EDGE: a source's gradient must not toroidally bleed to the far edge.
  const stateTex: [WebGLTexture, WebGLTexture] = [
    makeTex(gl, simW, simH, gl.RGBA32F, gl.RGBA, gl.FLOAT, stateFilter, gl.CLAMP_TO_EDGE, seed),
    makeTex(gl, simW, simH, gl.RGBA32F, gl.RGBA, gl.FLOAT, stateFilter, gl.CLAMP_TO_EDGE, null),
  ]
  const stateFbo: [WebGLFramebuffer, WebGLFramebuffer] = [fboFor(gl, stateTex[0]), fboFor(gl, stateTex[1])]
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  const lutTex = makeTex(gl, 256, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE, buildLUT(cfg.palette))

  const u = (p: WebGLProgram, names: string[]) =>
    Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]))
  const locs = {
    sim: u(simProg, ['u_state', 'u_texel', 'u_D', 'u_k', 'u_aspect', 'u_coupling',
      'u_srcCount', 'u_src', 'u_srcMeta']),
    display: u(displayProg, ['u_state', 'u_lut', 'u_texel', 'u_fateMode', 'u_count',
      'u_bands', 'u_readout', 'u_banding', 'u_gamma', 'u_underlay', 'u_edge',
      'u_territoryMix', 'u_terrCol']),
  }
  return {
    simProg, displayProg, vao, stateTex, stateFbo, lutTex, simW, simH, cur: 0, stepAcc: 0,
    srcData: new Float32Array(MAX_SOURCES * 4),
    srcMeta: new Int32Array(MAX_SOURCES * 2),
    terrCol: buildTerritoryColors(cfg.territoryColors),
    locs,
  }
}

export function uploadLUT(gl: WebGL2RenderingContext, res: MorphogenGL, stops: string[]): void {
  gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLUT(stops))
}

export function disposeGL(gl: WebGL2RenderingContext, res: MorphogenGL): void {
  for (const p of [res.simProg, res.displayProg]) gl.deleteProgram(p)
  gl.deleteVertexArray(res.vao)
  for (const t of [...res.stateTex, res.lutTex]) gl.deleteTexture(t)
  for (const f of res.stateFbo) gl.deleteFramebuffer(f)
}

function fullscreen(gl: WebGL2RenderingContext, res: MorphogenGL) {
  gl.bindVertexArray(res.vao)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

/** Pack live sources into the fixed-size uniform arrays. */
function packSources(res: MorphogenGL, sources: LiveSource[]): number {
  const n = Math.min(sources.length, MAX_SOURCES)
  for (let i = 0; i < n; i++) {
    const s = sources[i]
    res.srcData[i * 4 + 0] = s.x
    res.srcData[i * 4 + 1] = s.y
    res.srcData[i * 4 + 2] = s.radius
    res.srcData[i * 4 + 3] = s.strength
    res.srcMeta[i * 2 + 0] = s.shape
    res.srcMeta[i * 2 + 1] = s.channel
  }
  return n
}

// The sim uniforms (D/k/sources/…) are constant across a frame's sub-steps, so they
// are set ONCE in render() before the loop; a sub-step only rebinds the ping-pong
// src texture + dst framebuffer and draws (avoids re-uploading the 48-float source
// array simSpeed× per frame — up to 32× at max speed).
function step(gl: WebGL2RenderingContext, res: MorphogenGL): void {
  const src = res.cur, dst = src ^ 1
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.stateFbo[dst])
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.stateTex[src])
  fullscreen(gl, res)
  res.cur = dst
}

/** Advance cfg.simSpeed steps (fractional accumulator) with the current source
 *  positions, then display the field. Sources are constant across a frame's
 *  sub-steps (evaluated once per frame in index.ts). */
export function render(gl: WebGL2RenderingContext, res: MorphogenGL, cfg: MorphogenConfig, sources: LiveSource[]): void {
  const srcN = packSources(res, sources)
  const k = decayFromReach(cfg.gradientReach, Math.min(res.simW, res.simH))
  res.stepAcc += cfg.simSpeed
  const steps = Math.floor(res.stepAcc)
  res.stepAcc -= steps
  if (steps > 0) {
    // Set the sim uniforms once; the sub-step loop then only swaps ping-pong buffers.
    gl.disable(gl.BLEND)
    gl.viewport(0, 0, res.simW, res.simH)
    gl.useProgram(res.simProg)
    gl.uniform1i(res.locs.sim.u_state, 0)
    gl.uniform2f(res.locs.sim.u_texel, 1 / res.simW, 1 / res.simH)
    gl.uniform1f(res.locs.sim.u_D, 1.0)
    gl.uniform1f(res.locs.sim.u_k, k)
    gl.uniform1f(res.locs.sim.u_aspect, res.simW / res.simH)
    gl.uniform1f(res.locs.sim.u_coupling, cfg.reactionCoupling)
    gl.uniform1i(res.locs.sim.u_srcCount, srcN)
    gl.uniform4fv(res.locs.sim.u_src, res.srcData)
    gl.uniform2iv(res.locs.sim.u_srcMeta, res.srcMeta)
    for (let i = 0; i < steps; i++) step(gl, res)
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.useProgram(res.displayProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.stateTex[res.cur])
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.uniform1i(res.locs.display.u_state, 0)
  gl.uniform1i(res.locs.display.u_lut, 1)
  gl.uniform2f(res.locs.display.u_texel, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight)
  gl.uniform1i(res.locs.display.u_fateMode, cfg.fateMode === 'bands' ? 1 : 0)
  gl.uniform1i(res.locs.display.u_count, cfg.morphogenCount)
  gl.uniform1i(res.locs.display.u_bands, cfg.bands)
  gl.uniform1i(res.locs.display.u_readout, cfg.sourceLayout === 'poles' ? 1 : 0)
  gl.uniform1f(res.locs.display.u_banding, cfg.banding)
  gl.uniform1f(res.locs.display.u_gamma, cfg.bandGamma)
  gl.uniform1f(res.locs.display.u_underlay, cfg.gradientUnderlay)
  gl.uniform1f(res.locs.display.u_edge, cfg.edgeStrength)
  gl.uniform1f(res.locs.display.u_territoryMix, cfg.territoryMix)
  gl.uniform3fv(res.locs.display.u_terrCol, res.terrCol)
  fullscreen(gl, res)
}

export function uploadTerritoryColors(res: MorphogenGL, hues: string[]): void {
  res.terrCol = buildTerritoryColors(hues)
}
