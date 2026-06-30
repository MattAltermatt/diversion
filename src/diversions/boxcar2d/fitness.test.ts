import { describe, it, expect } from 'vitest'
import { carFitness } from './fitness'

const base = { goalDistance: 300, timeCap: 20 }

describe('carFitness', () => {
  it('distance mode = distance reached', () => {
    expect(carFitness({ ...base, mode: 'distance', finished: false, distance: 142, timeSec: 9 })).toBe(142)
  })
  it('time-mode non-finisher = distance reached (always < goalDistance)', () => {
    const f = carFitness({ ...base, mode: 'time', finished: false, distance: 250, timeSec: 20 })
    expect(f).toBe(250)
    expect(f).toBeLessThan(base.goalDistance)
  })
  it('time-mode finisher always outranks any non-finisher', () => {
    const slowFinish = carFitness({ ...base, mode: 'time', finished: true, distance: 300, timeSec: 20 })
    expect(slowFinish).toBe(300) // goalDistance + (20-20)
    expect(slowFinish).toBeGreaterThanOrEqual(base.goalDistance)
  })
  it('faster finish ⇒ higher fitness', () => {
    const fast = carFitness({ ...base, mode: 'time', finished: true, distance: 300, timeSec: 7 })
    const slow = carFitness({ ...base, mode: 'time', finished: true, distance: 300, timeSec: 12 })
    expect(fast).toBeGreaterThan(slow)
    expect(fast).toBe(313)
  })
  it('never returns negative', () => {
    expect(carFitness({ ...base, mode: 'distance', finished: false, distance: -5, timeSec: 0 })).toBe(0)
  })
})
