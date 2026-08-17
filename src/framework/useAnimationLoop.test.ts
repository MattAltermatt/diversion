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

  // #298: AnimationHost pauses BEFORE it starts (`syncPaused()` then `loop.start()`),
  // so a mount while document.hidden ran start() with paused already true. start()
  // queued a tick anyway and setPaused(false) queued a SECOND one, overwriting the
  // single handle — two self-re-queuing chains, i.e. frame() twice per rendered frame
  // for the rest of the session, healed only by a pause taken while VISIBLE.
  it('does not fork the rAF chain when started while paused (#298)', () => {
    let control = 0
    const a = createLoop(() => control++)
    a.start()
    vi.advanceTimersByTime(80)
    a.stop()

    let hiddenMount = 0
    const b = createLoop(() => hiddenMount++)
    b.setPaused(true) // document.hidden at mount
    b.start()
    b.setPaused(false) // tab revealed
    vi.advanceTimersByTime(80)
    b.stop()

    expect(control).toBeGreaterThan(0) // the control is not vacuous
    expect(hiddenMount).toBe(control) // one frame per rAF turn, not two
  })

  // Passes before #298's fix too (a pause cancels the handle a resume then replaces,
  // so the fork needs the start-while-paused order above). Kept because the `queued`
  // flag that fixes #298 is exactly what could break this: a flag left set by cancel()
  // would make every resume a no-op, and a flag never set would let handles pile up.
  it('holds one rAF chain across repeated pause/resume cycles', () => {
    const raf = globalThis.requestAnimationFrame as unknown as ReturnType<typeof vi.fn>
    let count = 0
    const loop = createLoop(() => count++)
    loop.start()
    for (let i = 0; i < 4; i++) {
      loop.setPaused(true)
      loop.setPaused(false)
    }
    const scheduled = raf.mock.calls.length
    vi.advanceTimersByTime(16) // exactly one frame's worth
    // One pending callback per resume would give 5 here; one chain gives 1.
    expect(count).toBe(1)
    expect(raf.mock.calls.length).toBe(scheduled + 1)
    loop.stop()
  })

  it('start() while paused schedules nothing, so the page can idle (#298)', () => {
    const raf = globalThis.requestAnimationFrame as unknown as ReturnType<typeof vi.fn>
    const loop = createLoop(() => {})
    loop.setPaused(true)
    const before = raf.mock.calls.length
    loop.start()
    expect(raf.mock.calls.length).toBe(before)
    loop.stop()
  })

  // #310: the three static-repaint sites handed diversions performance.now() — ms
  // since page load, which is HOURS in an unattended gallery — where the contract
  // says `t` is the loop's own accumulated dt. time() is what they read instead.
  it('exposes the accumulated t, frozen while paused (#310)', () => {
    const frames: number[] = []
    const loop = createLoop((t) => frames.push(t))
    expect(loop.time()).toBe(0) // before the first frame, not wall clock
    loop.start()
    vi.advanceTimersByTime(48)
    const t = loop.time()
    expect(t).toBeGreaterThan(0)
    expect(t).toBe(frames[frames.length - 1]) // exactly what frame() last saw
    loop.setPaused(true)
    vi.advanceTimersByTime(5000) // a long freeze must not advance it
    expect(loop.time()).toBe(t)
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
