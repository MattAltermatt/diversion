import { describe, it, expect } from 'vitest'
import { createStallState, meanSpeed2, tickStall, MIN_AGE_MS, STILL_MS, FROZEN_SPEED2 } from './restart'

describe('restart', () => {
  it('meanSpeed2 averages vx^2+vy^2 over n', () => {
    const vx = new Float32Array([3, 0]), vy = new Float32Array([4, 0])
    expect(meanSpeed2(vx, vy, 2)).toBe((25 + 0) / 2) // (3^2+4^2)=25
  })

  it('never reseeds during the min-age window even if frozen', () => {
    const s = createStallState()
    let fired = false
    // frozen (speed2=0) throughout, but staying strictly inside the min-age window
    // (last tick lands at 19900ms < MIN_AGE_MS) → the guard keeps stillMs pinned at 0.
    for (let t = 0; t < MIN_AGE_MS - 100; t += 100) fired ||= tickStall(s, 100, 0)
    expect(s.ageMs).toBeLessThan(MIN_AGE_MS)
    expect(fired).toBe(false)
    expect(s.stillMs).toBe(0)
  })

  it('reseeds after sustained stillness past min-age', () => {
    const s = createStallState()
    while (s.ageMs < MIN_AGE_MS) tickStall(s, 100, FROZEN_SPEED2 + 100)
    let fired = false
    for (let acc = 0; acc < STILL_MS - 100; acc += 100) fired ||= tickStall(s, 100, 0)
    expect(fired).toBe(false)
    expect(tickStall(s, 200, 0)).toBe(true)
  })

  it('motion resets the stillness clock', () => {
    const s = createStallState()
    while (s.ageMs < MIN_AGE_MS) tickStall(s, 100, 999)
    tickStall(s, 1000, 0)
    expect(s.stillMs).toBe(1000)
    tickStall(s, 100, FROZEN_SPEED2 + 1)
    expect(s.stillMs).toBe(0)
  })
})
