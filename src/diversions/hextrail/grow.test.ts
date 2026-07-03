import { describe, it, expect } from 'vitest'
import { hextrailSchema, type HextrailConfig } from './schema'
import { createHexState, stepHex, type Segment } from './grow'
import { ArmPhase } from './hex'

function cfg(over: Partial<HextrailConfig> = {}): HextrailConfig {
  return { ...hextrailSchema.parse({}), growthSpeed: 40, hexSize: 24, fillFraction: 0.8,
    holdSeconds: 0.5, fadeSeconds: 0.5, maxDoing: 400, ...over }
}

/** Drive the sim, returning every completed segment in order. */
function run(config: HextrailConfig, frames: number, dt = 16): Segment[] {
  const s = createHexState(config, 320, 240)
  const out: Segment[] = []
  for (let i = 0; i < frames; i++) {
    stepHex(s, dt)
    for (const seg of s.newSegments) out.push({ ...seg })
  }
  return out
}

describe('hextrail growth', () => {
  it('is deterministic for a fixed seed', () => {
    const a = run(cfg({ seed: 42 }), 300)
    const b = run(cfg({ seed: 42 }), 300)
    expect(a.length).toBeGreaterThan(20)
    expect(a).toEqual(b)
  })

  it('diverges for a different seed', () => {
    const a = run(cfg({ seed: 1 }), 300)
    const b = run(cfg({ seed: 2 }), 300)
    expect(a).not.toEqual(b)
  })

  it('captured count matches the flagged cells (each hex captured at most once)', () => {
    const s = createHexState(cfg({ seed: 5 }), 320, 240)
    for (let i = 0; i < 400; i++) stepHex(s, 16)
    const flagged = s.cells.filter((c) => c.captured).length
    expect(s.capturedCount).toBe(flagged)
    expect(s.capturedCount).toBeLessThanOrEqual(s.cells.length)
  })

  it('fills to the target then holds — no premature strobe, no wedge', () => {
    const s = createHexState(cfg({ seed: 7, fillFraction: 0.8 }), 320, 240)
    let coverage = 0
    let reachedHold = false
    for (let i = 0; i < 4000; i++) {
      stepHex(s, 16)
      const cov = s.capturedCount / s.cells.length
      expect(cov).toBeGreaterThanOrEqual(coverage - 1e-9) // monotonic, never resets mid-grow
      coverage = cov
      if (s.phase === 'hold') { reachedHold = true; break }
    }
    expect(reachedHold).toBe(true)
    expect(coverage).toBeGreaterThanOrEqual(0.8) // held only after the fill target
  })

  it('loops: hold → fade → reseed → grows again (never a dead frame)', () => {
    const s = createHexState(cfg({ seed: 3 }), 320, 240)
    // advance to the first hold
    let guard = 0
    while (s.phase !== 'hold' && guard++ < 8000) stepHex(s, 16)
    expect(s.phase).toBe('hold')
    const cycleBefore = s.cycle
    // through hold + fade to a reseed
    guard = 0
    while (s.cycle === cycleBefore && guard++ < 4000) stepHex(s, 16)
    expect(s.cycle).toBe(cycleBefore + 1)
    expect(s.phase).toBe('grow')
    expect(s.capturedCount).toBeGreaterThan(0) // seeds re-planted
    // and it actually resumes growing
    let grew = false
    for (let i = 0; i < 400; i++) { stepHex(s, 16); if (s.newSegments.length) { grew = true; break } }
    expect(grew).toBe(true)
  })

  it('never claims a hex as a child twice (tree, no cycles)', () => {
    // A hex is targeted only while it is entirely EMPTY; the target arm becomes WAIT
    // (then IN). So at every instant a hex may hold at most ONE arm in {WAIT, IN} —
    // its single inbound (parent) claim. >1 would mean two edges fought over one hex.
    const s = createHexState(cfg({ seed: 9 }), 320, 240)
    let worst = 0
    for (let i = 0; i < 1500; i++) {
      stepHex(s, 16)
      for (const c of s.cells) {
        let claims = 0
        for (let j = 0; j < 6; j++) {
          if (c.arms[j].phase === ArmPhase.WAIT || c.arms[j].phase === ArmPhase.IN) claims++
        }
        if (claims > worst) worst = claims
      }
    }
    expect(worst).toBeLessThanOrEqual(1)
  })
})
