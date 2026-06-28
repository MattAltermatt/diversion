import { useEffect, useRef, useState } from 'react'
import type { Diversion, RenderContext, Size } from './types'
import { createLoop, type Loop } from './useAnimationLoop'
import { shouldPause, type PauseSources } from './pauseModel'

export function AnimationHost({
  diversion,
  config,
  fullscreenable = false,
  showChrome = true,
}: {
  diversion: Diversion
  config: unknown
  fullscreenable?: boolean
  showChrome?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const loopRef = useRef<Loop | null>(null)
  const runRef = useRef<{ ctx: RenderContext; state: unknown; size: Size } | null>(null)
  const lastConfigRef = useRef<unknown>(null)
  const pauseRef = useRef<PauseSources>({
    manual: false,
    hidden: false,
    reduced: false,
    offscreen: false,
  })
  const [paused, setPaused] = useState(false)
  const [reducedActive, setReducedActive] = useState(false)
  const [fps, setFps] = useState(0)

  // Single source of truth for the loop's pause state: paused if ANY source is.
  const syncPaused = () => loopRef.current?.setPaused(shouldPause(pauseRef.current))

  // setup/teardown + the rAF loop. Re-runs only when the diversion changes; the
  // live run is held in runRef so config changes (below) can swap state under a
  // never-stopping loop.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = (
      diversion.kind === 'webgl'
        ? canvas.getContext('webgl2', {
            alpha: false,
            // every WebGL diversion so far is a full-viewport fragment shader (no
            // geometry edges to multisample) — MSAA would just cost backing-buffer
            // memory on a long-running screensaver for no visual gain.
            antialias: false,
            powerPreference: 'high-performance',
          })
        : canvas.getContext('2d')
    ) as RenderContext | null
    if (!ctx) return

    const sizeOf = (): Size => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(r.width * dpr))
      canvas.height = Math.max(1, Math.floor(r.height * dpr))
      // 2D: scale the backing store so the sim draws in CSS pixels at crisp HiDPI.
      // (Resizing the canvas resets the transform, so reapply on every sizeOf.)
      if (diversion.kind === '2d') {
        ;(ctx as CanvasRenderingContext2D).setTransform(dpr, 0, 0, dpr, 0, 0)
        return { width: Math.max(1, Math.floor(r.width)), height: Math.max(1, Math.floor(r.height)) }
      }
      // WebGL: work in device pixels (gl.viewport expects them).
      return { width: canvas.width, height: canvas.height }
    }

    const size = sizeOf()
    const state = diversion.setup(ctx, config, size)
    const run = { ctx, state, size }
    runRef.current = run
    lastConfigRef.current = config

    // #39: honor prefers-reduced-motion. We paint exactly ONE frame (so the
    // diversion shows its initial state, not a blank canvas) then freeze, with
    // a visible opt-in. The gate engages after the first frame paints.
    let framePainted = false
    const mql =
      typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null

    let acc = 0
    let frames = 0
    const loop = createLoop((t, dt) => {
      diversion.frame(run.state, ctx, t, dt)
      if (!framePainted) {
        framePainted = true
        if (mql?.matches) {
          pauseRef.current.reduced = true
          setReducedActive(true)
          syncPaused()
        }
      }
      // Only sample fps when the readout is actually shown — gallery tiles
      // (showChrome=false) shouldn't re-render twice a second for an unseen number.
      if (showChrome) {
        acc += dt
        frames++
        if (acc >= 500) {
          setFps(Math.round((frames * 1000) / acc))
          acc = 0
          frames = 0
        }
      }
    })
    loopRef.current = loop
    // reduced starts false so the FIRST frame runs even under reduced-motion;
    // the gate engages above once it has painted.
    pauseRef.current.hidden = document.hidden
    syncPaused()
    loop.start()

    const onResize = () => {
      run.size = sizeOf()
      diversion.resize?.(run.state, run.size, ctx)
    }
    // ResizeObserver catches container/layout reflow and fullscreen transitions
    // that never fire a window 'resize'. Observe the canvas — exactly the drawn box.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    ro?.observe(canvas)

    // #6: pause tiles scrolled out of view. On the play screen the host fills
    // the viewport (always intersecting), so this is a no-op there.
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entries) => {
            pauseRef.current.offscreen = !entries[entries.length - 1].isIntersecting
            syncPaused()
          })
        : null
    if (wrapRef.current) io?.observe(wrapRef.current)

    const onVisibility = () => {
      pauseRef.current.hidden = document.hidden
      syncPaused()
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Live OS reduced-motion toggle: engage/release the gate (and the chip).
    const onReducedChange = () => {
      pauseRef.current.reduced = mql?.matches ?? false
      setReducedActive(pauseRef.current.reduced)
      syncPaused()
    }
    mql?.addEventListener('change', onReducedChange)

    // WebGL context loss (#8): a GPU reset blanks the canvas permanently unless we
    // preventDefault() on loss and rebuild GL resources on restore. setup() owns all
    // GL allocation, so re-running it (with the latest config) is the recovery path.
    const onLost = (e: Event) => {
      e.preventDefault() // required, or 'webglcontextrestored' never fires
      loop.setPaused(true)
    }
    const onRestored = () => {
      run.size = sizeOf()
      run.state = diversion.setup(ctx, lastConfigRef.current, run.size)
      syncPaused()
    }
    if (diversion.kind === 'webgl') {
      canvas.addEventListener('webglcontextlost', onLost as EventListener)
      canvas.addEventListener('webglcontextrestored', onRestored)
    }

    return () => {
      ro?.disconnect()
      io?.disconnect()
      mql?.removeEventListener('change', onReducedChange)
      document.removeEventListener('visibilitychange', onVisibility)
      if (diversion.kind === 'webgl') {
        canvas.removeEventListener('webglcontextlost', onLost as EventListener)
        canvas.removeEventListener('webglcontextrestored', onRestored)
      }
      loop.stop()
      loopRef.current = null
      runRef.current = null
      diversion.teardown?.(run.state)
    }
  }, [diversion])

  // config changes: apply live via update(), else fall back to a full re-setup.
  // The loop keeps running; we only swap run.state.
  useEffect(() => {
    const run = runRef.current
    if (!run) return // setup effect runs first on mount with this same config
    if (config === lastConfigRef.current) return
    lastConfigRef.current = config
    const handled = diversion.update?.(run.state, config, run.size)
    if (!handled) {
      diversion.teardown?.(run.state)
      run.state = diversion.setup(run.ctx, config, run.size)
    }
  }, [diversion, config])

  // reflect manual pause into the running loop without re-running setup
  useEffect(() => {
    pauseRef.current.manual = paused
    syncPaused()
  }, [paused])

  // The chrome reflects the EFFECTIVE freeze (manual OR the reduced-motion gate),
  // not just the manual flag — otherwise a reduced-frozen canvas shows a ⏸ icon
  // and the opt-in chip stays hidden.
  const effectivePaused = paused || reducedActive

  const togglePause = () => {
    // Pressing play while the reduced-motion gate holds = explicitly opting into
    // motion. manual is always false under the gate, so the [paused] effect won't
    // re-fire — clear the gate and sync the loop directly.
    if (reducedActive) {
      pauseRef.current.reduced = false
      setReducedActive(false)
      syncPaused()
      return
    }
    setPaused((p) => !p)
  }

  const toggleFullscreen = () => {
    const el = wrapRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.()
  }

  return (
    <div ref={wrapRef} className="anim-host">
      <canvas ref={canvasRef} className="anim-canvas" />
      {showChrome && (
        <div className="anim-bar">
          <span className="fps">{fps} fps</span>
          {reducedActive && (
            <span className="anim-hint">Reduced motion — press ▶ for full motion</span>
          )}
          <button onClick={togglePause} aria-label={effectivePaused ? 'Play' : 'Pause'}>
            {effectivePaused ? '▶' : '⏸'}
          </button>
          {fullscreenable && (
            <button onClick={toggleFullscreen} aria-label="Fullscreen">
              ⛶
            </button>
          )}
        </div>
      )}
    </div>
  )
}
