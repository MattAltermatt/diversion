import { describe, it, expect } from 'vitest'
import { advance, applyConfig, createState, type DLAState } from './dla'
import { dlaSchema, type DLAConfig } from './schema'

const cfg = (over: Partial<DLAConfig> = {}): DLAConfig => dlaSchema.parse({ ...over })

function grow(c: DLAConfig, ms: number): DLAState {
  const s = createState(c, 480, 360)
  // several frames so the per-frame step cap never truncates a determinism run
  for (let i = 0; i < ms / 16; i++) advance(s, 16)
  return s
}

describe('DLA seeding', () => {
  it('point seeds one frozen cell', () => {
    const s = createState(cfg({ seedType: 'point' }), 480, 360)
    expect(s.count).toBe(1)
  })
  it('ring and line seed many frozen cells', () => {
    expect(createState(cfg({ seedType: 'ring' }), 480, 360).count).toBeGreaterThan(20)
    expect(createState(cfg({ seedType: 'line' }), 480, 360).count).toBeGreaterThan(20)
  })
})

describe('DLA determinism', () => {
  it('same seed → identical growth', () => {
    const a = grow(cfg({ seed: 42, speed: 400 }), 800)
    const b = grow(cfg({ seed: 42, speed: 400 }), 800)
    expect(a.count).toBe(b.count)
    expect(Array.from(a.ages)).toEqual(Array.from(b.ages))
  })
  it('different seed → different growth', () => {
    const a = grow(cfg({ seed: 1, speed: 400 }), 800)
    const b = grow(cfg({ seed: 2, speed: 400 }), 800)
    expect(Array.from(a.ages)).not.toEqual(Array.from(b.ages))
  })
})

describe('DLA aggregation', () => {
  it('grows a connected cluster — every frozen cell touches another', () => {
    const s = grow(cfg({ seed: 7, speed: 500, seedType: 'point' }), 1200)
    expect(s.count).toBeGreaterThan(50)
    const { ages, gw, gh } = s
    let checked = 0
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        if (ages[gy * gw + gx] < 0) continue
        checked++
        let neighbour = false
        for (let dy = -1; dy <= 1 && !neighbour; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = gx + dx, ny = gy + dy
            if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && ages[ny * gw + nx] >= 0) { neighbour = true; break }
          }
        }
        expect(neighbour).toBe(true)
      }
    }
    expect(checked).toBe(s.count)
  })

  it('marks the frame filled and stops growing once the cluster spans it', () => {
    const s = createState(cfg({ seed: 3, speed: 1200 }), 240, 180)
    for (let i = 0; i < 4000 && !s.filled; i++) advance(s, 16)
    expect(s.filled).toBe(true)
    const frozen = s.count
    advance(s, 16)
    expect(s.count).toBe(frozen) // filled → no further growth
  })
})

describe('DLA applyConfig', () => {
  it('applies appearance edits live and flags a redraw', () => {
    const s = createState(cfg({ colorByAge: true }), 480, 360)
    s.needsFullRedraw = false
    expect(applyConfig(s, cfg({ colorByAge: false }))).toBe(true)
    expect(s.needsFullRedraw).toBe(true)
  })
  it('rejects structural edits (seed / seedType) for a full re-setup', () => {
    const s = createState(cfg({ seed: 1 }), 480, 360)
    expect(applyConfig(s, cfg({ seed: 2 }))).toBe(false)
    expect(applyConfig(s, cfg({ seedType: 'ring' }))).toBe(false)
  })
})
