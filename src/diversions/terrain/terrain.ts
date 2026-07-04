// Terrain — framework-agnostic drawing + math for the fractal mountain range.
// Pure functions (no DOM-instantiating imports) so it stays unit-testable. The
// heightfield is generated in a normalized, viewport-independent domain and
// sampled per screen column, so a resize just re-samples (no restart) and an
// advancing scroll offset yields endless, seamless procedural mountains.
import { makeNoise3D } from '../../framework/rng'
import type { TerrainConfig } from './schema'

export type RGB = readonly [number, number, number]

export interface Palette {
  skyTop: RGB // zenith
  skyBottom: RGB // horizon glow
  sun: RGB // sun/moon disc + halo
  haze: RGB // colour distant ridges wash toward
  land: RGB // colour of the nearest (darkest) ridge
}

// Curated time-of-day palettes. Kept as plain RGB so they interpolate cleanly
// for the Auto day-cycle.
export const PALETTES: Record<Exclude<TerrainConfig['timeOfDay'], 'Auto'>, Palette> = {
  Dawn: {
    skyTop: [46, 42, 78], skyBottom: [242, 164, 120], sun: [255, 214, 170],
    haze: [206, 178, 196], land: [40, 36, 58],
  },
  Day: {
    skyTop: [74, 138, 214], skyBottom: [186, 214, 240], sun: [255, 250, 235],
    haze: [176, 198, 222], land: [46, 58, 74],
  },
  Dusk: {
    skyTop: [58, 40, 86], skyBottom: [232, 120, 86], sun: [255, 180, 120],
    haze: [176, 120, 120], land: [30, 24, 40],
  },
  Night: {
    skyTop: [12, 16, 38], skyBottom: [40, 54, 84], sun: [220, 226, 238],
    haze: [70, 86, 116], land: [10, 14, 26],
  },
  Alpenglow: {
    skyTop: [78, 48, 92], skyBottom: [255, 150, 120], sun: [255, 196, 150],
    haze: [224, 150, 150], land: [36, 26, 44],
  },
}

// The ring the Auto cycle drifts through (Alpenglow is a deliberate pick, not
// part of the natural day loop).
export const CYCLE_RING: Array<Exclude<TerrainConfig['timeOfDay'], 'Auto'>> = ['Night', 'Dawn', 'Day', 'Dusk']

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Linear per-channel RGB blend, rounded to bytes. */
export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ]
}

function mixPalette(a: Palette, b: Palette, t: number): Palette {
  return {
    skyTop: mixRGB(a.skyTop, b.skyTop, t),
    skyBottom: mixRGB(a.skyBottom, b.skyBottom, t),
    sun: mixRGB(a.sun, b.sun, t),
    haze: mixRGB(a.haze, b.haze, t),
    land: mixRGB(a.land, b.land, t),
  }
}

export const rgb = (c: RGB) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`
export const rgba = (c: RGB, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`

/** The palette for a given time-of-day. 'Auto' interpolates continuously around
 *  the day ring based on elapsed seconds; a fixed choice returns that palette. */
export function resolvePalette(timeOfDay: TerrainConfig['timeOfDay'], tSec: number, cycleMinutes: number): Palette {
  if (timeOfDay !== 'Auto') return PALETTES[timeOfDay]
  const period = Math.max(0.001, cycleMinutes) * 60
  const phase = (((tSec / period) % 1) + 1) % 1 // 0..1
  const f = phase * CYCLE_RING.length
  const i = Math.floor(f) % CYCLE_RING.length
  const j = (i + 1) % CYCLE_RING.length
  return mixPalette(PALETTES[CYCLE_RING[i]], PALETTES[CYCLE_RING[j]], f - Math.floor(f))
}

// --- Fractal heightfield -----------------------------------------------------

// Octave-1 wavelength in world pixels — sets the base mountain width.
const FEATURE_PX = 340
// Sample spacing along a ridge in CSS px (2 keeps ridges crisp yet halves work).
export const STEP = 2
const HORIZON_FRAC = 0.46
// scrollSpeed unit → px/sec (near ridge); morphSpeed unit → noise-z units/sec.
const SCROLL_UNIT = 4
const MORPH_UNIT = 0.04

export type Noise3D = (x: number, y: number, z: number) => number
export const createNoise = (seed: number): Noise3D => makeNoise3D(seed)

export interface Layer {
  depth: number // 0 = farthest, 1 = nearest
  baseY: number // the sea-level line the ridge is drawn down from (px)
  amp: number // peak height above baseY (px)
  parallax: number // scroll multiplier (near scrolls faster)
  z: number // distinct noise slice so each ridge has its own profile
}

/** Geometry for every ridge layer, front-to-back independent of scroll/time so a
 *  resize just recomputes it. Layers are ordered far (index 0) → near. */
export function computeLayers(cfg: TerrainConfig, w: number, h: number): Layer[] {
  void w
  const n = cfg.ridgeLayers
  const horizonY = h * HORIZON_FRAC
  const layers: Layer[] = []
  for (let k = 0; k < n; k++) {
    const depth = n > 1 ? k / (n - 1) : 1
    layers.push({
      depth,
      baseY: lerp(horizonY, h * 0.99, depth),
      amp: cfg.peakHeight * h * lerp(0.14, 0.5, depth),
      parallax: lerp(0.12, 1, depth),
      z: 10 + k * 3.7,
    })
  }
  return layers
}

