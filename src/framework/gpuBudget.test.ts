import { describe, it, expect, beforeEach } from 'vitest'
import { acquireGpuSlot, releaseGpuSlot, subscribeGpuSlot, _resetGpuBudget } from './gpuBudget'

beforeEach(() => _resetGpuBudget())

describe('gpuBudget', () => {
  const CAP = 6 // MAX_LIVE_GPU

  it('hands out up to the cap, then refuses', () => {
    // The cap keeps the gallery from ever creating the browser's 17th WebGL context.
    const granted: boolean[] = []
    for (let i = 0; i < CAP + 4; i++) granted.push(acquireGpuSlot())
    const yes = granted.filter(Boolean).length
    expect(yes).toBe(CAP)
    expect(granted.slice(CAP).every((g) => g === false)).toBe(true)
  })

  it('a released slot can be re-claimed', () => {
    for (let i = 0; i < CAP; i++) acquireGpuSlot()
    expect(acquireGpuSlot()).toBe(false) // full
    releaseGpuSlot()
    expect(acquireGpuSlot()).toBe(true) // the freed slot is available again
  })

  it('releasing wakes a waiting tile', () => {
    for (let i = 0; i < CAP; i++) acquireGpuSlot()
    let woken = false
    const unsub = subscribeGpuSlot(() => {
      woken = true
      acquireGpuSlot()
      unsub()
    })
    expect(woken).toBe(false)
    releaseGpuSlot() // frees one → wakes the waiter, which claims it
    expect(woken).toBe(true)
    expect(acquireGpuSlot()).toBe(false) // waiter took the freed slot; back at cap
  })

  it('never drops below zero on over-release', () => {
    releaseGpuSlot()
    releaseGpuSlot()
    for (let i = 0; i < CAP; i++) expect(acquireGpuSlot()).toBe(true)
    expect(acquireGpuSlot()).toBe(false)
  })
})
