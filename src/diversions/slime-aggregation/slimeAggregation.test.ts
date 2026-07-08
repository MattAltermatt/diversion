import { describe, it, expect } from 'vitest'
import { slimeAggregationSchema } from './schema'
import { createSlimeState, advance, shouldRestartSlime } from './slimeAggregation'

const cfg = slimeAggregationSchema.parse({ agentCount: 300, pacemakerCount: 3 })

function run(seed: number, w: number, h: number, frames: number, dtMs = 33) {
  const st = createSlimeState({ ...cfg, seed }, w, h)
  for (let i = 0; i < frames; i++) advance(st, dtMs)
  return st
}

describe('slime-aggregation determinism (seed → identical initial field + agents)', () => {
  it('same seed produces identical pacemaker placement and agent scatter at setup', () => {
    const a = createSlimeState({ ...cfg, seed: 42 }, 400, 300)
    const b = createSlimeState({ ...cfg, seed: 42 }, 400, 300)
    expect(a.field.pacemakers).toEqual(b.field.pacemakers)
    expect(Array.from(a.agents.x)).toEqual(Array.from(b.agents.x))
    expect(Array.from(a.agents.y)).toEqual(Array.from(b.agents.y))
    // Both start with an entirely resting field — waves haven't ignited yet.
    expect(Array.from(a.field.state)).toEqual(new Array(a.field.gw * a.field.gh).fill(0))
  })

  it('different seeds place pacemakers and scatter agents differently', () => {
    const a = createSlimeState({ ...cfg, seed: 1 }, 400, 300)
    const b = createSlimeState({ ...cfg, seed: 2 }, 400, 300)
    expect(a.field.pacemakers).not.toEqual(b.field.pacemakers)
    expect(Array.from(a.agents.x)).not.toEqual(Array.from(b.agents.x))
  })

  it('same seed → identical field + agent trajectory after N frames', () => {
    const a = run(7, 500, 400, 90)
    const b = run(7, 500, 400, 90)
    expect(Array.from(a.field.state)).toEqual(Array.from(b.field.state))
    expect(Array.from(a.field.timer)).toEqual(Array.from(b.field.timer))
    expect(Array.from(a.agents.x)).toEqual(Array.from(b.agents.x))
    expect(Array.from(a.agents.y)).toEqual(Array.from(b.agents.y))
  })

  it('different seeds diverge after N frames', () => {
    const a = run(3, 500, 400, 90)
    const b = run(4, 500, 400, 90)
    expect(Array.from(a.field.state)).not.toEqual(Array.from(b.field.state))
  })
})

describe('slime-aggregation lifecycle', () => {
  it('pacemakers ignite the field over time (it does not stay dead)', () => {
    const st = run(9, 500, 400, 240)
    let anyExcited = false
    for (const v of st.field.state) if (v !== 0) { anyExcited = true; break }
    expect(anyExcited).toBe(true)
  })

  it('shouldRestart trips once elapsed run time exceeds the safety-net ceiling', () => {
    const st = createSlimeState({ ...cfg, seed: 5 }, 400, 300)
    expect(shouldRestartSlime(st, 0, 16)).toBe(false)
    expect(shouldRestartSlime(st, 200_000, 16)).toBe(true) // far past MAX_RUN_MS
  })
})
