import { describe, it, expect } from 'vitest'
import { chemicalGardenSchema, type ChemicalGardenConfig } from './schema'
import {
  advanceGarden,
  assignSalts,
  createGardenState,
  createSeeds,
  stepTip,
  updateGardenState,
  computeWorldBounds,
  type GardenState,
  type Tip,
} from './garden'

const cfg = (over: Partial<ChemicalGardenConfig> = {}): ChemicalGardenConfig =>
  chemicalGardenSchema.parse({ ...over })

function grow(c: ChemicalGardenConfig, maxFrames = 4000): GardenState {
  const s = createGardenState(c, 480, 360)
  for (let i = 0; i < maxFrames && s.phase === 'growing'; i++) advanceGarden(s, 16)
  return s
}

describe('chemical garden schema', () => {
  it('parses with valid defaults', () => {
    const c = cfg()
    expect(c.seeds).toBeGreaterThanOrEqual(2)
    expect(c.seeds).toBeLessThanOrEqual(6)
    expect(() => chemicalGardenSchema.parse(c)).not.toThrow()
  })
})

describe('seed crystals', () => {
  it('start on the floor (y=0), spread distinctly along it', () => {
    const seeds = createSeeds(cfg({ seeds: 5 }))
    expect(seeds.length).toBe(5)
    for (const s of seeds) {
      expect(s.y).toBe(0)
      expect(Number.isFinite(s.x)).toBe(true)
    }
    const xs = seeds.map((s) => s.x)
    expect(new Set(xs).size).toBe(xs.length) // no two crystals coincide
  })

  it('deterministic: same seed → identical positions + salts', () => {
    const a = createSeeds(cfg({ seed: 11, seeds: 4 }))
    const b = createSeeds(cfg({ seed: 11, seeds: 4 }))
    expect(a).toEqual(b)
  })
})

describe('per-salt palette assignment', () => {
  it('full spectrum cycles through all four salts', () => {
    const salts = assignSalts(cfg({ palette: 'full', seeds: 4 }))
    expect(new Set(salts)).toEqual(new Set(['copper', 'iron', 'chrome', 'manganese']))
  })

  it('copper palette assigns only copper', () => {
    const salts = assignSalts(cfg({ palette: 'copper', seeds: 6 }))
    expect(salts.every((s) => s === 'copper')).toBe(true)
  })

  it('ironManganese palette only ever assigns those two', () => {
    const salts = assignSalts(cfg({ palette: 'ironManganese', seeds: 5 }))
    expect(salts.every((s) => s === 'iron' || s === 'manganese')).toBe(true)
  })

  it('mono assigns a single salt to every seed crystal', () => {
    const salts = assignSalts(cfg({ palette: 'mono', seeds: 6 }))
    expect(new Set(salts).size).toBe(1)
  })

  it('subtree colour assignment is per-seed: grown segments carry a valid seedIdx', () => {
    const s = grow(cfg({ seed: 5, seeds: 3, growthSpeed: 300 }), 200)
    expect(s.bakedSegments.length).toBeGreaterThan(0)
    for (const seg of s.bakedSegments) {
      expect(seg.seedIdx).toBeGreaterThanOrEqual(0)
      expect(seg.seedIdx).toBeLessThan(s.seeds.length)
    }
  })
})

