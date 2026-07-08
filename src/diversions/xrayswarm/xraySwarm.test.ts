import { describe, it, expect } from 'vitest'
import { xraySwarmSchema } from './schema'
import {
  createXraySwarmState, stepXraySwarmOnce, stepXraySwarm, updateXraySwarmState,
  buildSwarmColors, FIXED_DT, MAX_TRAIL_LEN, type XraySwarmState,
} from './xraySwarm'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'

const base = xraySwarmSchema.parse({})

// Snapshot every leader + agent position/velocity so two runs can be compared exactly.
function snapshot(s: XraySwarmState): number[] {
  const out: number[] = []
  for (const swarm of s.swarms) {
    out.push(swarm.leader.x, swarm.leader.y, swarm.leader.vx, swarm.leader.vy)
    for (const a of swarm.agents) out.push(a.x, a.y, a.vx, a.vy)
  }
  return out
}

const allFinite = (s: XraySwarmState): boolean =>
  s.swarms.every((sw) =>
    [sw.leader.x, sw.leader.y, sw.leader.vx, sw.leader.vy].every(Number.isFinite)
    && sw.agents.every((a) => [a.x, a.y, a.vx, a.vy].every(Number.isFinite)))

describe('schema', () => {
  it('parses with valid defaults', () => {
    expect(base.swarmCount).toBe(6)
    expect(base.agentsPerSwarm).toBe(13)
    expect(base.trailLength).toBe(70)
    expect(base.background).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(base.palette.length).toBeGreaterThanOrEqual(2)
  })

  it('round-trips through the URL codec', () => {
    const cfg = {
      ...base, swarmCount: 6, agentsPerSwarm: 12, speed: 180, chaseForce: 300,
      leaderSpeed: 60, wobble: 0.6, trailLength: 70, lineWidth: 3, glowWidth: 16,
      glow: 0.2, background: '#101020',
    }
    const back = decodeConfig(xraySwarmSchema, encodeConfig(xraySwarmSchema, cfg))
    expect(back.swarmCount).toBe(6)
    expect(back.agentsPerSwarm).toBe(12)
    expect(back.trailLength).toBe(70)
    expect(back.background).toBe('#101020')
    expect(back.wobble).toBeCloseTo(0.6, 10)
  })
})

describe('createXraySwarmState', () => {
  it('builds swarmCount swarms, each with agentsPerSwarm agents', () => {
    const s = createXraySwarmState({ ...base, swarmCount: 5, agentsPerSwarm: 9 }, 800, 600)
    expect(s.swarms).toHaveLength(5)
    for (const sw of s.swarms) expect(sw.agents).toHaveLength(9)
  })

  it('seeds one trail history point per agent', () => {
    const s = createXraySwarmState(base, 800, 600)
    for (const sw of s.swarms) {
      for (const a of sw.agents) {
        expect(a.n).toBe(1)
        // Float32Array storage loses a little precision vs the double x/y.
        expect(a.hx[0]).toBeCloseTo(a.x, 2)
        expect(a.hy[0]).toBeCloseTo(a.y, 2)
      }
    }
  })

  it('assigns one colour per swarm', () => {
    const cfg = { ...base, swarmCount: 5 }
    const colors = buildSwarmColors(cfg)
    expect(colors).toHaveLength(5)
    for (const c of colors) {
      expect(Number.isFinite(c.r)).toBe(true)
      expect(Number.isFinite(c.g)).toBe(true)
      expect(Number.isFinite(c.b)).toBe(true)
    }
  })
})

describe('determinism', () => {
  it('same seed → identical initial swarm state', () => {
    const a = createXraySwarmState({ ...base, seed: 777 }, 800, 600)
    const b = createXraySwarmState({ ...base, seed: 777 }, 800, 600)
    expect(snapshot(a)).toEqual(snapshot(b))
  })

  it('same seed → identical swarm paths for the first N steps', () => {
    const a = createXraySwarmState({ ...base, seed: 777 }, 800, 600)
    const b = createXraySwarmState({ ...base, seed: 777 }, 800, 600)
    for (let i = 0; i < 200; i++) { stepXraySwarmOnce(a); stepXraySwarmOnce(b) }
    expect(snapshot(a)).toEqual(snapshot(b))
  })

  it('different seeds → different paths', () => {
    const a = createXraySwarmState({ ...base, seed: 1 }, 800, 600)
    const b = createXraySwarmState({ ...base, seed: 2 }, 800, 600)
    for (let i = 0; i < 50; i++) { stepXraySwarmOnce(a); stepXraySwarmOnce(b) }
    expect(snapshot(a)).not.toEqual(snapshot(b))
  })

  it('stepXraySwarm drains real time into the same fixed steps', () => {
    const a = createXraySwarmState({ ...base, seed: 9 }, 800, 600)
    const b = createXraySwarmState({ ...base, seed: 9 }, 800, 600)
    stepXraySwarm(a, FIXED_DT * 3) // three whole steps
    for (let i = 0; i < 3; i++) stepXraySwarmOnce(b)
    expect(snapshot(a)).toEqual(snapshot(b))
  })
})

