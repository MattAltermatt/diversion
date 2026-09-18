import { describe, it, expect } from 'vitest'
import { unitNoise, makeFbm, warpedBands } from './noise'

describe('noise', () => {
  // ⚠️ ONE octave. A 4-octave fbm concentrates and legitimately never approaches
  // its bounds, so a span test over it measures concentration, not the bug it
  // exists to catch. Measured on this hash: lo 0.0062, hi 0.9926.
  it('spans 0..1 at ONE octave — an arithmetic-shift hash caps this at ~0.5', () => {
    const n = unitNoise(1)
    let lo = 1, hi = 0
    for (let i = 0; i < 20000; i++) {
      const v = n((i % 200) * 0.37, Math.floor(i / 200) * 0.41)
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
    expect(lo).toBeLessThan(0.05)
    expect(hi).toBeGreaterThan(0.95)
  })

  it('is deterministic for a seed', () => {
    expect(makeFbm(7)(1.5, 2.5)).toBe(makeFbm(7)(1.5, 2.5))
  })

  // ⚠️ THE DIRECTION IS x-FINER, and two drafts of the plan got it backwards.
  // The probe's comment says "x ~3.4x coarser… bands run across the frame"; its
  // code spans 17 units across the width against 15 down the height, so x is
  // sampled FINER and the bands elongate DOWNWARD. Assert fx/fy, never fy/fx.
  //
  // ⚠️ AND IT MUST AGGREGATE. A single scanline cannot see a 15% effect —
  // per-line, faithful and isotropic fields overlap completely, so a one-line
  // test is a coin flip. A draft measured on one line, concluded the effect was
  // unseparable, and deleted this test. Aggregated it separates cleanly:
  //     faithful (17/15)    fx/fy = 1.179   <- measured here
  //     isotropic           fx/fy ~ 1.00
  //     the comment's 3.4   fx/fy ~ 3.4
  it('is anisotropic in the direction the probe CODE specifies — x finer', () => {
    const SEEDS = [3, 11, 77, 404, 9001, 123]
    const OFFS = [0.7, 3.3, 7.1, 13.9, 21.5, 37.2]
    let fx = 0, fy = 0
    for (const seed of SEEDS) {
      const b = warpedBands(seed)
      for (const off of OFFS) {
        for (const along of ['x', 'y'] as const) {
          let n = 0, prev = Math.sign(along === 'x' ? b(0, off) : b(off, 0))
          for (let i = 1; i < 3000; i++) {
            const s = Math.sign(along === 'x' ? b(i * 0.01, off) : b(off, i * 0.01))
            if (s !== prev) { n++; prev = s }
          }
          if (along === 'x') fx += n
          else fy += n
        }
      }
    }
    expect(fx / fy).toBeGreaterThan(1.10)
    expect(fx / fy).toBeLessThan(1.60)
    expect(fy).toBeGreaterThan(200)
  }, 30000)
})
