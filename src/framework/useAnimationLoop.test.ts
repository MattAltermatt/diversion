import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createLoop } from './useAnimationLoop'

describe('createLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
      (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number,
    )
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) =>
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('calls onFrame with a positive dt, and stops cleanly', () => {
    const frames: Array<{ t: number; dt: number }> = []
    const loop = createLoop((t, dt) => frames.push({ t, dt }))
    loop.start()
    vi.advanceTimersByTime(50) // ~3 frames
    loop.stop()
    const after = frames.length
    vi.advanceTimersByTime(50) // no more frames after stop

    expect(after).toBeGreaterThanOrEqual(2)
    expect(frames.length).toBe(after)
    expect(frames[1].dt).toBeGreaterThan(0)
  })

  it('does not call onFrame while paused', () => {
    let count = 0
    const loop = createLoop(() => {
      count++
    })
    loop.start()
    loop.setPaused(true)
    const at = count
    vi.advanceTimersByTime(64)
    expect(count).toBe(at) // frozen
    loop.stop()
  })
})