describe('headline motion', () => {
  it('agents actually move (positions change over time)', () => {
    const s = createXraySwarmState({ ...base, swarmCount: 3, agentsPerSwarm: 4, seed: 3 }, 800, 600)
    const before = s.swarms.flatMap((sw) => sw.agents.map((a) => ({ x: a.x, y: a.y })))
    for (let i = 0; i < 60; i++) stepXraySwarmOnce(s)
    const after = s.swarms.flatMap((sw) => sw.agents.map((a) => ({ x: a.x, y: a.y })))
    let moved = 0
    after.forEach((p, i) => {
      if (Math.hypot(p.x - before[i].x, p.y - before[i].y) > 1) moved++
    })
    expect(moved).toBe(after.length)
  })

  it('stays bounded within the canvas (wall bounce works) and finite (no NaN)', () => {
    const s = createXraySwarmState({ ...base, swarmCount: 4, agentsPerSwarm: 6, speed: 240, seed: 7 }, 320, 200)
    for (let i = 0; i < 1000; i++) {
      stepXraySwarmOnce(s)
      expect(allFinite(s)).toBe(true)
      for (const sw of s.swarms) {
        expect(sw.leader.x).toBeGreaterThanOrEqual(0)
        expect(sw.leader.x).toBeLessThanOrEqual(320)
        expect(sw.leader.y).toBeGreaterThanOrEqual(0)
        expect(sw.leader.y).toBeLessThanOrEqual(200)
        for (const a of sw.agents) {
          expect(a.x).toBeGreaterThanOrEqual(0)
          expect(a.x).toBeLessThanOrEqual(320)
          expect(a.y).toBeGreaterThanOrEqual(0)
          expect(a.y).toBeLessThanOrEqual(200)
        }
      }
    }
  })

  it('velocity damping keeps agent speed within [minVel, maxVel] once settled', () => {
    const cfg = { ...base, speed: 150, seed: 13 }
    const s = createXraySwarmState(cfg, 800, 600)
    for (let i = 0; i < 200; i++) stepXraySwarmOnce(s) // let it settle out of the zero-velocity start
    const minV = cfg.speed * 0.35
    for (const sw of s.swarms) {
      for (const a of sw.agents) {
        const speed = Math.hypot(a.vx, a.vy)
        expect(speed).toBeGreaterThanOrEqual(minV - 1e-6)
        expect(speed).toBeLessThanOrEqual(cfg.speed + 1e-6)
      }
    }
  })

  it('leader velocity stays within leaderSpeed', () => {
    const cfg = { ...base, leaderSpeed: 80, seed: 21 }
    const s = createXraySwarmState(cfg, 800, 600)
    for (let i = 0; i < 300; i++) {
      stepXraySwarmOnce(s)
      for (const sw of s.swarms) {
        expect(Math.hypot(sw.leader.vx, sw.leader.vy)).toBeLessThanOrEqual(cfg.leaderSpeed + 1e-6)
      }
    }
  })

  it('trail history ring buffer fills and wraps without exceeding MAX_TRAIL_LEN capacity', () => {
    const s = createXraySwarmState({ ...base, swarmCount: 1, agentsPerSwarm: 1 }, 800, 600)
    for (let i = 0; i < MAX_TRAIL_LEN * 3; i++) stepXraySwarmOnce(s)
    const a = s.swarms[0].agents[0]
    expect(a.n).toBe(MAX_TRAIL_LEN * 3 + 1)
    expect(a.hx.length).toBe(MAX_TRAIL_LEN)
    expect(a.hy.length).toBe(MAX_TRAIL_LEN)
  })
})

describe('updateXraySwarmState', () => {
  it('applies a visual change live, keeping the same swarm array', () => {
    const s = createXraySwarmState(base, 800, 600)
    const ref = s.swarms
    const ok = updateXraySwarmState(s, { ...base, speed: base.speed + 40, glow: base.glow + 0.05 })
    expect(ok).toBe(true)
    expect(s.swarms).toBe(ref)
    expect(s.cfg.speed).toBe(base.speed + 40)
  })

  it('rebuilds colours live when the palette changes', () => {
    const s = createXraySwarmState(base, 800, 600)
    const before = s.colors.map((c) => ({ ...c }))
    const ok = updateXraySwarmState(s, { ...base, palette: ['#ff0000', '#00ff00', '#0000ff'] })
    expect(ok).toBe(true)
    expect(s.colors).not.toEqual(before)
  })

  it('requests a re-setup (false) for structural changes', () => {
    expect(updateXraySwarmState(createXraySwarmState(base, 800, 600), { ...base, swarmCount: base.swarmCount + 1 })).toBe(false)
    expect(updateXraySwarmState(createXraySwarmState(base, 800, 600), { ...base, agentsPerSwarm: base.agentsPerSwarm + 1 })).toBe(false)
    expect(updateXraySwarmState(createXraySwarmState(base, 800, 600), { ...base, seed: base.seed + 1 })).toBe(false)
  })
})