/** Summed value-noise octaves at a world position → [-1, 1]. `roughness` is the
 *  per-octave persistence (fractal dimension knob). */
export function ridgeFbm(
  noise: Noise3D, worldX: number, z: number, morphZ: number, octaves: number, roughness: number,
): number {
  let amp = 1, freq = 1, sum = 0, norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(worldX * freq, z, morphZ)
    norm += amp
    amp *= roughness
    freq *= 2
  }
  return norm > 0 ? sum / norm : 0
}

/** Screen-space y of a ridge at a column, given the layer's scroll offset. The
 *  fractal is sampled in a normalized world domain, so `xOff` sliding forward
 *  scrolls endless seamless terrain. */
export function sampleRidgeY(
  noise: Noise3D, layer: Layer, screenX: number, xOff: number, morphZ: number,
  octaves: number, roughness: number,
): number {
  const worldX = (screenX + xOff) / FEATURE_PX
  const n = ridgeFbm(noise, worldX, layer.z, morphZ, octaves, roughness) // [-1,1]
  const h01 = (n + 1) / 2 // 0..1
  return layer.baseY - layer.amp * h01
}

// --- Rendering ---------------------------------------------------------------

interface DrawCtx {
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient
  fillStyle: string | CanvasGradient | CanvasPattern
  fillRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  closePath(): void
  fill(): void
}

function drawSky(ctx: DrawCtx, pal: Palette, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, rgb(pal.skyTop))
  g.addColorStop(1, rgb(pal.skyBottom))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function drawSun(ctx: DrawCtx, pal: Palette, w: number, h: number) {
  const cx = w * 0.72
  const cy = h * HORIZON_FRAC - h * 0.02
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.5)
  halo.addColorStop(0, rgba(pal.sun, 0.5))
  halo.addColorStop(0.25, rgba(pal.sun, 0.2))
  halo.addColorStop(1, rgba(pal.sun, 0))
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, w, h)
  const cr = h * 0.05
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr)
  core.addColorStop(0, rgba(pal.sun, 0.95))
  core.addColorStop(0.7, rgba(pal.sun, 0.7))
  core.addColorStop(1, rgba(pal.sun, 0))
  ctx.fillStyle = core
  ctx.fillRect(cx - cr * 2, cy - cr * 2, cr * 4, cr * 4)
}

/** Draw the whole scene for one frame into a 2D-like context (CSS px). Painter's
 *  order: sky → sun → ridges far→near, each a filled silhouette washed toward the
 *  haze colour by distance × atmosphere. */
export function drawScene(
  ctx: DrawCtx, noise: Noise3D, layers: Layer[], cfg: TerrainConfig, pal: Palette,
  w: number, h: number, scrollDist: number, morphZ: number,
) {
  drawSky(ctx, pal, w, h)
  drawSun(ctx, pal, w, h)
  for (const layer of layers) {
    const hazeAmt = (1 - layer.depth) * cfg.atmosphere
    ctx.fillStyle = rgb(mixRGB(pal.land, pal.haze, hazeAmt))
    const xOff = scrollDist * layer.parallax
    ctx.beginPath()
    ctx.moveTo(0, sampleRidgeY(noise, layer, 0, xOff, morphZ, cfg.detail, cfg.roughness))
    for (let sx = STEP; sx <= w; sx += STEP) {
      ctx.lineTo(sx, sampleRidgeY(noise, layer, sx, xOff, morphZ, cfg.detail, cfg.roughness))
    }
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    ctx.fill()
  }
}

// --- State -------------------------------------------------------------------

export interface TerrainState {
  cfg: TerrainConfig
  w: number
  h: number
  noise: Noise3D
  layers: Layer[]
  scrollDist: number // accumulated scroll px (near-ridge baseline)
  morphZ: number // accumulated noise-z morph
  tSec: number // accumulated seconds (drives the Auto day cycle)
}

export function createTerrainState(cfg: TerrainConfig, w: number, h: number): TerrainState {
  return {
    cfg,
    w,
    h,
    noise: createNoise(cfg.seed),
    layers: computeLayers(cfg, w, h),
    scrollDist: 0,
    morphZ: 0,
    tSec: 0,
  }
}

/** Advance the sim by dt (ms). Scroll + morph are dt-driven so speed is
 *  frame-rate independent. */
export function stepTerrain(state: TerrainState, dt: number) {
  const s = Math.max(0, dt) / 1000
  state.tSec += s
  state.scrollDist += s * state.cfg.scrollSpeed * SCROLL_UNIT
  state.morphZ += s * state.cfg.morphSpeed * MORPH_UNIT
}

export function resizeTerrainState(state: TerrainState, w: number, h: number) {
  state.w = w
  state.h = h
  state.layers = computeLayers(state.cfg, w, h) // viewport-dependent; scroll/morph kept
}

/** Live-apply a config edit without a full re-setup — keeps scroll/morph
 *  continuity. Rebuilds the noise field when the seed changes and the layer
 *  geometry always (cheap). Returns true (always applied live). */
export function updateTerrainState(state: TerrainState, cfg: TerrainConfig, w: number, h: number): boolean {
  if (cfg.seed !== state.cfg.seed) state.noise = createNoise(cfg.seed)
  state.cfg = cfg
  state.w = w
  state.h = h
  state.layers = computeLayers(cfg, w, h)
  return true
}
