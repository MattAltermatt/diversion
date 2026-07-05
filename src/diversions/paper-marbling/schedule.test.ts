import { describe, it, expect } from 'vitest'
import { generateSchedule } from './schedule'
import { paperMarblingSchema, type PaperMarblingConfig } from './schema'

const cfg = (over: Partial<PaperMarblingConfig> = {}): PaperMarblingConfig =>
  ({ ...paperMarblingSchema.parse({}), ...over })

describe('generateSchedule', () => {
  it('is deterministic — same seed → identical recipe', () => {
    const a = generateSchedule(cfg({ seed: 7 }))
    const b = generateSchedule(cfg({ seed: 7 }))
    expect(a).toEqual(b)
  })

  it('different seeds → different drop placement', () => {
    const a = generateSchedule(cfg({ seed: 1 }))
    const b = generateSchedule(cfg({ seed: 2 }))
    const firstA = a.ops.find((o) => o.kind === 'drop')!
    const firstB = b.ops.find((o) => o.kind === 'drop')!
    expect(firstA).not.toEqual(firstB)
  })

  it('stone lays only drops, no combs', () => {
    const { ops } = generateSchedule(cfg({ pattern: 'stone', dropCount: 20 }))
    expect(ops.every((o) => o.kind === 'drop')).toBe(true)
    expect(ops.length).toBe(20)
  })

  it('nonpareil adds exactly two rakes after the drops', () => {
    const { ops } = generateSchedule(cfg({ pattern: 'nonpareil', dropCount: 12 }))
    expect(ops.filter((o) => o.kind === 'drop').length).toBe(12)
    expect(ops.filter((o) => o.kind === 'comb').length).toBe(2)
  })

  it('get-gel caps drops at a handful regardless of the slider', () => {
    const { ops } = generateSchedule(cfg({ pattern: 'getgel', dropCount: 80 }))
    expect(ops.filter((o) => o.kind === 'drop').length).toBeLessThanOrEqual(7)
  })

  it('ops are time-ordered and combs come after every drop', () => {
    const { ops } = generateSchedule(cfg({ pattern: 'feather', dropCount: 15 }))
    for (let i = 1; i < ops.length; i++) {
      expect(ops[i].startMs).toBeGreaterThanOrEqual(ops[i - 1].startMs)
    }
    const lastDrop = Math.max(...ops.filter((o) => o.kind === 'drop').map((o) => o.startMs))
    const firstComb = Math.min(...ops.filter((o) => o.kind === 'comb').map((o) => o.startMs))
    expect(firstComb).toBeGreaterThan(lastDrop)
  })

  it('whirlpool appends vortices (not combs) after the drops', () => {
    const { ops } = generateSchedule(cfg({ pattern: 'whirlpool', dropCount: 20 }))
    expect(ops.filter((o) => o.kind === 'drop').length).toBe(20)
    const vortices = ops.filter((o) => o.kind === 'vortex')
    expect(vortices.length).toBeGreaterThanOrEqual(3)
    expect(ops.some((o) => o.kind === 'comb')).toBe(false)
    const lastDrop = Math.max(...ops.filter((o) => o.kind === 'drop').map((o) => o.startMs))
    expect(Math.min(...vortices.map((o) => o.startMs))).toBeGreaterThan(lastDrop)
  })

  it('stylus appends single-tine strokes (spacing huge → one tooth in view)', () => {
    const { ops } = generateSchedule(cfg({ pattern: 'stylus', dropCount: 20 }))
    const strokes = ops.filter((o) => o.kind === 'comb')
    expect(strokes.length).toBeGreaterThanOrEqual(5)
    expect(ops.some((o) => o.kind === 'vortex')).toBe(false)
    for (const s of strokes) if (s.kind === 'comb') expect(s.spacing).toBeGreaterThan(1)
  })

  it('concentric drops all land near one centre and step colours in order', () => {
    const { ops } = generateSchedule(cfg({ pattern: 'concentric', dropCount: 40,
      colors: ['#111111', '#222222', '#333333'] }))
    const drops = ops.filter((o) => o.kind === 'drop')
    expect(drops.length).toBe(40)
    expect(ops.some((o) => o.kind !== 'drop')).toBe(false) // pure rings, no combing
    // colours cycle 0,1,2,0,1,2… (in-order rainbow rings)
    for (let i = 0; i < drops.length; i++) {
      if (drops[i].kind === 'drop') expect(drops[i].color).toBe(i % 3)
    }
    // all centres within a small jitter of each other
    const xs = drops.map((o) => (o.kind === 'drop' ? o.cx : 0))
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.15)
  })

  it('drift mix chance interleaves whirlpools / single-line rakes among the drops', () => {
    const { ops } = generateSchedule(cfg({ pattern: 'drift', dropCount: 80, mixChance: 0.4 }))
    expect(ops.filter((o) => o.kind === 'drop').length).toBe(80)
    const mixes = ops.filter((o) => o.kind !== 'drop')
    expect(mixes.length).toBeGreaterThanOrEqual(3) // high chance → plenty of events
    // any raked line is a SINGLE tine (spacing huge), never a full-width rank
    for (const m of mixes) if (m.kind === 'comb') expect(m.spacing).toBeGreaterThan(1)
    // interleaved, not all at the end
    const lastDropIdx = ops.map((o) => o.kind).lastIndexOf('drop')
    expect(ops.findIndex((o) => o.kind !== 'drop')).toBeLessThan(lastDropIdx)
  })

  it('drift mix chance 0 → just drops, no mixing', () => {
    const { ops } = generateSchedule(cfg({ pattern: 'drift', dropCount: 60, mixChance: 0 }))
    expect(ops.every((o) => o.kind === 'drop')).toBe(true)
  })

  it('never exceeds the shader operator cap for max settings', () => {
    for (const pattern of ['concentric', 'drift', 'feather', 'stone', 'whirlpool', 'stylus'] as const) {
      const { ops } = generateSchedule(cfg({ pattern, dropCount: 220, mixChance: 0.5 }))
      expect(ops.length).toBeLessThanOrEqual(256) // MAX_OPS in gl.ts
    }
  })
})
