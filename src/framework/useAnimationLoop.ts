export interface Loop {
  start(): void
  stop(): void
  setPaused(p: boolean): void
  /** The loop's own clock — the same accumulated `t` frame() receives. Read it for
   *  a static one-shot repaint while paused, so that repaint sits on the piece's
   *  timeline instead of teleporting it to wall-clock time (#310). */
  time(): number
}

/** A single rAF loop. onFrame receives elapsed time t (ms) and delta dt (ms). */
export function createLoop(onFrame: (t: number, dt: number) => void): Loop {
  let raf = 0
  let queued = false // is `raf` a live handle? the ONE gate on scheduling — see schedule()
  let last = 0
  let t = 0 // accumulated from clamped dt, so t === sum(dt): pause/hitch-aware, no refocus teleport
  let paused = false
  let running = false

  const tick = (now: number) => {
    queued = false // this handle has fired; the chain re-arms below or goes idle
    if (!running || paused) return // paused loops don't re-queue — let the page idle
    if (last === 0) last = now
    // Clamp dt: a hidden tab suspends rAF, so the first frame back would
    // otherwise carry the entire away-duration and teleport time-driven
    // diversions. 50ms ≈ 3 frames — enough to stay smooth, small enough to
    // avoid a visible jump.
    const dt = Math.min(now - last, 50)
    last = now
    t += dt
    onFrame(t, dt)
    schedule()
  }

  // The ONE place a frame is ever queued. Everything that could arm the loop
  // (start, resume, the tick's own re-arm) goes through here, so the loop can
  // never hold more than one live handle — which is the whole of #298. The old
  // code queued from two places against a single `raf` variable: AnimationHost
  // pauses BEFORE it starts (`syncPaused()` then `loop.start()`), so a mount while
  // document.hidden had start() queue a frame the hidden tab never delivered, and
  // then setPaused(false) queued a SECOND one and overwrote the handle. Both then
  // re-queued themselves forever: frame() twice per rendered frame for the rest of
  // the session, doubling GPU cost and applying every trail deposit twice. Hiding
  // and re-showing did not heal it (a hidden resume just re-forks); only a pause
  // taken while visible did, because that path cancelled the one handle it knew about.
  const schedule = () => {
    if (queued || !running || paused) return
    queued = true
    raf = requestAnimationFrame(tick)
  }

  const cancel = () => {
    if (!queued) return
    cancelAnimationFrame(raf)
    queued = false
  }

  return {
    start() {
      if (running) return
      running = true
      last = 0
      t = 0
      schedule() // no-op while already paused — the page stays idle until resume
    },
    stop() {
      running = false
      cancel()
    },
    setPaused(p: boolean) {
      if (p === paused) return
      paused = p
      if (paused) {
        cancel() // stop ticking so the page can idle while paused
      } else {
        last = 0 // fresh dt on resume (no away-duration carried in)
        schedule() // guards `running` itself
      }
    },
    time: () => t,
  }
}
