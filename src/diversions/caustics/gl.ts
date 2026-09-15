import { hexToRgb } from '../../framework/color'
import { NT, REFRACT_K, type Spectrum } from './spectrum'
import { FLOOR_INDEX, type CausticsConfig } from './schema'

/** Additive unit-point splat into an R16F accumulation buffer, then a resolve
 *  pass that tone-maps ray density over a pool floor.
 *
 *  This is NOT a novel renderer class, whatever the spec said before 2026-09-14 —
 *  `physarum/gl.ts` and `labyrinth/gl.ts` already ship the same shape, and the
 *  `initGL` / `makeTex` / `fboFor` / `disposeGL` helpers below are theirs. */

export const RAYS_PER_PX = 14
export const ACC_SCALE = 0.42
export const ACC_MAX_PX = 720_000

/* ---- splat: one vertex per surface sample, refracted to its landing point ---- */
export const SPLAT_VS = `#version 300 es
precision highp float;
uniform vec2  uGrid;      // surface sample grid
uniform vec2  uExtent;    // world metres across the canvas
uniform float uTime, uAmp, uDepth, uGust;
uniform vec4  uTrain[${NT}];   // kx, ky, spatial phase, unused
uniform vec4  uTrainB[${NT}];  // amplitude, gust susceptibility, time phase, time weight
void main(){
  int id = gl_VertexID;
  int gw = int(uGrid.x);
  vec2 uv = vec2(float(id % gw) / (uGrid.x - 1.0), float(id / gw) / (uGrid.y - 1.0));
  vec2 p  = (uv - 0.5) * uExtent;

  // slow drifting gust field — low spatial frequency, IN-FRAME wavelength.
  // (authored too long and it does nothing at all; that is the easy mistake.)
  float g = sin( 2.05*p.x + 1.25*p.y + uTime*0.246)
          + sin(-1.55*p.x + 2.35*p.y + uTime*0.198)
          + sin( 0.80*p.x - 1.90*p.y + uTime*0.162);
  float gn = g / 3.0;

  // A travelling train is sin(k.p + phi - wt); a STANDING one (a pool is a
  // closed basin, so its long modes are seiches sloshing between the walls,
  // with nodes that stay put) is sin(k.p + phi)*cos(wt). The time factor of
  // each is uniform over the surface, so both collapse to the same one-trig
  // form with a per-frame phase and weight -- standing costs nothing extra.
  vec2 grad = vec2(0.0);
  for (int i = 0; i < ${NT}; i++) {
    vec4 t = uTrain[i];
    vec4 b = uTrainB[i];
    // the gust ruffles SHORT waves and barely touches the swell, so a gust
    // changes the local cell SIZE and not merely the brightness
    float m = 1.0 + uGust * gn * b.y;
    grad += uAmp * b.x * m * b.w * cos(t.x*p.x + t.y*p.y + t.z + b.z) * t.xy;
  }
  // small-slope refraction: landing point on the floor, n = 1.33. The constant is
  // interpolated from REFRACT_K so the shader and the brightness guard cannot
  // drift apart.
  vec2 land = p - uDepth * ${REFRACT_K} * grad;
  gl_Position  = vec4((land / uExtent) * 2.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}`

export const SPLAT_FS = `#version 300 es
precision highp float;
out vec4 o;
void main(){ o = vec4(1.0); }`

/* ---- resolve: tone-map the ray density over a pool floor ---- */
export const QUAD_VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

export const RESOLVE_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uAcc;
uniform vec2  uAccTexel, uExtent;
uniform float uMean;      // expected rays/px == 1.0 of exposure
uniform float uTileSize;
uniform int   uFloor;
uniform vec3  uBackground, uLight;   // LINEAR; the CPU sends pow(hex, 2.2)

vec3 floorColour(vec2 w, vec3 base){
  if (uFloor == 1) return base;
  if (uFloor == 2) {                                   // sand: soft mottle
    float n = sin(w.x*11.0)*sin(w.y*13.0) + 0.6*sin(w.x*27.0+1.3)*sin(w.y*23.0-0.7);
    return base * (0.93 + 0.09 * n);
  }
  vec2 t = w / uTileSize;
  vec2 f = abs(fract(t) - 0.5);
  // deliberately faint: the caustic is the subject and a hard grid competes
  // with it. Narrow line, shallow darkening, barely-there per-tile variation.
  float grout = smoothstep(0.470, 0.500, max(f.x, f.y));
  vec2 cell = floor(t);
  float v = fract(sin(dot(cell, vec2(12.99, 78.23))) * 43758.55);
  return mix(base * (0.985 + 0.030*v), base * 0.90, grout);
}

