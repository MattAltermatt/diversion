import { describe, expect, it } from 'vitest'
import { DEFAULTS, WAY_FRACTION } from './config'
import { isDreadnought } from './ship'
import { applyConfig, createFleet, fitPool, liveFactions, resizeArena, step } from './sim'

const SIZE = { width: 800, height: 450 }
const run = (state: ReturnType<typeof createFleet>, seconds: number, dt = 0.1): void => {
  for (let i = 0; i < Math.round(seconds / dt); i++) step(state, dt)
}

describe('sim', () => {
  // ⭐ The keystone, end to end and under real combat rather than a
  // round-robin: the escalation rule must hold the population forever.
  it('holds its population over ten simulated minutes', () => {
    const s = createFleet({ ...DEFAULTS, seed: 5 }, SIZE)
    let worstLow = 99
    let worstHigh = 0
    for (let i = 0; i < 6000; i++) {
      step(s, 0.1)
      worstLow = Math.min(worstLow, s.ships.length)
      worstHigh = Math.max(worstHigh, s.ships.length)
    }
    expect([worstLow, worstHigh]).toEqual([DEFAULTS.sideSize * 2, DEFAULTS.sideSize * 2])
    // Measured 4.11/min in the probe; assert it is fighting, not stalemating.
    expect(s.fleet.deathCount).toBeGreaterThan(20)
    expect(s.fleet.deathCount).toBeLessThan(90)
  }, 60_000)

  // The rolling window. Measured across 60 probe runs: 2.86 mean, 2.70-3.27.
  it('settles into a rolling window of about three live factions', () => {
    const s = createFleet({ ...DEFAULTS, seed: 12 }, SIZE)
    let sum = 0
    let n = 0
    for (let i = 0; i < 4000; i++) {
      step(s, 0.1)
      if (i % 20 === 0) { sum += liveFactions(s.ships).length; n++ }
    }
    const mean = sum / n
    expect(mean).toBeGreaterThan(2.4)
    expect(mean).toBeLessThan(3.6)
  }, 60_000)

  it('is deterministic for a seed', () => {
    const a = createFleet({ ...DEFAULTS, seed: 11 }, SIZE)
    const b = createFleet({ ...DEFAULTS, seed: 11 }, SIZE)
    run(a, 60); run(b, 60)
    expect(a.ships.map((x) => [x.id, x.hp])).toEqual(b.ships.map((x) => [x.id, x.hp]))
  }, 30_000)

  // ⚠️ Compare POSITIONS, not id lists: the first sinking averages ~28 s, so
  // two seeds compared at a short horizon have identical ids and the test
  // fails for a reason unrelated to determinism.
  it('different seeds diverge', () => {
    const a = createFleet({ ...DEFAULTS, seed: 11 }, SIZE)
    const b = createFleet({ ...DEFAULTS, seed: 12 }, SIZE)
    run(a, 10); run(b, 10)
    expect(a.ships.map((x) => [x.hull.x, x.hull.y]))
      .not.toEqual(b.ships.map((x) => [x.hull.x, x.hull.y]))
  })

  it('applies a live knob WITHOUT resetting the run', () => {
    const s = createFleet(DEFAULTS, SIZE)
    run(s, 40)
    const before = s.ships.map((x) => [x.id, x.hull.x, x.hull.y])
    expect(applyConfig(s, { ...DEFAULTS, tempo: 0.3 }, SIZE)).toBe(true)
    expect(s.ships.map((x) => [x.id, x.hull.x, x.hull.y])).toEqual(before)
    // ...and the change must actually LAND — a no-op applyConfig that returns
    // true would satisfy the line above on its own.
    expect(s.cfg.tempo).toBe(0.3)
  }, 30_000)

  it('rescales the roster in place when top speed or HP moves', () => {
    const s = createFleet(DEFAULTS, SIZE)
    run(s, 20)
    const ids = s.ships.map((x) => x.id)
    expect(applyConfig(s, { ...DEFAULTS, topSpeedMs: 0.8, hullHp: 140 }, SIZE)).toBe(true)
    expect(s.ships.map((x) => x.id)).toEqual(ids)
    for (const sh of s.ships) {
      if (isDreadnought(sh)) continue
      expect(sh.spec.topSpeedMs).toBe(0.8)
      expect(sh.spec.hp).toBe(140)
    }
  }, 30_000)

  // ⚠️ `update()` returns true for these, so the framework will NOT fall back
  // to setup(). A regression here is a silently dead knob — the slider moves,
  // the URL updates, and nothing on screen changes. Only `tempo`, `topSpeedMs`
  // and `hullHp` were covered; these five were not, and dropping them from the
  // assignment left the whole suite green.
  it('every live field actually reaches the running sim', () => {
    const s = createFleet(DEFAULTS, SIZE)
    const next = {
      ...DEFAULTS,
      limpSpeed: 0.42,
      dreadnoughtChance: 0.31,
      palette: ['#112233', '#445566'],
      background: '#203040',
      showWakes: false,
      tempo: 0.27,
    }
    expect(applyConfig(s, next, SIZE)).toBe(true)
    for (const k of ['limpSpeed', 'dreadnoughtChance', 'background', 'showWakes', 'tempo'] as const) {
      expect(s.cfg[k], `${k} did not reach the sim`).toEqual(next[k])
    }
    expect(s.cfg.palette).toEqual(next.palette)
  })

  it('refuses a structural change so the framework re-runs setup', () => {
    const s = createFleet(DEFAULTS, SIZE)
    expect(applyConfig(s, { ...DEFAULTS, seed: 99 }, SIZE)).toBe(false)
    expect(applyConfig(s, { ...DEFAULTS, sideSize: 4 }, SIZE)).toBe(false)
    expect(applyConfig(s, { ...DEFAULTS, poolWidthM: 12 }, SIZE)).toBe(false)
  })

  // ⚠️ The wall-pin regression, at the whole-sim level. Measured: 2.8% with
  // avoidance, 74.9% without. The bound sits between them so it can fail.
  it('keeps the fleet off the walls', () => {
    const s = createFleet({ ...DEFAULTS, seed: 3 }, SIZE)
    let samples = 0
    let stalled = 0
    for (let i = 0; i < 3600; i++) {
      step(s, 0.1)
      if (i % 5) continue
      for (const sh of s.ships) { samples++; if (sh.stalledFor > 3) stalled++ }
    }
    // Measured 0.64% at defaults with avoidance, and the spec's §12.4 requires
    // this to die when avoidance is REMOVED — at 0.15 it did not, and only a
    // single-hull unit test in helm.test.ts noticed. 0.05 keeps ~8x headroom.
    expect(stalled / samples).toBeLessThan(0.05)
  }, 60_000)

  // ⭐ A hull driven SQUARE into a wall must shed off it, not sit there under
  // full power. The wall's reaction acts at the bow, so it is a torque.
  //
  // ⚠️ Mutation-sensitive to the SIGN, which was backwards once: torquing the
  // bow INTO the wall measured 9.8% of ship-samples stalled against 2.8% for
  // no torque at all, at every magnitude — a value-independent worsening.
  it('a hull nosed into a wall sheds off it', () => {
    const s = createFleet({ ...DEFAULTS, seed: 21 }, SIZE)
    const sh = s.ships[0]!
    // Park it hard against the bottom wall, pointing straight at it.
    sh.hull.x = DEFAULTS.poolWidthM / 2
    sh.hull.y = DEFAULTS.poolHeightM - sh.spec.lengthM * 0.4
    sh.hull.heading = Math.PI / 2
    sh.hull.vx = 0
    sh.hull.vy = 0
    const wallY = DEFAULTS.poolHeightM - sh.spec.lengthM * 0.4
    let freed = -1
    for (let i = 0; i < 40 * 120; i++) {
      step(s, 1 / 120)
      if (wallY - sh.hull.y > sh.spec.lengthM * 2) { freed = i / 120; break }
    }
    expect(freed, 'still pinned after 40 s').toBeGreaterThan(0)
    expect(freed, `took ${freed.toFixed(1)} s to clear`).toBeLessThan(25)
  }, 30_000)

  // ⭐ §12.4's regression test for §6, and it is run in the KIDDIE pool
  // deliberately.
  //
  // ⚠️ Measured after the wall work: slippery tiles and the bow-shed torque now
  // do most of the job, so in the backyard pool avoidance only moves the stall
  // rate 1.19% -> 0.69% — too close to separate with any honest bound, and a
  // backyard test passed happily with avoidance DELETED. In the kiddie pool,
  // where a hull meets a wall far more often, it is 3.22% -> 0.83%. Test the
  // mechanism where the mechanism matters.
  it('wall avoidance keeps the fleet off the tiles in a small pool', () => {
    let samples = 0
    let stalled = 0
    let worst = 0
    for (const seed of [1, 2, 3]) {
      const s = createFleet(
        { ...DEFAULTS, seed, poolWidthM: 5.3333, poolHeightM: 3 },
        SIZE,
      )
      for (let i = 0; i < 3000; i++) {
        step(s, 0.1)
        if (i % 5) continue
        for (const sh of s.ships) { samples++; if (sh.stalledFor > 3) stalled++; worst = Math.max(worst, sh.stalledFor) }
      }
    }
    const rate = stalled / samples
    expect(rate, `stalled ${(rate * 100).toFixed(2)}% — 0.83% with avoidance, 3.22% without`)
      .toBeLessThan(0.02)
    expect(worst, `worst pin ${worst.toFixed(0)} s`).toBeLessThan(40)
  }, 120_000)

  it('NO HULL EVER LEAVES THE POOL', () => {
    const s = createFleet({ ...DEFAULTS, seed: 8 }, SIZE)
    let worstOut = 0
    for (let i = 0; i < 3000; i++) {
      step(s, 0.1)
      for (const sh of s.ships) {
        worstOut = Math.max(
          worstOut,
          -sh.hull.x, sh.hull.x - DEFAULTS.poolWidthM,
          -sh.hull.y, sh.hull.y - DEFAULTS.poolHeightM,
        )
      }
    }
    expect(worstOut, `worst excursion ${worstOut.toFixed(3)} m`).toBeLessThan(0.05)
  }, 60_000)

  it('the stall counter is live, not write-only', () => {
    const s = createFleet({ ...DEFAULTS, seed: 3 }, SIZE)
    for (const sh of s.ships) { sh.hull.vx = 0; sh.hull.vy = 0 }
    step(s, 1 / 60)
    expect(s.ships.some((sh) => sh.stalledFor > 0)).toBe(true)
    expect(WAY_FRACTION).toBeGreaterThan(0)
  })

  it('writes wake trails for the renderer', () => {
    const s = createFleet(DEFAULTS, SIZE)
    run(s, 20)
    expect(s.ships.every((sh) => sh.trail.length > 5)).toBe(true)
  })

  it('letterboxes the pool without distorting it', () => {
    const wide = fitPool(DEFAULTS, { width: 1600, height: 450 })
    expect(wide.offsetX).toBeGreaterThan(0)
    expect(wide.offsetY).toBeCloseTo(0, 6)
    const tall = fitPool(DEFAULTS, { width: 800, height: 900 })
    expect(tall.offsetY).toBeGreaterThan(0)
    const s = createFleet(DEFAULTS, SIZE)
    resizeArena(s, { width: 400, height: 300 })
    expect(s.scale).toBeCloseTo(400 / DEFAULTS.poolWidthM, 6)
  })
})
