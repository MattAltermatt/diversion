import { describe, it, expect } from 'vitest'
import { chimeSchema, type ChimeConfig } from './schema'
import { createChimeState, stepChime, rippleAmplitude, type ChimeState } from './chime'
import { rhythmPresets } from './presets'

const W = 800
const H = 600

// Mechanic tests reason in plain seconds, so they pin tempo to 1 (the shipped
// default dilates time — that's a pace choice, not part of the mechanic).
function cfg(over: Partial<ChimeConfig> = {}): ChimeConfig {
  return { ...chimeSchema.parse({}), tempo: 1, ...over }
}

function run(state: ChimeState, seconds: number, step = 1 / 60): void {
  for (let i = 0; i < Math.round(seconds / step); i++) stepChime(state, step)
}

describe('chime — field generation', () => {
  it('is deterministic: same seed → identical field', () => {
    const a = createChimeState(cfg({ seed: 42 }), W, H)
    const b = createChimeState(cfg({ seed: 42 }), W, H)
    expect(Array.from(a.nx)).toEqual(Array.from(b.nx))
    expect(Array.from(a.cap)).toEqual(Array.from(b.cap))
    expect(Array.from(a.rate)).toEqual(Array.from(b.rate))
  })

  it('different seeds give a different field', () => {
    const a = createChimeState(cfg({ seed: 1 }), W, H)
    const b = createChimeState(cfg({ seed: 2 }), W, H)
    expect(Array.from(a.nx)).not.toEqual(Array.from(b.nx))
  })

  it('same seed → identical run after many steps', () => {
    const a = createChimeState(cfg({ seed: 5 }), W, H)
    const b = createChimeState(cfg({ seed: 5 }), W, H)
    run(a, 30)
    run(b, 30)
    expect(a.rn).toBe(b.rn)
    expect(Array.from(a.energy)).toEqual(Array.from(b.energy))
    expect(Array.from(a.rr.subarray(0, a.rn))).toEqual(Array.from(b.rr.subarray(0, b.rn)))
  })

  it('every layout keeps wells inside the unit square', () => {
    for (const layout of ['even', 'scatter', 'grid'] as const) {
      const s = createChimeState(cfg({ layout, nodeCount: 120 }), W, H)
      let worst = 0
      for (let i = 0; i < s.n; i++) {
        worst = Math.max(worst, Math.abs(s.nx[i] - 0.5), Math.abs(s.ny[i] - 0.5))
      }
      expect(worst, `${layout} placed a well outside [0,1]`).toBeLessThanOrEqual(0.5)
    }
  })

  it("'even' spaces wells better than 'scatter'", () => {
    const nearest = (s: ChimeState): number => {
      let worst = Infinity
      for (let i = 0; i < s.n; i++) {
        for (let j = i + 1; j < s.n; j++) {
          const d = Math.hypot(s.nx[i] - s.nx[j], s.ny[i] - s.ny[j])
          if (d < worst) worst = d
        }
      }
      return worst
    }
    const even = nearest(createChimeState(cfg({ layout: 'even', seed: 3 }), W, H))
    const scatter = nearest(createChimeState(cfg({ layout: 'scatter', seed: 3 }), W, H))
    expect(even).toBeGreaterThan(scatter)
  })
})

