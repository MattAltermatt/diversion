import { useEffect, useRef, useState } from 'react'
import type { Diversion, RenderContext, Size } from './types'
import { createLoop, type Loop } from './useAnimationLoop'
import { shouldPause, type PauseSources } from './pauseModel'
import { applyFreshLoadRandomization } from './urlCodec'

// A reseed rolls fresh randomizeOnFreshLoad values against an EMPTY query — the same
// path a bare page load takes — so every restart gets a brand-new world.
const EMPTY_PARAMS = new URLSearchParams()

export function AnimationHost({
  diversion,
  config,
  fullscreenable = false,
  showChrome = true,
  onLiveConfigChange,
}: {
  diversion: Diversion
  config: unknown
  fullscreenable?: boolean
  showChrome?: boolean
  /** Called with the initial config on mount, and with the new config after each
   *  auto-restart reseed — so chrome (e.g. copy-link-with-seed) can track the live world. */
  onLiveConfigChange?: (config: unknown) => void
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
    lost: false,
  })
  const [paused, setPaused] = useState(false)
  const [reducedActive, setReducedActive] = useState(false)
  const [fps, setFps] = useState(0)
  // setup() can throw (e.g. WebGL shader compile/link failure on a given GPU).
  // We catch at every setup() call site to avoid leaking half-initialized
  // resources, then re-throw during render via this setter so the surrounding
  // DiversionErrorBoundary shows an inline fallback for THIS tile — instead of
  // an unhandled effect throw white-screening the whole gallery (#124).
  const [, setSetupError] = useState<unknown>()
  // Keep the latest callback reachable from the once-per-diversion loop closure
  // without re-running setup when only the callback identity changes.
  const onLiveRef = useRef<typeof onLiveConfigChange>(undefined)
  onLiveRef.current = onLiveConfigChange

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
    let state: unknown
    try {
      state = diversion.setup(ctx, config, size)
    } catch (e) {
      setSetupError(() => {
        throw e
      })
      return
    }
    const run = { ctx, state, size }
    runRef.current = run
    lastConfigRef.current = config
    onLiveRef.current?.(config) // initial world → chrome can pin it before any restart

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
      // Auto-restart: the diversion decides it has gone stale → roll a fresh world.
      // Reseed through the same teardown→setup path a config change uses, then report
      // the new live config up (for copy-link-with-seed). Only runs while the loop
      // ticks, so a paused/reduced-frozen host never reseeds.
      // INVARIANT: a host using shouldRestart must keep its `config` prop STABLE (as
      // PlayScreen does via useMemo). The reseed advances lastConfigRef to the new
      // seeded config; a later change to the `config` prop would re-run setup() from
      // that prop and discard the reseeded world's seed.
      if (diversion.shouldRestart?.(run.state, t, dt)) {
        const next = applyFreshLoadRandomization(diversion.schema, lastConfigRef.current as never, EMPTY_PARAMS)
        diversion.teardown?.(run.state)
        try {
          run.state = diversion.setup(ctx, next, run.size)
        } catch (e) {
          setSetupError(() => {
            throw e
          })
          return
        }
        lastConfigRef.current = next
        onLiveRef.current?.(next)
      }
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
    // Fresh run owns a fresh context — clear any `lost` flag a prior diversion on
    // this host left set (a real loss will re-fire 'webglcontextlost').
    pauseRef.current.lost = false
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
      // Model loss as a pause SOURCE, not a direct setPaused(true): a later
      // syncPaused() (visibility/manual/reduced/offscreen change) would otherwise
      // recompute pause from the other sources and resume frame() on a still-lost
      // context. The `lost` flag holds the loop paused until 'restored' clears it.
      pauseRef.current.lost = true
      syncPaused()
    }
    const onRestored = () => {
      // teardown-before-setup, matching the invariant the rest of the host upholds:
      // free any CPU-side state the diversion stashed before rebuilding, so a
      // restore doesn't leak it. (The GL resources are already gone with the
      // context; this frees the diversion's own bookkeeping.)
      diversion.teardown?.(run.state)
      run.size = sizeOf()
      try {
        run.state = diversion.setup(ctx, lastConfigRef.current, run.size)
      } catch (e) {
        setSetupError(() => {
          throw e
        })
        return // stay paused (lost flag still set) — the rebuild failed
      }
      pauseRef.current.lost = false
      syncPaused()
      // If another source still freezes the loop (e.g. the reduced-motion gate),
      // it won't repaint the freshly-rebuilt context — paint one static frame so
      // a restore-while-paused doesn't leave a blank canvas (#120).
      if (shouldPause(pauseRef.current)) diversion.frame(run.state, ctx, performance.now(), 0)
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
      try {
        run.state = diversion.setup(run.ctx, config, run.size)
      } catch (e) {
        // setup() threw mid-run on a config edit: stop the loop so frame() can't
        // tick the just-torn-down state, then re-throw via render so the
        // DiversionErrorBoundary takes over this tile.
        loopRef.current?.stop()
        setSetupError(() => {
          throw e
        })
        return
      }
    }
    // When the loop is frozen (reduced-motion gate, manual pause, offscreen, …)
    // it never repaints, so a live config edit would look dead. Paint exactly one
    // static frame to reflect the change. When NOT paused the running loop owns
    // the repaint, so this is skipped (#120).
    if (shouldPause(pauseRef.current)) diversion.frame(run.state, run.ctx, performance.now(), 0)
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
      {/* key on kind: getContext() permanently locks a canvas to one context
          type, so a 2d↔webgl switch on a REUSED canvas returns null + blanks.
          Keying by kind makes React mount a fresh canvas when the kind changes. */}
      <canvas key={diversion.kind} ref={canvasRef} className="anim-canvas" />
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
