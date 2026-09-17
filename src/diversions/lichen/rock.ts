// The cliff itself: relief and shading, the wetness field that sorts the species into
// bands, and the sterile ground nothing can colonise.

import { fbm2, makeNoise2D, type Noise2D } from './noise'

/** The REFERENCE grid every committed threshold was measured at, and what the per-area
 *  founding constants are calibrated to. It is NOT the shipped arena: `index.ts` fixes the
 *  cell at a size in CSS pixels and lets the count vary with the window, because deriving
 *  the cell from a fixed count made a large window blocky. Used by the tests. */
export const ARENA_COLS = 250
export const ARENA_ROWS = 160

export interface Rock {
  w: number
  h: number
  seed: number
  /** 0..1, low = hollow, high = ridge. */
  relief: Float32Array
  /** Lighting term for the bare stone. */
  shade: Float32Array
  /** 0..1 wetness; 1 at and below the water line. Recomputed in place. */
  wet: Float32Array
  /** 1 where nothing can ever grow. Recomputed in place. */
  sterile: Uint8Array
  /** Ranking fields for sterile ground; see computeSterile. */
  vein: Float32Array
  speck: Float32Array
  /** Scratch for computeSterile's blend. Hoisted onto the rock because `update` calls that
   *  function on EVERY pointermove of the two sliders that feed it — there is no debounce
   *  anywhere between a slider and `update` — and a fresh Float32Array per event is ~1 MB
   *  of garbage 60-120x a second at a full-window grid. */
  blend: Float32Array
  waterRow: number
  /** The relief field's own midpoint. `hold` is measured from this, not from a
   *  hardcoded 0.5 — the field does not centre there, and assuming it did made the
   *  term positive for 81.5% of cells, i.e. the "ridges shed water" half of the
   *  documented mechanic barely existed. */
  reliefMid: number
  noise: Noise2D
}

export function buildRock(w: number, h: number, seed: number): Rock {
  const n = w * h
  const noise = makeNoise2D(seed)
  const rock: Rock = {
    w, h, seed,
    relief: new Float32Array(n), shade: new Float32Array(n),
    wet: new Float32Array(n), sterile: new Uint8Array(n),
    vein: new Float32Array(n), speck: new Float32Array(n), blend: new Float32Array(n),
    waterRow: h * 0.88, reliefMid: 0.5, noise,
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const broad = fbm2(noise, x / 46, y / 46, 4)
      const grain = fbm2(noise, x / 6.5 + 900, y / 6.5, 3)
      // Ridged noise gives crack-like lineaments: |n - 0.5| is small along a ridge line.
      const ridged = Math.abs(fbm2(noise, x / 30 + 400, y / 62, 3) - 0.5) * 2
      const crack = 1 - Math.min(1, ridged / 0.16)
      rock.relief[i] = Math.min(1, Math.max(0, broad * 0.78 + grain * 0.22)) * (1 - 0.55 * crack)
        + 0.55 * crack * 0.12
      rock.shade[i] = broad * 0.62 + grain * 0.38 - crack * 0.30
      // Must RANK every cell continuously, never emit a mostly-zero mask: a hard cutoff
      // leaves too few non-zero cells to meet the requested fraction, the histogram
      // threshold collapses to 0, and the fraction is then met by a solid block of cells
      // in raster order rather than by scattered veins.
      rock.vein[i] = 1 - Math.abs(fbm2(noise, x / 26 + 1300, y / 54, 3) - 0.5) * 2
      rock.speck[i] = fbm2(noise, x / 11 + 2100, y / 11, 3)
    }
  }
  // Centre `hold` on the field's own median rather than on an assumed 0.5.
  const sorted = Float32Array.from(rock.relief).sort()
  rock.reliefMid = sorted[sorted.length >> 1]
  return rock
}

/** Wetness falls off above the water line; the rock's own hollows hold and ridges shed.
 *  IN PLACE: `exposure` and `relief` are live sliders, and reallocating per input event
 *  is the rebuild-on-drag trap. */
export function computeWet(rock: Rock, exposure: number, relief: number): void {
  const { w, h, waterRow } = rock
  const reach = h * (0.10 + exposure * 0.52)
  for (let y = 0; y < h; y++) {
    const above = waterRow - y
    const base = above <= 0 ? 1 : Math.exp(-above / reach)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const hold = (rock.reliefMid - rock.relief[i]) * relief * 0.40
      rock.wet[i] = Math.min(1, Math.max(0, base + hold))
    }
  }
}

/** Mark the requested FRACTION of cells unclaimable, blending veins to speckle by `style`.
 *  Thresholds against a histogram so the slider means the same thing on every rock. */
export function computeSterile(rock: Rock, amountPct: number, stylePct: number): void {
  const n = rock.w * rock.h
  const target = amountPct / 100
  if (target <= 0) { rock.sterile.fill(0); return }
  const st = stylePct / 100
  const BINS = 256
  const hist = new Int32Array(BINS)
  const f = rock.blend
  for (let i = 0; i < n; i++) {
    const v = rock.vein[i] * (1 - st) + rock.speck[i] * st
    f[i] = v
    hist[Math.min(BINS - 1, (v * BINS) | 0)]++
  }
  const want = Math.round(target * n)
  let acc = 0, cut = 0
  for (let b = BINS - 1; b >= 0; b--) { acc += hist[b]; if (acc >= want) { cut = b; break } }
  const thr = cut / BINS
  // Cap at `want`: the boundary bin overshoots, and without the cap a field whose mass
  // sits in one bin marks far more than asked.
  let marked = 0
  for (let i = 0; i < n; i++) {
    const hit = f[i] >= thr && marked < want
    rock.sterile[i] = hit ? 1 : 0
    if (hit) marked++
  }
}
