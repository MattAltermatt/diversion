import { describe, it, expect } from 'vitest'
import { terrainSchema } from './schema'
import {
  createNoise, computeLayers, sampleRidgeY, ridgeFbm, resolvePalette, mixRGB,
  PALETTES, CYCLE_RING, STEP,
} from './terrain'

const base = terrainSchema.parse({})

// Sample a full ridge profile across a width into an array (screen-space y).
function profile(seed: number, cfg = base, w = 960, h = 540, layerIdx = 3, xOff = 0, morphZ = 0): number[] {
  const noise = createNoise(seed)
  const layers = computeLayers(cfg, w, h)
  const layer = layers[Math.min(layerIdx, layers.length - 1)]
  const out: number[] = []
  for (let sx = 0; sx <= w; sx += STEP) {
    out.push(sampleRidgeY(noise, layer, sx, xOff, morphZ, cfg.detail, cfg.roughness))
  }
  return out
}

describe('schema', () => {
  it('parses with valid defaults', () => {
    expect(base.ridgeLayers).toBe(7)
    expect(base.timeOfDay).toBe('Auto')
    expect(base.roughness).toBeGreaterThanOrEqual(0.3)
    expect(base.roughness).toBeLessThanOrEqual(0.75)
    expect(base.peakHeight).toBeGreaterThan(0)
  })
  it('exposes a randomize-on-fresh-load pin-only seed', () => {
    const meta = (terrainSchema.shape.seed as { meta: () => { randomizeOnFreshLoad?: boolean } }).meta()
    expect(meta.randomizeOnFreshLoad).toBe(true)
  })
})

describe('determinism', () => {
  it('same seed → identical heightfield samples', () => {
    expect(profile(1234)).toEqual(profile(1234))
  })
  it('different seed → different heightfield', () => {
    expect(profile(1)).not.toEqual(profile(2))
  })
})

describe('heightfield is well-formed', () => {
  const ys = profile(4242)

  it('is finite and bounded within the canvas', () => {
    for (const y of ys) {
      expect(Number.isFinite(y)).toBe(true)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(540)
    }
  })

  it('is not flat — it has real relief', () => {
    const min = Math.min(...ys)
    const max = Math.max(...ys)
    expect(max - min).toBeGreaterThan(20) // tens of px of ridge relief
  })

  it('has multi-scale variation, not spiky white noise (adjacent samples correlated)', () => {
    // A smooth fractal profile: neighbouring columns move a small fraction of the
    // full range. White noise would make adjacent jumps ~ the whole range.
    const range = Math.max(...ys) - Math.min(...ys)
    let sumAbsStep = 0
    for (let i = 1; i < ys.length; i++) sumAbsStep += Math.abs(ys[i] - ys[i - 1])
    const meanStep = sumAbsStep / (ys.length - 1)
    expect(meanStep).toBeLessThan(range * 0.2) // strongly correlated neighbours
    expect(meanStep).toBeGreaterThan(0) // but not perfectly flat
  })

  it('ridgeFbm stays in [-1, 1]', () => {
    const noise = createNoise(9)
    for (let x = 0; x < 200; x++) {
      const v = ridgeFbm(noise, x * 0.13, 12.5, 0, base.detail, base.roughness)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('scrolling advances smoothly', () => {
  it('a small scroll step shifts the profile without jumps or NaN', () => {
    const w = 960, h = 540
    const noise = createNoise(555)
    const layer = computeLayers(base, w, h)[3]
    let maxStep = 0
    // FEATURE_PX ~ 340; one CSS px of scroll is a tiny fraction of a feature, so
    // each column's y changes by only a little between adjacent scroll offsets.
    for (let sx = 0; sx <= w; sx += STEP) {
      const y0 = sampleRidgeY(noise, layer, sx, 0, 0, base.detail, base.roughness)
      const y1 = sampleRidgeY(noise, layer, sx, 1, 0, base.detail, base.roughness)
      expect(Number.isFinite(y0) && Number.isFinite(y1)).toBe(true)
      maxStep = Math.max(maxStep, Math.abs(y1 - y0))
    }
    expect(maxStep).toBeLessThan(layer.amp * 0.15) // smooth advance, no discontinuity
  })
})

describe('layers are ordered by depth (far → near)', () => {
  it('near layers sit lower, are taller, and scroll faster', () => {
    const layers = computeLayers(base, 960, 540)
    for (let k = 1; k < layers.length; k++) {
      expect(layers[k].depth).toBeGreaterThan(layers[k - 1].depth)
      expect(layers[k].baseY).toBeGreaterThan(layers[k - 1].baseY)
      expect(layers[k].amp).toBeGreaterThan(layers[k - 1].amp)
      expect(layers[k].parallax).toBeGreaterThan(layers[k - 1].parallax)
    }
  })
})

describe('palette', () => {
  it('returns a fixed palette verbatim for a named time of day', () => {
    expect(resolvePalette('Dusk', 123, 6)).toEqual(PALETTES.Dusk)
    expect(resolvePalette('Alpenglow', 0, 6)).toEqual(PALETTES.Alpenglow)
  })
  it('Auto is deterministic in time and continuous around the ring', () => {
    expect(resolvePalette('Auto', 100, 6)).toEqual(resolvePalette('Auto', 100, 6))
    // At the loop boundary the interpolated palette rejoins the start of the ring.
    const period = 6 * 60
    const atZero = resolvePalette('Auto', 0, 6)
    const atLoop = resolvePalette('Auto', period, 6)
    expect(atLoop).toEqual(atZero)
    expect(atZero).toEqual(PALETTES[CYCLE_RING[0]])
  })
  it('mixRGB blends channels and rounds to bytes', () => {
    expect(mixRGB([0, 0, 0], [255, 255, 255], 0.5)).toEqual([128, 128, 128])
    expect(mixRGB([10, 20, 30], [10, 20, 30], 0.7)).toEqual([10, 20, 30])
  })
})