describe('stepTip: upward buoyancy bias', () => {
  it('a strong buoyancy pulls a sideways-heading tip toward straight up over several steps', () => {
    const bounds = computeWorldBounds(cfg())
    let tip: Tip = { x: 0, y: -50, heading: 0, depth: 0, dist: 0, seedIdx: 0 } // heading = 0 = rightward
    const rng = () => 0.5 // no jitter, no branch (0.5 keeps well above any branchRate)
    const c = cfg({ buoyancy: 1, wander: 0, branchRate: 0 })
    for (let i = 0; i < 40; i++) {
      const { segment, children } = stepTip(tip, c, bounds, rng)
      expect(Number.isFinite(segment.x1) && Number.isFinite(segment.y1)).toBe(true)
      if (children.length === 0) break
      tip = children[0]
    }
    // heading should have converged close to -PI/2 (straight up)
    expect(Math.abs(tip.heading - -Math.PI / 2)).toBeLessThan(0.05)
  })

  it('higher buoyancy climbs (loses more y) than zero buoyancy over the same steps, averaged over many tips', () => {
    const bounds = computeWorldBounds(cfg())
    const runClimb = (buoyancy: number, seed: number): number => {
      const c = cfg({ buoyancy, wander: 8, branchRate: 0 })
      const mulberrySeeded = (() => {
        // small local deterministic PRNG so the test is reproducible
        let a = seed >>> 0
        return () => {
          a |= 0; a = (a + 0x6d2b79f5) | 0
          let t = Math.imul(a ^ (a >>> 15), 1 | a)
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
      })()
      let tip: Tip = { x: 0, y: -20, heading: 0.4, depth: 0, dist: 0, seedIdx: 0 }
      const startY = tip.y
      for (let i = 0; i < 30; i++) {
        const { segment, children } = stepTip(tip, c, bounds, mulberrySeeded)
        void segment
        if (children.length === 0) break
        tip = children[0]
      }
      return startY - tip.y // positive = climbed upward
    }
    let climbedHigh = 0
    let climbedLow = 0
    for (let seed = 0; seed < 12; seed++) {
      climbedHigh += runClimb(1, seed)
      climbedLow += runClimb(0, seed)
    }
    expect(climbedHigh).toBeGreaterThan(climbedLow)
  })
})

describe('growth: branching increases total segment production', () => {
  it('a higher branch rate produces more total segments than none, given the same time budget', () => {
    const a = grow(cfg({ branchRate: 0, growthSpeed: 400, seed: 21, seeds: 3 }))
    const b = grow(cfg({ branchRate: 0.05, growthSpeed: 400, seed: 21, seeds: 3 }))
    expect(b.segmentCount).toBeGreaterThan(a.segmentCount)
  })
})

describe('determinism', () => {
  it('same seed → identical garden', () => {
    const a = grow(cfg({ seed: 42, growthSpeed: 300 }), 300)
    const b = grow(cfg({ seed: 42, growthSpeed: 300 }), 300)
    expect(a.segmentCount).toBe(b.segmentCount)
    expect(a.bakedSegments).toEqual(b.bakedSegments)
  })

  it('different seed → different garden', () => {
    const a = grow(cfg({ seed: 1, growthSpeed: 300 }), 300)
    const b = grow(cfg({ seed: 2, growthSpeed: 300 }), 300)
    expect(a.bakedSegments).not.toEqual(b.bakedSegments)
  })
})

describe('live-edit triggers (#270)', () => {
  it('re-bakes in place (returns true + needsFullRedraw) when tube width or taper changes', () => {
    // Baked per segment, but re-stamped from bakedSegments on needsFullRedraw — so a
    // live edit keeps the grown garden instead of restarting the bloom.
    const base = cfg()
    const sW = createGardenState(base, 480, 360)
    sW.needsFullRedraw = false
    expect(updateGardenState(sW, cfg({ lineWidth: base.lineWidth + 4 }))).toBe(true)
    expect(sW.needsFullRedraw).toBe(true)
    const sT = createGardenState(base, 480, 360)
    sT.needsFullRedraw = false
    expect(updateGardenState(sT, cfg({ taper: base.taper + 0.05 }))).toBe(true)
    expect(sT.needsFullRedraw).toBe(true)
  })

  it('forces a re-setup (returns false) only for structural seed/seeds changes', () => {
    const base = cfg()
    const s = createGardenState(base, 480, 360)
    expect(updateGardenState(s, cfg({ seed: base.seed + 1 }))).toBe(false)
  })

  it('still applies live (returns true) for a genuinely live field like glow', () => {
    const base = cfg()
    const s = createGardenState(base, 480, 360)
    expect(updateGardenState(s, cfg({ glow: base.glow + 0.1 }))).toBe(true)
    expect(s.cfg.glow).toBeCloseTo(base.glow + 0.1)
  })
})

describe('headline probe: a real branching, multi-tube garden', () => {
  it('grows a non-degenerate, NaN-free, multi-tip garden from its floor seeds', () => {
    const s = grow(cfg({ seed: 7 }), 500)
    expect(s.bakedSegments.length).toBeGreaterThan(50)
    expect(s.bakedSegments.some((seg) => seg.depth > 0)).toBe(true) // real branching occurred
    for (const seg of s.bakedSegments) {
      for (const v of [seg.x0, seg.y0, seg.x1, seg.y1, seg.dStart, seg.dEnd]) {
        expect(Number.isFinite(v)).toBe(true)
      }
    }
    // every segment stays on or above the floor (y <= 0), i.e. tubes climb, not sink
    expect(s.bakedSegments.every((seg) => seg.y0 <= 0.001 && seg.y1 <= 0.001)).toBe(true)
  })
})