void main(){
  // 5-tap smoothing: the accumulation buffer is a ray histogram, so it is noisy
  float a = texture(uAcc, vUv).r * 4.0;
  a += texture(uAcc, vUv + vec2( uAccTexel.x, 0)).r;
  a += texture(uAcc, vUv + vec2(-uAccTexel.x, 0)).r;
  a += texture(uAcc, vUv + vec2(0,  uAccTexel.y)).r;
  a += texture(uAcc, vUv + vec2(0, -uAccTexel.y)).r;
  float e = (a / 8.0) / max(uMean, 1e-5);              // 1.0 == unrefracted

  vec2 w = (vUv - 0.5) * uExtent;
  vec3 base = floorColour(w, uBackground);

  // e == 1.0 is undisturbed density, so the caustic is the EXCESS above it.
  // Mapping from 0 rather than from 1 floods the floor with white and loses
  // the dark water the filaments are supposed to read against.
  float x    = max(e - 0.88, 0.0);
  float lit  = x / (1.0 + x * 0.85);                   // soft shoulder, no clipping
  float band = pow(clamp(lit * 1.05, 0.0, 1.0), 1.70);
  vec3 col = base * (0.88 + 0.34 * clamp(e, 0.0, 1.2)) + uLight * band * 0.90;
  col += uLight * pow(clamp(x * 0.22, 0.0, 1.0), 2.6) * 0.42;   // filament core bloom

  float r = length((vUv - 0.5) * vec2(1.0, 0.62));
  col *= 1.0 - 0.30 * r * r;                                   // gentle vignette
  o = vec4(pow(max(col, 0.0), vec3(1.0/2.2)), 1.0);
}`

export interface CausticsGL {
  splat: WebGLProgram
  resolve: WebGLProgram
  vao: WebGLVertexArrayObject
  accTex: WebGLTexture | null // null until the first resizeTargets()
  accFBO: WebGLFramebuffer | null
  accW: number
  accH: number
  gridW: number
  gridH: number
  nPoints: number
  splatU: Record<string, WebGLUniformLocation | null>
  resolveU: Record<string, WebGLUniformLocation | null>
  /** Cached sRGB→linear conversions. The two colours can only change through
   *  `update()`, and re-deriving them per frame allocates four short-lived arrays
   *  and runs six `Math.pow`s for a value that did not move — the same waste
   *  `labyrinth/gl.ts` calls out and caches hex-keyed. It does not measure
   *  (~113 ns/frame), but the sibling documented the convention and this is the
   *  file that broke it. */
  bgHex: string
  bgVec: [number, number, number]
  lightHex: string
  lightVec: [number, number, number]
}

/** Rays scale with accumulation AREA, which scales with device pixels without
 *  bound. Cap the buffer and let it soft-scale.
 *
 *  ⚠️ READ THE THRESHOLD BEFORE RE-TUNING ANYTHING HERE. This is NOT a 5K safety
 *  valve, which is what an earlier version of this comment claimed and what the
 *  plan's own table (2026-09-12, lines 384-388) already contradicted. The cap
 *  binds above `ACC_MAX_PX / ACC_SCALE²` = **4.08 M device px**, i.e. on EVERY
 *  DPR-2 display wider than ~1278 CSS px — every current Mac laptop, and the
 *  machine the look was approved on. Measured:
 *
 *    surface                    device px    acc px   capped  upsample   points
 *    gallery tile @2              670x419    49,456   no       2.38x     0.69 M
 *    1440x900 @1                 1440x900   228,690   no       2.38x     3.20 M
 *    1440x900 @2 (most Macs)    2880x1800   719,983   YES      2.68x    10.08 M
 *    1920x1080 @2               3840x2160   719,952   YES      3.39x    10.08 M
 *    5K 2560x1440 @2            5120x2880   720,447   YES      4.53x    10.09 M
 *
 *  So what the cap really does is pin the ray budget at ~10.08 M on every capped
 *  display — almost exactly the mockup's measured-good 9.8 M. That is the
 *  mechanism by which the mockup's frame rate transfers to shipped hardware, and
 *  it is the ONLY thing bounding this piece's cost. The fidelity it spends is the
 *  upsample factor, and only for the caustic: `floorColour`, the bloom and the
 *  vignette are all evaluated per device pixel in RESOLVE_FS, so grout and sand
 *  stay sharp at any size.
 *
 *  The trade it chose, stated so the next person does not have to re-derive it:
 *  at a fixed ~10 M point budget you may spend it as (capped acc, 14 rays/px,
 *  SOFT) — what ships — or (uncapped acc, fewer rays/px, SHARP and noisier). At
 *  3840x2160 the second is 2.38x upsample at RAYS_PER_PX ≈ 7 for the same GPU
 *  cost. Softness reads better than shot noise on a caustic, so this is the right
 *  default, but it is a choice and not a law. `RAYS_PER_PX` is the single lever
 *  if a non-Apple verify ever shows frame drops. */
export function accSizeFor(w: number, h: number): { accW: number; accH: number } {
  let accW = Math.max(2, Math.round(w * ACC_SCALE))
  let accH = Math.max(2, Math.round(h * ACC_SCALE))
  const over = (accW * accH) / ACC_MAX_PX
  if (over > 1) {
    const s = Math.sqrt(over)
    accW = Math.max(2, Math.round(accW / s))
    accH = Math.max(2, Math.round(accH / s))
  }
  return { accW, accH }
}

/** gridH >= accH*sqrt(R) and gridW >= gridH*aspect, so gridW*gridH >= accW*accH*R
 *  unconditionally — no correction loop is reachable. Note `ceil`, not the
 *  mockup's `round`: with `round` the mockup actually undershoots its own budget
 *  (1058x662 gives 9,803,966 rays against 9,805,544 needed). */
export function gridFor(accW: number, accH: number): { gridW: number; gridH: number } {
  const aspect = accW / accH
  const gridH = Math.max(8, Math.ceil(Math.sqrt((accW * accH * RAYS_PER_PX) / aspect)))
  const gridW = Math.max(8, Math.ceil(gridH * aspect))
  return { gridW, gridH }
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`Caustics shader compile failed: ${log}`)
  }
  return sh
}

function link(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc)
  let fs: WebGLShader
  try {
    fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc)
  } catch (e) {
    gl.deleteShader(vs)
    throw e
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog)
    gl.deleteProgram(prog)
    throw new Error(`Caustics program link failed: ${log}`)
  }
  return prog
}

export function initGL(gl: WebGL2RenderingContext): CausticsGL {
  // R16F, never R32F: float32 textures are NOT filterable in core WebGL2, so a
  // LINEAR sampler over R32F silently returns 0 and the whole caustic vanishes
  // with no GL error. Rendering to R16F needs one of these two extensions.
  //
  // There is deliberately NO R8 fallback. R8 is a *normalized* target, so under
  // blendFunc(ONE, ONE) with SPLAT_FS emitting 1.0 every texel saturates on its
  // FIRST ray; the resolve then computes e = 1/uMean = 0.071 and x = max(e-0.88,
  // 0) = 0, i.e. flat water with no caustic anywhere and no GL error, forever.
  // That is a worse failure than throwing. Six diversions already throw here.
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) {
    throw new Error('Caustics requires float render targets (EXT_color_buffer_float)')
  }
  const splat = link(gl, SPLAT_VS, SPLAT_FS)
  const resolve = link(gl, QUAD_VS, RESOLVE_FS)
  const vao = gl.createVertexArray()!
  const u = (p: WebGLProgram, names: string[]) =>
    Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]))
  return {
    splat,
    resolve,
    vao,
    accTex: null,
    accFBO: null,
    accW: 0,
    accH: 0,
    gridW: 0,
    gridH: 0,
    nPoints: 0,
    // Uniform locations are cached HERE only; resizeTargets never touches a program.
    splatU: u(splat, ['uGrid', 'uExtent', 'uTime', 'uAmp', 'uDepth', 'uGust', 'uTrain', 'uTrainB']),
    resolveU: u(resolve, ['uAcc', 'uAccTexel', 'uExtent', 'uMean', 'uTileSize', 'uFloor',
      'uBackground', 'uLight']),
    bgHex: '',
    bgVec: [0, 0, 0],
    lightHex: '',
    lightVec: [0, 0, 0],
  }
}

export function resizeTargets(
  gl: WebGL2RenderingContext, res: CausticsGL, w: number, h: number,
): void {
  const { accW, accH } = accSizeFor(w, h)
  if (accW === res.accW && accH === res.accH && res.accTex) return
  if (res.accTex) {
    gl.deleteTexture(res.accTex)
    gl.deleteFramebuffer(res.accFBO)
  }
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, accW, accH, 0, gl.RED, gl.HALF_FLOAT, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const fbo = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  const grid = gridFor(accW, accH)
  res.accTex = tex
  res.accFBO = fbo
  res.accW = accW
  res.accH = accH
  res.gridW = grid.gridW
  res.gridH = grid.gridH
  res.nPoints = grid.gridW * grid.gridH
}

/** sRGB hex -> LINEAR triple. The shader gamma-encodes on output, so a raw hex
 *  upload renders a different colour than the picker shows. */
function toLinear(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex)
  return [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)]
}

export function render(
  gl: WebGL2RenderingContext, res: CausticsGL, cfg: CausticsConfig, spec: Spectrum, clock: number,
): void {
  if (!res.accFBO) return
  // Extent comes from the DRAWING BUFFER, not accW/accH — their independent
  // rounding would shear deposit space against floor space. Both passes read the
  // same uExtent.
  const bw = gl.drawingBufferWidth
  const bh = gl.drawingBufferHeight
  const extentX = cfg.scale
  const extentY = extentX * bh / bw

  gl.bindVertexArray(res.vao)
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.accFBO)
  gl.viewport(0, 0, res.accW, res.accH)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE)
  gl.useProgram(res.splat)
  gl.uniform2f(res.splatU.uGrid, res.gridW, res.gridH)
  gl.uniform2f(res.splatU.uExtent, extentX, extentY)
  gl.uniform1f(res.splatU.uTime, clock)
  gl.uniform1f(res.splatU.uAmp, cfg.ripple)
  gl.uniform1f(res.splatU.uDepth, cfg.depth)
  gl.uniform1f(res.splatU.uGust, cfg.gust)
  gl.uniform4fv(res.splatU.uTrain, spec.trains)
  gl.uniform4fv(res.splatU.uTrainB, spec.trainsB)
  gl.drawArrays(gl.POINTS, 0, res.nPoints)
  gl.disable(gl.BLEND)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, bw, bh)
  gl.useProgram(res.resolve)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, res.accTex)
  gl.uniform1i(res.resolveU.uAcc, 0)
  gl.uniform2f(res.resolveU.uAccTexel, 1 / res.accW, 1 / res.accH)
  gl.uniform2f(res.resolveU.uExtent, extentX, extentY)
  gl.uniform1f(res.resolveU.uMean, res.nPoints / (res.accW * res.accH))
  gl.uniform1f(res.resolveU.uTileSize, cfg.tileSize)
  gl.uniform1i(res.resolveU.uFloor, FLOOR_INDEX.indexOf(cfg.floor))
  if (cfg.background !== res.bgHex) {
    res.bgHex = cfg.background
    res.bgVec = toLinear(cfg.background)
  }
  if (cfg.light !== res.lightHex) {
    res.lightHex = cfg.light
    res.lightVec = toLinear(cfg.light)
  }
  gl.uniform3f(res.resolveU.uBackground, res.bgVec[0], res.bgVec[1], res.bgVec[2])
  gl.uniform3f(res.resolveU.uLight, res.lightVec[0], res.lightVec[1], res.lightVec[2])
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export function disposeGL(gl: WebGL2RenderingContext, res: CausticsGL): void {
  gl.deleteProgram(res.splat)
  gl.deleteProgram(res.resolve)
  gl.deleteVertexArray(res.vao)
  if (res.accTex) gl.deleteTexture(res.accTex)
  if (res.accFBO) gl.deleteFramebuffer(res.accFBO)
}
