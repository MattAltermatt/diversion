import { describe, it, expect } from 'vitest'
import { RECOVER, type Field } from './field'
import { createAgents, stepAgent, aggregationFraction, WAVE_RESPONSE_THRESHOLD, type AgentSwarm } from './agents'
import { slimeAggregationSchema } from './schema'

/** A field with a monotonically-increasing intensity ramp along x (via RECOVER's
 *  linear timer/recoveryTime falloff), flat along y — a clean synthetic gradient
 *  to test chemotaxis against without depending on the CA's own dynamics. */
function rampField(gw: number, gh: number, recoveryTime: number): Field {
  const state = new Uint8Array(gw * gh).fill(RECOVER)
  const timer = new Uint16Array(gw * gh)
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      timer[y * gw + x] = Math.round((x / gw) * recoveryTime)
    }
  }
  return {
    gw, gh, state, stateB: new Uint8Array(gw * gh),
    timer, timerB: new Uint16Array(gw * gh),
    pacemakers: [], rng: () => 0.5,
  }
}

describe('createAgents', () => {
  it('is deterministic per seed and scatters into [0,1)', () => {
    const a = createAgents(5, 200)
    const b = createAgents(5, 200)
    expect(Array.from(a.x)).toEqual(Array.from(b.x))
    expect(Array.from(a.y)).toEqual(Array.from(b.y))
    for (let i = 0; i < a.x.length; i++) {
      expect(a.x[i]).toBeGreaterThanOrEqual(0); expect(a.x[i]).toBeLessThan(1)
      expect(a.y[i]).toBeGreaterThanOrEqual(0); expect(a.y[i]).toBeLessThan(1)
    }
  })

  it('differs across seeds', () => {
    const a = createAgents(1, 50)
    const b = createAgents(2, 50)
    expect(Array.from(a.x)).not.toEqual(Array.from(b.x))
  })
})

describe('chemotaxis: an agent in a gradient steps up-gradient', () => {
  const cfg = slimeAggregationSchema.parse({ chemotaxisStrength: 0.2, recoveryTime: 60 })
  const field = rampField(100, 10, cfg.recoveryTime)

  it('moves toward increasing intensity on the tick the signal just rose (prevHere=0)', () => {
    // At x=0.4 the ramp reads ~0.7*0.4=0.28, above WAVE_RESPONSE_THRESHOLD (0.22).
    // prevHere=0 simulates the ignition tick (REST → excited), the one instant
    // pulsatile chemotaxis actually responds — see agents.ts's module comment.
    const start = { x: 0.4, y: 0.5 }
    const r = stepAgent(field, cfg, start.x, start.y, 0, 1)
    expect(r.moved).toBe(true)
    expect(r.x).toBeGreaterThan(start.x) // stepped up the +x gradient
    expect(r.y).toBeCloseTo(start.y, 2) // no y-gradient to respond to
  })

  it('stays put where the field is below the response threshold', () => {
    // At x=0.05 the ramp reads ~0.7*0.05=0.035, well below threshold — a resting
    // amoeba between pulses shouldn't drift.
    const r = stepAgent(field, cfg, 0.05, 0.5, 0, 1)
    expect(r.moved).toBe(false)
    expect(r.x).toBe(0.05)
  })

  it('stays put once the signal has peaked and is falling (prevHere >= here)', () => {
    // Same position as the first case, but prevHere is already at/above the
    // current reading — the wave has passed its local peak, so pulsatile
    // chemotaxis desensitizes rather than chasing the (now-receding) gradient.
    const start = { x: 0.4, y: 0.5 }
    const here = 0.28
    const r = stepAgent(field, cfg, start.x, start.y, here, 1)
    expect(r.moved).toBe(false)
  })

  it('the threshold constant is a small, meaningful fraction (sanity)', () => {
    expect(WAVE_RESPONSE_THRESHOLD).toBeGreaterThan(0)
    expect(WAVE_RESPONSE_THRESHOLD).toBeLessThan(0.5)
  })
})

describe('aggregationFraction', () => {
  it('is 1 when every agent sits on a pacemaker, 0 when none are near', () => {
    const agents: AgentSwarm = { x: new Float32Array([0.5, 0.5]), y: new Float32Array([0.5, 0.5]), moving: new Uint8Array(2), prevIntensity: new Float32Array(2) }
    const pacemakers = [{ nx: 0.5, ny: 0.5, period: 10, countdown: 10 }]
    expect(aggregationFraction(agents, pacemakers, 0.05)).toBe(1)

    const far: AgentSwarm = { x: new Float32Array([0.01, 0.01]), y: new Float32Array([0.01, 0.01]), moving: new Uint8Array(2), prevIntensity: new Float32Array(2) }
    expect(aggregationFraction(far, pacemakers, 0.05)).toBe(0)
  })

  it('reports 0 with no pacemakers', () => {
    const agents: AgentSwarm = { x: new Float32Array([0.5]), y: new Float32Array([0.5]), moving: new Uint8Array(1), prevIntensity: new Float32Array(1) }
    expect(aggregationFraction(agents, [], 0.1)).toBe(0)
  })
})

