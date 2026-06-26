export interface Loop {
  start(): void
  stop(): void
  setPaused(p: boolean): void
}

/** A single rAF loop. onFrame receives elapsed time t (ms) and delta dt (ms). */
export function createLoop(onFrame: (t: number, dt: number) => void): Loop {
  let raf = 0
  let startTime = 0
  let last = 0
  let paused = false
  let running = false

  const tick = (now: number) => {
    if (!running) return
    if (!paused) {
      if (startTime === 0) {
        startTime = now
        last = now
      }
      const t = now - startTime
      const dt = now - last
      last = now
      onFrame(t, dt)
    } else {
      last = now // keep dt sane on resume
    }
    raf = requestAnimationFrame(tick)
  }

  return {
    start() {
      if (running) return
      running = true
      startTime = 0
      raf = requestAnimationFrame(tick)
    },
    stop() {
      running = false
      cancelAnimationFrame(raf)
    },
    setPaused(p: boolean) {
      paused = p
    },
  }
}
