import { describe, it, expect } from 'vitest'
import { vinesSchema, type VinesConfig } from './schema'
import { expand, turtle, buildGeometry, SPECIES } from './lsystem'

const DEG = Math.PI / 180
const defaults = (): VinesConfig => vinesSchema.parse({})

describe('vines schema', () => {
  it('parses with valid defaults', () => {
    const cfg = defaults()
    expect(cfg.species).toBe('bush')
    expect(cfg.iterations).toBe(4)
    expect(cfg.seedPoints).toBe(3)
    expect(cfg.colors.length).toBeGreaterThan(0)
    // every default must survive its own schema (bounds + regex)
    expect(() => vinesSchema.parse(cfg)).not.toThrow()
  })
})

describe('L-system expansion', () => {
  it('is deterministic and grows the string', () => {
    const { axiom, rules } = SPECIES.bush
    const a = expand(axiom, rules, 3)
    const b = expand(axiom, rules, 3)
    expect(a).toBe(b) // pure, no randomness
    expect(a.length).toBeGreaterThan(expand(axiom, rules, 1).length)
  })

  it('only contains turtle alphabet symbols', () => {
    const s = expand(SPECIES.fern.axiom, SPECIES.fern.rules, 3)
    expect(/^[FX+\-[\]]*$/.test(s)).toBe(true)
  })
})

describe('turtle determinism', () => {
  it('same seed → identical geometry; different seed → different', () => {
    const cfg = defaults()
    const g1 = buildGeometry(cfg)
    const g2 = buildGeometry(cfg)
    expect(g2.segments).toEqual(g1.segments) // byte-for-byte reproducible

    const g3 = buildGeometry({ ...cfg, seed: cfg.seed + 1 })
    const differ = g3.segments.length !== g1.segments.length ||
      g3.segments.some((s, i) => !g1.segments[i] || s.x1 !== g1.segments[i].x1)
    expect(differ).toBe(true)
  })
})

describe('headline probe: it actually branches', () => {
  it('bush produces a deep, multi-tip, non-degenerate, NaN-free tree', () => {
    const geo = buildGeometry(defaults())

    // a real tree, not a single strand
    expect(geo.segments.length).toBeGreaterThan(50)
    // branching → depth greater than 1 (nested [ ] were interpreted)
    expect(geo.maxDepth).toBeGreaterThan(1)
    // multiple branch tips
    const tips = geo.segments.filter((s) => s.tip)
    expect(tips.length).toBeGreaterThan(3)
    // non-degenerate bounding box in BOTH axes
    expect(geo.maxX - geo.minX).toBeGreaterThan(0)
    expect(geo.maxY - geo.minY).toBeGreaterThan(0)
    // a positive reveal distance
    expect(geo.maxDist).toBeGreaterThan(0)
    // no NaN / Infinity anywhere
    for (const s of geo.segments) {
      for (const v of [s.x0, s.y0, s.x1, s.y1, s.dStart, s.dEnd]) {
        expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  it('every species grows a branching tree', () => {
    for (const species of ['bush', 'fern', 'tree', 'willow'] as const) {
      const geo = buildGeometry({ ...defaults(), species })
      expect(geo.segments.length, species).toBeGreaterThan(10)
      expect(geo.maxDepth, species).toBeGreaterThan(0)
      expect(geo.segments.filter((s) => s.tip).length, species).toBeGreaterThan(1)
    }
  })
})

describe('turtle low-level', () => {
  it('emits one segment per F and marks branch tips', () => {
    // "F[+F]F" → 3 F's; the bracketed branch tip should be flagged
    const segs = turtle('F[+F]F', {
      branchAngle: 25 * DEG,
      angleJitter: 0,
      lengthDecay: 1,
      startX: 0,
      startY: 0,
      startHeading: -Math.PI / 2,
      rng: () => 0.5,
    })
    expect(segs.length).toBe(3)
    expect(segs.some((s) => s.tip)).toBe(true)
  })
})
