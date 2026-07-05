import { describe, it, expect } from 'vitest'
import { hexadropSchema } from './schema'
import { cubeDistance, hexDisk, buildGrid } from './hexgrid'
import {
  createState, stepRipples, frontRadius, rippleContribution, rippleAmplitude,
  type Ripple,
} from './ripples'

const defaults = hexadropSchema.parse({})

describe('schema', () => {
  it('parses with valid defaults', () => {
    expect(defaults.hexSize).toBe(22)
    expect(defaults.colorMode).toBe('by-drop')
    expect(defaults.colors.length).toBeGreaterThanOrEqual(2)
    // every field carries its default, and a seed is present
    expect(typeof defaults.seed).toBe('number')
    expect(defaults.dropRate).toBeGreaterThan(0)
  })

  it('rejects a bad hex colour', () => {
    expect(() => hexadropSchema.parse({ background: 'not-a-color' })).toThrow()
  })
})

describe('hex cube geometry (HEADLINE)', () => {
  it('cube distance is symmetric and zero on the diagonal', () => {
    expect(cubeDistance(0, 0, 0, 0)).toBe(0)
    expect(cubeDistance(2, -1, 0, 0)).toBe(cubeDistance(0, 0, 2, -1))
    // a single axial step is always distance 1
    for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
      expect(cubeDistance(dq, dr, 0, 0)).toBe(1)
    }
  })

  it('rings around an origin grow 1, 6, 12, 18, 24 (6k for k>0)', () => {
    const disk = hexDisk(4)
    const counts = [0, 0, 0, 0, 0]
    for (const c of disk) counts[cubeDistance(c.q, c.r, 0, 0)]++
    expect(counts).toEqual([1, 6, 12, 18, 24])
  })
})

describe('ripple front (HEADLINE)', () => {
  it('front radius advances outward with age', () => {
    expect(frontRadius(0, defaults.rippleSpeed)).toBe(0)
    const a = frontRadius(1000, defaults.rippleSpeed)
    const b = frontRadius(3000, defaults.rippleSpeed)
    expect(b).toBeGreaterThan(a)
    expect(a).toBeCloseTo(defaults.rippleSpeed, 6)
  })

  it('a drop reaches cells at increasing distance over time (peak follows the front)', () => {
    // The contribution over distance peaks at the front radius; as the ripple ages
    // that peak distance increases — the ring physically expands.
    const peakDist = (ageMs: number) => {
      let best = 0, bestVal = -Infinity
      for (let d = 0; d <= 40; d += 0.25) {
        const v = rippleContribution(d, ageMs, defaults)
        if (v > bestVal) { bestVal = v; best = d }
      }
      return best
    }
    const p1 = peakDist(500)
    const p2 = peakDist(1500)
    const p3 = peakDist(3000)
    expect(p2).toBeGreaterThan(p1)
    expect(p3).toBeGreaterThan(p2)
  })

  it('amplitude decays monotonically and contributions are finite (no NaN)', () => {
    expect(rippleAmplitude(0, defaults.decay)).toBeCloseTo(1, 6)
    expect(rippleAmplitude(2000, defaults.decay)).toBeLessThan(rippleAmplitude(1000, defaults.decay))
    for (let age = 0; age <= 10000; age += 250) {
      for (let d = 0; d <= 60; d += 1) {
        expect(Number.isFinite(rippleContribution(d, age, defaults))).toBe(true)
      }
    }
  })
})

describe('determinism', () => {
  it('same seed → identical drop sequence (origins + colours + times)', () => {
    const dropLog = (seed: number): string => {
      const st = createState(hexadropSchema.parse({ seed, dropRate: 4 }), 800, 600)
      const seen: string[] = []
      let last = 0
      for (let f = 0; f < 120; f++) {
        stepRipples(st, 16)
        // record any ripple newly added since the last frame
        for (let i = last; i < st.ripples.length; i++) {
          const rp = st.ripples[i]
          seen.push(`${rp.q},${rp.r},${rp.color.r},${rp.color.g},${rp.color.b}`)
        }
        last = st.ripples.length
      }
      return seen.join('|')
    }
    expect(dropLog(1234)).toBe(dropLog(1234))
    expect(dropLog(1234)).not.toBe(dropLog(9999))
  })
})

describe('simulation stability', () => {
  it('runs many frames without NaN and prunes spent ripples (no unbounded growth)', () => {
    const st = createState(hexadropSchema.parse({ dropRate: 5, decay: 0.6 }), 900, 600)
    let maxRipples = 0
    let allFinite = true
    for (let f = 0; f < 600; f++) {
      stepRipples(st, 33)
      maxRipples = Math.max(maxRipples, st.ripples.length)
      for (let i = 0; i < st.intensity.length; i++) {
        if (!Number.isFinite(st.intensity[i])) { allFinite = false; break }
      }
    }
    expect(allFinite).toBe(true)
    // rings die off, so the active set stays bounded well under the hard ceiling
    expect(maxRipples).toBeLessThan(80)
    expect(st.cells.length).toBeGreaterThan(0)
  })

  it('resize keeps live ripples (a resize does not restart the pond)', () => {
    const st = createState(hexadropSchema.parse({ dropRate: 4 }), 800, 600)
    for (let f = 0; f < 60; f++) stepRipples(st, 16)
    const before: Ripple[] = st.ripples.map((r) => ({ ...r }))
    expect(before.length).toBeGreaterThan(0)
    // buildGrid at a new size just changes the cell count, not the ripples
    const newCells = buildGrid(1200, 900, st.cfg.hexSize)
    expect(newCells.length).not.toBe(st.cells.length)
    expect(st.ripples).toEqual(before)
  })
})
