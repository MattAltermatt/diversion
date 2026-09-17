import { describe, expect, it } from 'vitest'
import { makeRng } from './noise'
import { buildRock, computeSterile, computeWet } from './rock'
import { SPECIES, habitability } from './species'
import { coverage, makeColony, prime, step } from './colony'

const DY = 40 / 60 / 60 // one frame at the default tempo

function world(w = 250, h = 160, seed = 1, bareRock = 12) {
  const rock = buildRock(w, h, seed)
  computeWet(rock, 0.55, 0.5)
  computeSterile(rock, bareRock, 35)
  const colony = makeColony(w * h)
  const rnd = makeRng(seed)
  prime(colony, rock, rnd)
  return { rock, colony, rnd }
}

describe('the keystone: a living cell is never overwritten in place', () => {
  it('only ever transitions bare→species and species→bare', () => {
    // This is the whole identity of the piece — it is what freezes a boundary where two
    // fronts meet. Note what it deliberately does NOT assert: "a cell once taken is never
    // reassigned" is FALSE, because die-back frees cells and a different species may then
    // claim them. A test written that way would either fail or have to disable die-back,
    // at which point it guards nothing.
    const { rock, colony, rnd } = world(150, 96)
    let prev = Int8Array.from(colony.occ)
    let overwrites = 0
    for (let f = 0; f < 900; f++) {
      step(colony, rock, { sporeRate: 1 }, DY, rnd)
      for (let i = 0; i < colony.occ.length; i++) {
        if (prev[i] !== -1 && colony.occ[i] !== -1 && colony.occ[i] !== prev[i]) overwrites++
      }
      prev = Int8Array.from(colony.occ)
    }
    expect(overwrites).toBe(0)
  })

  it('does let a cell change species the long way round, via bare', () => {
    // The counterpart, and the reason the keystone above is not vacuous: if nothing ever
    // died, "a living cell is never overwritten" would be trivially true. Constructed
    // rather than brute-forced — a stressed Lecanora sitting at wetness 0.15, where it is
    // on its shoulder (h = 0.50, stress 0.50, above the 0.46 die-back threshold) and
    // Ramalina is thriving. Die-back frees the cell; Ramalina claims it.
    const rock = buildRock(40, 40, 3)
    computeWet(rock, 0.55, 0)
    computeSterile(rock, 0, 0)
    rock.wet.fill(0.15)
    const colony = makeColony(40 * 40)
    const mid = 20 * 40 + 20
    const LECANORA = 3, RAMALINA = 4
    expect(habitability(LECANORA, 0.15)).toBeLessThan(0.54) // stressed
    expect(habitability(RAMALINA, 0.15)).toBeGreaterThan(0.9) // thriving
    colony.occ[mid] = LECANORA
    colony.age[mid] = 1
    for (const j of [mid - 1, mid + 1, mid - 40, mid + 40]) {
      colony.occ[j] = RAMALINA
      colony.age[j] = 1
    }
    const rnd = makeRng(9)
    let switched = false
    for (let f = 0; f < 4000 && !switched; f++) {
      step(colony, rock, { sporeRate: 0 }, DY, rnd)
      if (colony.occ[mid] === RAMALINA) switched = true
    }
    expect(switched).toBe(true)
  })
})

describe('growth', () => {
  it('never claims sterile ground', () => {
    const { rock, colony, rnd } = world(150, 96)
    for (let f = 0; f < 1000; f++) step(colony, rock, { sporeRate: 1 }, DY, rnd)
    for (let i = 0; i < colony.occ.length; i++) {
      if (rock.sterile[i]) expect(colony.occ[i]).toBe(-1)
    }
  })

  it('never puts a species where its habitability is zero', () => {
    const { rock, colony, rnd } = world(150, 96)
    for (let f = 0; f < 1000; f++) step(colony, rock, { sporeRate: 1 }, DY, rnd)
    for (let i = 0; i < colony.occ.length; i++) {
      const sp = colony.occ[i]
      if (sp !== -1) expect(habitability(sp, rock.wet[i])).toBeGreaterThan(0)
    }
  })

  it('will not spread from a cell younger than the age gate', () => {
    // Seed a BLOCK, not one cell. Growth picks a random cell and a random neighbour, so a
    // lone founder in 14,400 cells receives almost no growth attempts and the test passes
    // whether or not the gate exists — which is exactly how the "gate removed" mutant
    // survived the first version of this test.
    const rock = buildRock(120, 120, 2)
    computeWet(rock, 0.55, 0)
    computeSterile(rock, 0, 0)
    rock.wet.fill(0.15) // Ramalina thrives here, so growth is not limited by habitat
    const colony = makeColony(120 * 120)
    const RAMALINA = 4
    let seeded = 0
    for (let y = 40; y < 80; y++) {
      for (let x = 40; x < 80; x++) { colony.occ[y * 120 + x] = RAMALINA; colony.age[y * 120 + x] = 0; seeded++ }
    }
    const rnd = makeRng(4)
    // Step to just under the 0.12-year gate. Nothing may spread in that window.
    for (let f = 0; f < 9; f++) step(colony, rock, { sporeRate: 0 }, DY, rnd)
    let held = 0
    for (const v of colony.occ) if (v !== -1) held++
    expect(held).toBe(seeded)

    // ...and once the block is past the gate, it must actually grow, or this test would
    // pass for a sim in which growth is broken entirely.
    for (let i = 0; i < colony.age.length; i++) if (colony.occ[i] !== -1) colony.age[i] = 1
    for (let f = 0; f < 40; f++) step(colony, rock, { sporeRate: 0 }, DY, rnd)
    let after = 0
    for (const v of colony.occ) if (v !== -1) after++
    expect(after).toBeGreaterThan(seeded)
  })
})

