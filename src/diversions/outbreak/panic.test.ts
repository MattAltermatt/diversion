import { describe, it, expect } from 'vitest'
import { createSim, type SimConfig } from './sim'
import { panicStep } from './panic'

// Civilians-only ecosystems (no fighters/zombies) so indices 0..n-1 are all civilians
// and we can place them by hand and drive panicStep directly.
const cfg = (civ: number): SimConfig => ({
  civilianCount: civ, fighterCount: 0, zombieCount: 0,
  zombieSpeed: 52, humanSpeed: 88, civilianSight: 110, seed: 1, arenaDensity: 0,
  fighterRange: 128, fireCooldown: 1 / 3.2, magazine: 9, reloadTime: 2.1,
  bulletSpeed: 660, zombieFearRadius: 120, enrageRadius: 80, enrageTime: 4.5,
  panicStrength: 1.5, panicRadius: 70,
})

/** Place civilians at the given points, rebuild the hash, and run one panic step. */
function step(e: ReturnType<typeof createSim>, radius = 70): void {
  e.hash.rebuild(e.px, e.py, e.n, e.alive)
  panicStep(e, radius)
}

describe('panic — direct scream', () => {
  it('a recorded scream spikes the civilian\'s own fear', () => {
    const e = createSim(cfg(1))
    e.px[0] = 800; e.py[0] = 450
    e.screamSrc[0] = 0.8
    step(e)
    expect(e.fear[0]).toBeCloseTo(0.8, 5)
    expect(e.screamSrc[0]).toBe(0) // consumed
  })
})

describe('panic — contagion (ripple)', () => {
  it('fear jumps to a nearby civilian who never saw the zombie', () => {
    const e = createSim(cfg(2))
    e.px[0] = 800; e.py[0] = 450 // the screamer
    e.px[1] = 830; e.py[1] = 450 // 30px away, well inside radius 70
    // Step 1: A screams → A afraid, B still calm (B's neighbour A had no fear last step).
    e.screamSrc[0] = 1
    step(e)
    expect(e.fear[0]).toBeGreaterThan(0.9)
    expect(e.fear[1]).toBe(0)
    // Step 2: no fresh scream, but B catches A's fear from the snapshot.
    step(e)
    expect(e.fear[1]).toBeGreaterThan(0.2)
    expect(e.fear[1]).toBeLessThan(e.fear[0]) // caught less than the source (distance falloff)
  })

  it('does not spread past the panic radius', () => {
    const e = createSim(cfg(2))
    e.px[0] = 200; e.py[0] = 450
    e.px[1] = 400; e.py[1] = 450 // 200px apart — outside radius 70
    e.screamSrc[0] = 1
    step(e); step(e); step(e)
    expect(e.fear[1]).toBe(0)
  })
})

describe('panic — decay', () => {
  it('fear bleeds back to calm once the threat is gone', () => {
    const e = createSim(cfg(1))
    e.px[0] = 800; e.py[0] = 450
    e.screamSrc[0] = 1
    step(e)
    const peak = e.fear[0]
    expect(peak).toBeGreaterThan(0.9)
    // No further screams → monotonic decay to zero.
    let prev = peak
    for (let i = 0; i < 120; i++) {
      step(e)
      expect(e.fear[0]).toBeLessThanOrEqual(prev + 1e-6)
      prev = e.fear[0]
    }
    expect(e.fear[0]).toBe(0)
  })
})
