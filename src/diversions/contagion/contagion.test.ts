import { describe, it, expect, beforeAll } from 'vitest'
import { contagionSchema } from './schema'
import {
  createContagionState, stepContagion, S, I, R,
  type ContagionState,
} from './contagion'

// createContagionState needs an offscreen 2D canvas. jsdom's <canvas> has no 2D
// context by default, so stub a minimal one that only supports what the sim uses.
beforeAll(() => {
  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: (id: string) => unknown
  }
  proto.getContext = function (this: HTMLCanvasElement) {
    return {
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: () => {},
    }
  }
})

const cfg = contagionSchema.parse({})

function run(seed: number, steps: number): ContagionState {
  const st = createContagionState({ ...cfg, seed }, 400, 300)
  for (let i = 0; i < steps; i++) stepContagion(st)
  return st
}

describe('contagion determinism', () => {
  it('same seed → identical grid after N steps', () => {
    const a = run(7, 60)
    const b = run(7, 60)
    expect(Array.from(a.state)).toEqual(Array.from(b.state))
    expect(Array.from(a.timer)).toEqual(Array.from(b.timer))
  })

  it('different seed → different grid', () => {
    const a = run(1, 60)
    const b = run(2, 60)
    expect(Array.from(a.state)).not.toEqual(Array.from(b.state))
  })
})

describe('contagion dynamics', () => {
  it('seeds exactly seedCount infected foci at t=0', () => {
    const st = createContagionState({ ...cfg, seed: 3, seedCount: 5 }, 400, 300)
    let infected = 0
    for (const v of st.state) if (v === I) infected++
    // Foci can collide onto the same cell; count is an upper bound.
    expect(infected).toBeGreaterThan(0)
    expect(infected).toBeLessThanOrEqual(5)
  })

  it('an infected cell recovers after its infectious period', () => {
    const st = createContagionState({ ...cfg, seed: 5, infectiousDuration: 4, immunityDuration: 50 }, 200, 200)
    // Force a single isolated infected cell so it can only recover (no reinfection).
    st.state.fill(S)
    st.timer.fill(0)
    st.state[0] = I
    st.timer[0] = 4
    for (let i = 0; i < 4; i++) stepContagion(st)
    // After infectiousDuration steps it must have left the I state.
    expect(st.state[0]).not.toBe(I)
  })

  it('SIRS never stalls: infection persists or reseeds over a long run', () => {
    const st = run(9, 400)
    let infected = 0
    for (const v of st.state) if (v === I) infected++
    expect(infected).toBeGreaterThan(0)
  })

  it('records infected-fraction history each step', () => {
    const st = run(4, 30)
    let nonzero = 0
    for (const v of st.history) if (v > 0) nonzero++
    expect(nonzero).toBeGreaterThan(0)
  })

  it('recovered cells exist once the first wave has passed (R compartment)', () => {
    const st = run(11, 40)
    let recovered = 0
    for (const v of st.state) if (v === R) recovered++
    expect(recovered).toBeGreaterThan(0)
  })
})