describe('die-back', () => {
  it('hollows a stranded colony out over years rather than blinking it off', () => {
    // Measured on a fully-stressed field at the real frame cadence: 17.6% of live cells
    // die in one simulated year. NOTE a single dYears=1 call gives 7.9% instead — that is
    // an artifact of `k` clamping at 0.9, not a different rate, and the frame loop (dt
    // clamped at 50ms) can never produce it. Assert against the realistic cadence.
    const rock = buildRock(250, 160, 1)
    computeWet(rock, 0.55, 0.5)
    computeSterile(rock, 0, 0)
    const colony = makeColony(250 * 160)
    for (let i = 0; i < colony.occ.length; i++) {
      let worst = 0, ws = 2
      for (let s = 0; s < SPECIES.length; s++) {
        const hb = habitability(s, rock.wet[i])
        if (hb < ws) { ws = hb; worst = s }
      }
      colony.occ[i] = worst
      colony.age[i] = 1
    }
    let before = 0
    for (const v of colony.occ) if (v !== -1) before++
    const rnd = makeRng(1)
    for (let f = 0; f < Math.round(1 / DY); f++) step(colony, rock, { sporeRate: 0 }, DY, rnd)
    let after = 0
    for (const v of colony.occ) if (v !== -1) after++
    const died = (before - after) / before
    expect(died).toBeGreaterThan(0.05) // a no-op die-back fails here
    expect(died).toBeLessThan(0.30)    // a 10x rate fails here (measured ~0.85)
  })
})

describe('scale invariance', () => {
  it('seeds the founding generation per area', () => {
    const a = world(250, 160), b = world(500, 320)
    const frac = (c: typeof a) => {
      let k = 0
      for (const v of c.colony.occ) if (v !== -1) k++
      return k / c.colony.occ.length
    }
    expect(Math.abs(frac(a) - frac(b))).toBeLessThan(0.005)
  })

  it('lands founders per unit AREA, not per run', () => {
    // From an EMPTY rock with no priming, so founding is the only thing seeding cells.
    // Measured: per-area gives 1.06% at 110x70 and 1.72% at 220x140 (ratio 1.62); the
    // per-year mutant gives 9.06% and 2.25% (ratio 0.25) — the small grid gets four times
    // the founder density. Note a coverage-curve comparison on a primed rock does NOT see
    // this at all: priming dominates early coverage and growth saturates later, so that
    // version of the test killed no mutant and has been replaced by this one.
    const fromEmpty = (w: number, h: number) => {
      const rock = buildRock(w, h, 1)
      computeWet(rock, 0.55, 0.5)
      computeSterile(rock, 12, 35)
      const colony = makeColony(w * h)
      const rnd = makeRng(1)
      let yr = 0
      while (yr < 15) { step(colony, rock, { sporeRate: 1 }, DY, rnd); yr += DY }
      return coverage(colony, rock) * 100
    }
    const small = fromEmpty(110, 70), big = fromEmpty(220, 140)
    const ratio = big / small
    expect(ratio).toBeGreaterThan(0.6)
    expect(ratio).toBeLessThan(2.5)
  })
})

describe('determinism', () => {
  it('reproduces a run exactly from the same seed', () => {
    const run = () => {
      const { rock, colony, rnd } = world(150, 96)
      for (let f = 0; f < 400; f++) step(colony, rock, { sporeRate: 1 }, DY, rnd)
      return Array.from(colony.occ)
    }
    expect(run()).toEqual(run())
  })
})
