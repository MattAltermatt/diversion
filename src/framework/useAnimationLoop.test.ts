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

  it('stops re-queuing rAF while paused, and resumes on unpause (#200)', () => {
    const raf = globalThis.requestAnimationFrame as unknown as ReturnType<typeof vi.fn>
    let count = 0
    const loop = createLoop(() => {
      count++
    })
    loop.start()
    vi.advanceTimersByTime(48) // a few frames
    loop.setPaused(true)
    const rafCallsAfterPause = raf.mock.calls.length
    vi.advanceTimersByTime(160) // paused: no new rAF should be scheduled
    expect(raf.mock.calls.length).toBe(rafCallsAfterPause) // idle — page can sleep
    loop.setPaused(false)
    const at = count
    vi.advanceTimersByTime(48)
    expect(count).toBeGreaterThan(at) // ticking again
    loop.stop()
  })

  it('accumulates t from clamped dt so a long stall does not teleport t (#200)', () => {
    const frames: Array<{ t: number; dt: number }> = []
    const loop = createLoop((t, dt) => frames.push({ t, dt }))
    loop.start()
    vi.advanceTimersByTime(48) // ~3 frames
    // Simulate a 5s tab suspension: one giant gap between rAF callbacks.
    vi.advanceTimersByTime(5000)
    loop.stop()
    // dt is always clamped to ≤50ms and t === running sum of those clamped dts,
    // so t never absorbs the 5s away-duration.
    for (const f of frames) expect(f.dt).toBeLessThanOrEqual(50)
    const summed = frames.reduce((s, f) => s + f.dt, 0)
    expect(frames[frames.length - 1].t).toBeCloseTo(summed, 5)
  })
})
