// Hopalong — clean-room reimplementation after xscreensaver's `hopalong` hack
// (Barry Martin's square-root hop, plus two named cousins). Source consulted:
// hacks/hopalong.c in https://github.com/Zygo/xscreensaver (credited there to
// Patrick J. Naughton / Barry Martin / Ed Kubaitis / Renaldo Recuerdo). See
// hopalong.ts for the ported math. GitHub issue #59.
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { parseHex6 } from '../../framework/color'
import { hopalongSchema, type HopalongConfig } from './schema'
import {
  MAPS, sampleCoeffs, driftedCoeffs, screenScale, type Coeffs,
} from './hopalong'
import { toneOf, lutIndex, buildPaletteLUT, type PaletteLUT } from './render'
import { mapPresets, palettePresets } from './presets'
import { meta } from './meta'

interface HopalongState {
  cfg: HopalongConfig
  base: Coeffs        // sampled from (map, seed) — drift wobbles around this
  halfExtent: number  // auto-fit world half-extent, measured once per base
  scale: number        // pixels-per-world-unit, fixed for the run (no breathing zoom)
  x: number            // persistent orbit position (world space)
  y: number
  driftTime: number    // morph clock; accumulates clamped dt so pause doesn't teleport
  w: number
  h: number
  counts: Uint32Array         // per-pixel hit count — the density source of truth
  maxCount: number            // running peak count, drives the log tone curve
  pixels: Uint8ClampedArray   // persistent CSS-px RGBA buffer, mutated in place
  imageData: ImageData        // wraps `pixels` — built once, reused every frame
  bg: { r: number; g: number; b: number }
  lut: PaletteLUT
  offCanvas: HTMLCanvasElement
  offCtx: CanvasRenderingContext2D
}

function fillBackground(pixels: Uint8ClampedArray, bg: { r: number; g: number; b: number }) {
  for (let p = 0; p < pixels.length; p += 4) {
    pixels[p] = bg.r; pixels[p + 1] = bg.g; pixels[p + 2] = bg.b; pixels[p + 3] = 255
  }
}

/** Re-derive every touched pixel's color from its stored count against the
 *  CURRENT background/palette/maxCount — a full O(w·h) pass, but only run
 *  once when background or palette actually changes (never per-frame), so a
 *  live color edit relights the already-accumulated structure instead of
 *  either ignoring it or hard-resetting the run. */
function remix(state: HopalongState) {
  fillBackground(state.pixels, state.bg)
  const { counts, pixels, lut, maxCount, bg } = state
  for (let idx = 0; idx < counts.length; idx++) {
    const count = counts[idx]
    if (count === 0) continue
    const t = toneOf(count, maxCount)
    const li = lutIndex(t)
    const p = idx * 4
    pixels[p] = bg.r + (lut.r[li] - bg.r) * t
    pixels[p + 1] = bg.g + (lut.g[li] - bg.g) * t
    pixels[p + 2] = bg.b + (lut.b[li] - bg.b) * t
    pixels[p + 3] = 255
  }
}

function makeState(cfg: HopalongConfig, wIn: number, hIn: number): HopalongState {
  const w = Math.max(1, Math.round(wIn)), h = Math.max(1, Math.round(hIn))
  const { coeffs, halfExtent } = sampleCoeffs(cfg.map, cfg.seed)
  const bg = parseHex6(cfg.background)
  const pixels = new Uint8ClampedArray(w * h * 4)
  fillBackground(pixels, bg)
  const offCanvas = document.createElement('canvas')
  offCanvas.width = w; offCanvas.height = h
  return {
    cfg,
    base: coeffs,
    halfExtent,
    scale: screenScale(halfExtent, w, h),
    x: 0.1,
    y: 0.1,
    driftTime: 0,
    w, h,
    counts: new Uint32Array(w * h),
    maxCount: 0,
    pixels,
    imageData: new ImageData(pixels, w, h),
    bg,
    lut: buildPaletteLUT(cfg.palette),
    offCanvas,
    offCtx: offCanvas.getContext('2d')!,
  }
}

// Two independent preset axes (mirrors Flow Field / Strange Attractors): the
// Attractor axis sets the map + a signature seed; the Palette axis patches
// background + the whole palette ramp.
const presets: PresetGroup<HopalongConfig>[] = [
  { label: 'Attractor', options: mapPresets.map((p) => ({ name: p.name, patch: p.patch })) },
  {
    label: 'Palette',
    options: palettePresets.map((p) => ({
      name: p.name,
      patch: { background: p.background, palette: p.palette },
    })),
  },
]

const hopalong = defineDiversion<typeof hopalongSchema, HopalongState, '2d'>({
  ...meta,
  schema: hopalongSchema,

  setup(ctx, config, size) {
    // Paint the ground once on the visible canvas so there's no first-frame flash.
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return makeState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    const { cfg, w, h } = state
    state.driftTime += dt
    const c = driftedCoeffs(cfg.map, state.base, state.driftTime, cfg.drift)
    const step = MAPS[cfg.map]
    const cx = w / 2, cy = h / 2
    const scale = state.scale
    const { counts, pixels, lut, bg } = state
    let { x, y, maxCount } = state

    for (let i = 0; i < cfg.pointsPerFrame; i++) {
      const n = step(x, y, c); x = n.x; y = n.y
      if (!Number.isFinite(x) || !Number.isFinite(y)) { x = 0.1; y = 0.1; continue }
      const px = Math.floor(cx + (x + y) * scale)
      const py = Math.floor(cy - (x - y) * scale)
      if (px < 0 || px >= w || py < 0 || py >= h) continue
      const idx = py * w + px
      const count = ++counts[idx]
      if (count > maxCount) maxCount = count
      const t = toneOf(count, maxCount)
      const li = lutIndex(t)
      const p = idx * 4
      pixels[p] = bg.r + (lut.r[li] - bg.r) * t
      pixels[p + 1] = bg.g + (lut.g[li] - bg.g) * t
      pixels[p + 2] = bg.b + (lut.b[li] - bg.b) * t
      pixels[p + 3] = 255
    }
    state.x = x; state.y = y; state.maxCount = maxCount

    // putImageData ignores the visible ctx's DPR transform, so blit through
    // an offscreen CSS-px canvas with drawImage, which honours it (same
    // pattern as sand-stroke).
    state.offCtx.putImageData(state.imageData, 0, 0)
    ctx.drawImage(state.offCanvas, 0, 0, w, h)
  },

  resize(state, size) {
    // Full reallocation on resize (matches sand-stroke's resizeSandState):
    // the density buffer is inherently resolution-dependent, so there's no
    // cheap way to preserve it across a dimension change.
    const fresh = makeState(state.cfg, size.width, size.height)
    Object.assign(state, fresh)
  },

  update(state, config) {
    // Structural: a different map or seed needs a fresh orbit + auto-fit.
    if (config.map !== state.cfg.map || config.seed !== state.cfg.seed) return false
    const paletteChanged = config.palette.length !== state.cfg.palette.length
      || config.palette.some((c, i) => c !== state.cfg.palette[i])
    const bgChanged = config.background !== state.cfg.background
    state.cfg = config
    if (bgChanged) state.bg = parseHex6(config.background)
    if (paletteChanged) state.lut = buildPaletteLUT(config.palette)
    if (paletteChanged || bgChanged) remix(state)
    return true
  },

  presets,
})

export default hopalong
