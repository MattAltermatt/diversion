export interface Loop {
  start(): void
  stop(): void
  setPaused(p: boolean): void
}

/** A single rAF loop. onFrame receives elapsed time t (ms) and delta dt (ms). */
export function createLoop(onFrame: (t: number, dt: number) => void): Loop {
  let raf = 0
  let last = 0
  let t = 0 // accumulated from clamped dt, so t === sum(dt): pause/hitch-aware, no refocus teleport
  let paused = false
  let running = false

  const tick = (now: number) => {
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
    raf = requestAnimationFrame(tick)
  }

  return {
    start() {
      if (running) return
      running = true
      last = 0
      t = 0
      raf = requestAnimationFrame(tick)
    },
    stop() {
      running = false
      cancelAnimationFrame(raf)
    },
    setPaused(p: boolean) {
      if (p === paused) return
      paused = p
      if (paused) {
        cancelAnimationFrame(raf) // stop ticking so the page can idle while paused
      } else if (running) {
        last = 0 // fresh dt on resume (no away-duration carried in)
        raf = requestAnimationFrame(tick)
      }
    },
  }
}