describe('chime — release mechanics', () => {
  it('a well fills then releases a ripple whose reach is the energy released', () => {
    // One well, no neighbours to trigger: it must ring on its own schedule.
    const c = cfg({ nodeCount: 1, seed: 9, chargeSpeed: 0.2, rateSpread: 0, reach: 1 })
    const s = createChimeState(c, W, H)
    s.energy[0] = 0
    const cap = s.cap[0]
    run(s, cap / s.rate[0] + 0.5)
    expect(s.rn).toBe(1)
    expect(s.rmax[0]).toBeCloseTo(cap * c.reach, 2)
    expect(s.energy[0]).toBeLessThan(cap) // spent, refilling
    expect(s.refr[0]).toBeGreaterThan(0) // and deaf
  })

  it('a ripple expands at wave speed and dies at its reach', () => {
    const c = cfg({ nodeCount: 1, seed: 9, chargeSpeed: 0.3, rateSpread: 0, waveSpeed: 0.5 })
    const s = createChimeState(c, W, H)
    s.energy[0] = s.cap[0]
    stepChime(s, 1 / 60)
    expect(s.rn).toBe(1)
    const reach = s.rmax[0]
    run(s, reach / c.waveSpeed - 0.1) // just shy of the far edge
    expect(s.rn).toBeGreaterThanOrEqual(1)
    expect(rippleAmplitude(s, 0)).toBeGreaterThan(0)
    run(s, 0.3) // past it
    // The original ripple is gone (a refractory well can't have made a new one).
    expect(s.rn).toBe(0)
  })

  it('a passing front tips a charged neighbour into releasing', () => {
    const c = cfg({ nodeCount: 2, chargeSpeed: 0.01, refractory: 10, sensitivity: 0, depthShield: 0, minCharge: 0 })
    const s = createChimeState(c, W, H)
    s.nx[0] = 0.5; s.ny[0] = 0.5
    s.nx[1] = 0.6; s.ny[1] = 0.5
    s.cap[0] = 1; s.cap[1] = 1
    s.energy[0] = 1 // primed to fire
    s.energy[1] = 0.5 // half full — will dump half
    run(s, 1.5) // both ripples still in flight
    expect(s.refr[1]).toBeGreaterThan(0) // neighbour was tipped
    expect(s.rn).toBe(2)
    // Its ripple reaches only as far as the energy it held at that moment.
    const reaches = [s.rmax[0], s.rmax[1]].sort((a, b) => a - b)
    expect(reaches[1] / reaches[0]).toBeGreaterThan(1.5)
  })

  it('a refractory well ignores a passing front', () => {
    const c = cfg({ nodeCount: 2, chargeSpeed: 0.01, refractory: 10, sensitivity: 0, depthShield: 0, minCharge: 0 })
    const s = createChimeState(c, W, H)
    s.nx[0] = 0.5; s.ny[0] = 0.5
    s.nx[1] = 0.6; s.ny[1] = 0.5
    s.cap[0] = 1; s.cap[1] = 1
    s.energy[0] = 1
    s.energy[1] = 0.5
    s.refr[1] = 60 // deaf for the whole run
    run(s, 3)
    expect(s.rn).toBe(1)
  })

  it('a well under the minimum charge is not tipped', () => {
    const c = cfg({ nodeCount: 2, chargeSpeed: 0.001, refractory: 10, sensitivity: 0, depthShield: 0, minCharge: 0.5 })
    const s = createChimeState(c, W, H)
    s.nx[0] = 0.5; s.ny[0] = 0.5
    s.nx[1] = 0.55; s.ny[1] = 0.5
    s.cap[0] = 1; s.cap[1] = 1
    s.energy[0] = 1
    s.energy[1] = 0.1
    run(s, 3)
    expect(s.rn).toBe(1)
  })

  it('a well never triggers itself with its own front', () => {
    const c = cfg({ nodeCount: 1, chargeSpeed: 0.001, sensitivity: 0, depthShield: 0, minCharge: 0, refractory: 0.1 })
    const s = createChimeState(c, W, H)
    s.cap[0] = 1
    s.energy[0] = 1
    run(s, 2)
    expect(s.rn).toBe(1)
  })

  it('sweeps its final shell before expiring, even when one step outruns its reach', () => {
    // Regression: killing a spent ripple BEFORE running the trigger sweep skips the
    // whole band it crosses on its last step. For a ripple whose entire reach is
    // shorter than one step — the smallest releases, or anything at a high wave
    // speed — that band is its only sweep, so it could never trigger at all.
    // Reachable in-schema, though not at these values: the largest in-schema step is
    // waveSpeed 1.2 x dt 0.0333 (60fps at tempo 2) = 0.04 diagonals, against a
    // MIN_RIPPLE_REACH of 0.015. The exaggerated numbers here just make it one step.
    const c = cfg({
      nodeCount: 2, waveSpeed: 6, reach: 0.02, chargeSpeed: 0.001,
      refractory: 10, sensitivity: 0, depthShield: 0, minCharge: 0,
    })
    const s = createChimeState(c, W, H)
    s.nx[0] = 0.5; s.ny[0] = 0.5
    s.nx[1] = 0.51; s.ny[1] = 0.5 // 10px away → d = 0.01 diagonals, inside the reach
    s.cap[0] = 1; s.cap[1] = 1
    s.energy[0] = 1
    s.energy[1] = 0.5
    stepChime(s, 1 / 60) // one step: born, overruns its reach, dies — but must sweep
    expect(s.refr[1], 'neighbour inside the reach was never swept').toBeGreaterThan(0)
  })

  it('never saturates the ripple pool in a shipped regime', () => {
    // `rn <= rcap` is true by construction (release() early-returns when full), so
    // asserting it proves nothing. What matters is the CONSEQUENCE of that guard: a
    // well that releases into a full pool still spends its energy and goes
    // refractory, so the event is silently swallowed with no wave. Assert the
    // regimes we actually ship never get there.
    const regimes: Array<[string, Partial<ChimeConfig>]> = [
      ['defaults', {}],
      ...rhythmPresets.map((p) => [p.name, p.patch] as [string, Partial<ChimeConfig>]),
    ]
    for (const [name, patch] of regimes) {
      const s = createChimeState(cfg(patch), W, H)
      run(s, 300)
      expect(s.dropped, `${name} swallowed ${s.dropped} releases at a full pool`).toBe(0)
      expect(s.rn).toBeLessThanOrEqual(s.rcap)
    }
  })

  it('counts swallowed releases when the pool really is saturated', () => {
    // The all-sliders-maxed corner. Not a shipped regime, but the counter has to
    // actually fire or the assertion above is guarding nothing.
    const s = createChimeState(cfg({
      nodeCount: 400, chargeSpeed: 0.4, rateSpread: 0, refractory: 0.1,
      sensitivity: 0, depthShield: 0, minCharge: 0, reach: 1.6, waveSpeed: 0.03, tempo: 2,
    }), W, H)
    // 2 sim-seconds, not 120: this config saturates the pool at step ~11 (0.18s) and
    // the loop is 400 wells x a 256-ring pool per step, so a long run buys no extra
    // coverage and costs ~3s here — several times that on CI, against vitest's 5s
    // default. Same trap as 5e7b168 (thornbird hoisting expects out of a hot loop).
    run(s, 2)
    expect(s.dropped).toBeGreaterThan(0)
    expect(s.rn).toBeLessThanOrEqual(s.rcap)
  })

  it('keeps running forever — the field never falls permanently silent', () => {
    const s = createChimeState(cfg({ seed: 17 }), W, H)
    run(s, 120)
    let released = 0
    for (let i = 0; i < 60 * 60; i++) {
      const before = s.rn
      stepChime(s, 1 / 60)
      if (s.rn > before) released += s.rn - before
    }
    expect(released).toBeGreaterThan(0)
  })

  it('is resolution-independent: the same run unfolds at any canvas size', () => {
    const a = createChimeState(cfg({ seed: 4 }), 800, 600)
    const b = createChimeState(cfg({ seed: 4 }), 1600, 1200)
    run(a, 20)
    run(b, 20)
    expect(a.rn).toBe(b.rn)
    expect(Array.from(a.energy)).toEqual(Array.from(b.energy))
  })

  it('tempo dilates time exactly: half tempo, twice the wall-clock, same state', () => {
    const fast = createChimeState(cfg({ seed: 21, tempo: 1 }), W, H)
    const slow = createChimeState(cfg({ seed: 21, tempo: 0.5 }), W, H)
    run(fast, 40)
    run(slow, 80)
    expect(slow.rn).toBe(fast.rn)
    // 3 dp, not more: the slow run takes twice as many float32 accumulation
    // steps to cover the same sim-time, so the two drift apart by rounding.
    for (let i = 0; i < fast.n; i++) {
      expect(slow.energy[i]).toBeCloseTo(fast.energy[i], 3)
    }
    // Compare the ripple SET by reach, not slot-by-slot radius: the pool is
    // swap-removed (same ripples can sit at different indices), and a just-born
    // front's radius is quantised to whole steps, which differ between the runs.
    // Reach is fixed at release, so it identifies the same set of events.
    const reaches = (s: ChimeState) => [...s.rmax.subarray(0, s.rn)].sort((x, y) => x - y)
    const fr = reaches(fast)
    const sr = reaches(slow)
    for (let k = 0; k < fr.length; k++) expect(sr[k]).toBeCloseTo(fr[k], 3)
  })

  it('tempo leaves the number of fronts on screen unchanged (pace, not density)', () => {
    const concurrency = (tempo: number): number => {
      const s = createChimeState(cfg({ seed: 31, tempo }), W, H)
      const steps = Math.round((400 / tempo) * 60)
      for (let i = 0; i < steps / 4; i++) stepChime(s, 1 / 60) // warm up
      let sum = 0
      for (let i = 0; i < steps; i++) { stepChime(s, 1 / 60); sum += s.rn }
      return sum / steps
    }
    const fast = concurrency(1)
    const slow = concurrency(0.4)
    expect(slow).toBeGreaterThan(fast * 0.7)
    expect(slow).toBeLessThan(fast * 1.4)
  })

  it('clamps a long stalled frame so a front cannot skip over a well', () => {
    const s = createChimeState(cfg({ seed: 8 }), W, H)
    const one = createChimeState(cfg({ seed: 8 }), W, H)
    stepChime(s, 5) // a 5-second "frame" (throttled tab)
    stepChime(one, 0.05)
    expect(Array.from(s.energy)).toEqual(Array.from(one.energy))
  })
})
