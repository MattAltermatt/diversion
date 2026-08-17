import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Diversion, RenderContext, Size, PointerSample } from './types'
import { createLoop, type Loop } from './useAnimationLoop'
import { shouldPause, type PauseSources } from './pauseModel'
import { applyFreshLoadRandomization } from './urlCodec'
import { INTERACTIVE_ATTR } from './canvasGestures'

// A reseed rolls fresh randomizeOnFreshLoad values against an EMPTY query — the same
// path a bare page load takes — so every restart gets a brand-new world.
const EMPTY_PARAMS = new URLSearchParams()

// Free a diversion's live state exactly once, then null it. Every re-setup path
// (auto-reseed, WebGL restore, the [config] effect) tears down then re-runs setup(); if
// setup() THROWS, the nulled state stops the effect-cleanup teardown from freeing the same
// GL/GPU resources a SECOND time (double free, #266). Shared by both effects (which own
// distinct `run` closures) so the guard can't drift. teardown() only ever sees live state.
function freeRun(diversion: Diversion, run: { state: unknown }): void {
  if (run.state == null) return
  diversion.teardown?.(run.state)
  run.state = null
}

export function AnimationHost({
  diversion,
  config,
  fullscreenable = false,
  showChrome = true,
  interactive = true,
  onLiveConfigChange,
  onPauseSourcesChange,
  barExtra,
}: {
  diversion: Diversion
  config: unknown
  fullscreenable?: boolean
  showChrome?: boolean
  /** Whether this mount is a surface the viewer drives. False for gallery tiles,
   *  which are thumbnails inside a link: they neither want pointer input nor may
   *  opt out of browser gestures, because a tile that swallows touch scrolling is
   *  a dead zone in the middle of a very long page. */
  interactive?: boolean
  /** Called with the initial config on mount, and with the new config after each
   *  auto-restart reseed — so chrome (e.g. copy-link-with-seed) can track the live world. */
  onLiveConfigChange?: (config: unknown) => void
  /** Reports the live pause sources whenever any of them changes. A read-only
   *  window onto state the host already owns: the host keeps deciding when to
   *  freeze, and a route that needs to know whether the piece is ACTUALLY moving
   *  (PlayScreen's wake lock, #284) reads it here instead of re-deriving four
   *  observers and a media query. Deliberately not a wake-lock hook — the host
   *  mounts on all 137 gallery tiles, so anything battery-facing must live in the
   *  route, not here. */
  onPauseSourcesChange?: (sources: PauseSources) => void
  /** Extra controls for the anim bar, rendered after Pause/Fullscreen. A slot
   *  rather than a feature: it lets a route add a control that has to sit beside
   *  Pause/Fullscreen (and inherit the 44px narrow-viewport touch target on
   *  `.anim-bar button`) while owning all of its own behaviour. */
  barExtra?: ReactNode
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const loopRef = useRef<Loop | null>(null)
  const runRef = useRef<{ ctx: RenderContext; state: unknown; size: Size } | null>(null)
  // A pending "hand the WebGL context back" scheduled by the setup effect's cleanup,
  // tagged with the canvas it belongs to. Deferred (not called inline in cleanup) so
  // that a re-run which REUSES the SAME canvas — React StrictMode's dev double-mount,
  // or a same-kind diversion swap — cancels it before it fires. loseContext() permanently
  // loses the canvas's context, and getContext() on that canvas then returns the lost
  // one, so an inline release would poison the very context the immediate re-setup
  // reuses (symptom: every WebGL diversion "shader compile failed: null" in dev). The
  // canvas tag matters: a KIND change remounts the canvas (key={diversion.kind}), so the
  // re-run's canvas differs and the OLD context must still be freed — cancelling then
  // would leak it. A real unmount has no re-run, so the timer fires. See the cleanup below.
  const releaseTimerRef = useRef<{ timer: ReturnType<typeof setTimeout>; canvas: HTMLCanvasElement } | null>(null)
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
  const onPauseRef = useRef<typeof onPauseSourcesChange>(undefined)
  onPauseRef.current = onPauseSourcesChange

  // Single source of truth for the loop's pause state: paused if ANY source is.
  // Every mutation of pauseRef routes through here, so this is also the one place
  // that has to report upward — a listener can't miss a source that way.
  const syncPaused = () => {
    loopRef.current?.setPaused(shouldPause(pauseRef.current))
    // A fresh object: pauseRef is mutated in place, so handing it out directly
    // would let a listener hold a reference that changes under it.
    onPauseRef.current?.({ ...pauseRef.current })
  }

  // setup/teardown + the rAF loop. Re-runs only when the diversion changes; the
  // live run is held in runRef so config changes (below) can swap state under a
  // never-stopping loop.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // If the prior run scheduled a context release, decide by canvas identity: this run
    // on the SAME canvas is a genuine reuse (StrictMode remount / same-kind swap) — cancel
    // the release to keep the still-valid context. A DIFFERENT canvas means a kind change
    // remounted it, so let the old release fire — cancelling would leak the old context.
    const pending = releaseTimerRef.current
    if (pending) {
      releaseTimerRef.current = null
      if (pending.canvas === canvas) clearTimeout(pending.timer)
    }
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
        : diversion.kind === 'webgpu'
          ? // getContext('webgpu') is SYNCHRONOUS and returns the presentation
            // surface immediately; the async GPUDevice is acquired inside the
            // diversion's setup() (getSharedDevice, neural-ca ready-flag pattern),
            // which then .configure()s this context. Returns null when the browser
            // has no navigator.gpu at all — handled below.
            canvas.getContext('webgpu')
          : canvas.getContext('2d')
    ) as RenderContext | null
    if (!ctx) {
      // A missing context is a real, user-facing condition — most importantly a
      // webgpu diversion on a browser without WebGPU (getContext('webgpu') → null).
      // Surface it through the same re-throw path a setup() failure uses, so the
      // surrounding DiversionErrorBoundary shows an inline fallback for THIS tile
      // instead of a mystery blank canvas (#124).
      setSetupError(() => {
        throw new Error(
          diversion.kind === 'webgpu'
            ? 'This diversion needs a browser with WebGPU support.'
            : `Could not acquire a ${diversion.kind} drawing context.`,
        )
      })
      return
    }

    // Deterministically hand the WebGL context back to the browser. Browsers keep
    // only ~16 active WebGL contexts and evict the OLDEST when a new one is created
    // past that — so in a 100-tile gallery every context that isn't released the
    // instant its host is done leaks a live slot, and once the leaks reach 16 the
    // browser starts force-losing tiles that are still on screen (a cascade). This
    // MUST run on EVERY teardown path, including the setup()-failed early return
    // below — otherwise a tile that fails to start (e.g. lost the context race) would
    // leak the context it did acquire, making the next tile's failure more likely.
    const releaseContext = () => {
      if (diversion.kind === 'webgl') {
        ;(ctx as WebGL2RenderingContext).getExtension('WEBGL_lose_context')?.loseContext?.()
      }
    }

    // Measure the drawn box and (re)size the backing store. `force` applies unconditionally
    // (initial setup / GL restore). Otherwise this is IDEMPOTENT: writing canvas.width — even
    // the SAME value — resets the 2D context (clears the canvas + transform), so a same-size
    // ResizeObserver reflow would nuke accumulated CA/accretion state; skip the write when the
    // pixel size is unchanged (#269).
    const sizeOf = (force = false): Size => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const tw = Math.max(1, Math.floor(r.width * dpr))
      const th = Math.max(1, Math.floor(r.height * dpr))
      const changed = force || tw !== canvas.width || th !== canvas.height
      if (changed) { canvas.width = tw; canvas.height = th }
      // 2D: scale the backing store so the sim draws in CSS pixels at crisp HiDPI.
      // (Resizing the canvas resets the transform, so reapply whenever it changed.)
      if (diversion.kind === '2d') {
        if (changed) (ctx as CanvasRenderingContext2D).setTransform(dpr, 0, 0, dpr, 0, 0)
        return { width: Math.max(1, Math.floor(r.width)), height: Math.max(1, Math.floor(r.height)) }
      }
      // WebGL: work in device pixels (gl.viewport expects them).
      return { width: canvas.width, height: canvas.height }
    }

    const size = sizeOf(true)
    let state: unknown
    try {
      state = diversion.setup(ctx, config, size)
    } catch (e) {
      releaseContext() // don't leak the context this failed host acquired (cascade guard)
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
        freeRun(diversion, run)
        try {
          run.state = diversion.setup(ctx, next, run.size)
        } catch (e) {
          // Reseed setup() threw on already-torn-down state: stop the loop so frame()
          // can't tick the freed state before the error boundary takes over (mirrors
          // the [config] effect's re-setup catch).
          loopRef.current?.stop()
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
      const pw = canvas.width, ph = canvas.height
      run.size = sizeOf()
      // The RO fires for reflows that don't change the pixel size; several diversions
      // rebuild/reseed in resize(), so short-circuit when the backing store is unchanged (#269).
      if (canvas.width === pw && canvas.height === ph) return
      diversion.resize?.(run.state, run.size, ctx)
      // A paused / reduced-motion tile won't repaint itself, so the just-cleared canvas
      // (the size change reset it) would stay blank until unpause. Paint one static frame —
      // the same #120 repaint the config-edit and GL-restore paths already do.
      if (shouldPause(pauseRef.current)) diversion.frame(run.state, ctx, performance.now(), 0)
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
      freeRun(diversion, run)
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

    // Pointer input (#9): only wired when the diversion opts in via onPointer AND
    // this mount is one the viewer drives — a gallery tile is a thumbnail inside a
    // link, so painting into one is not a feature and the listeners are pure cost. The
    // framework owns the DOM — it maps each event into the diversion's own draw space
    // (CSS px for 2d, device px for GPU kinds, matching what frame() draws in) so the
    // diversion never touches the canvas or re-derives DPR. Passive: we don't
    // preventDefault (a future drag consumer can opt into that when one exists).
    // `interactive` is fixed per call site (Play/Config true, Gallery false), so it
    // joins config/showChrome as a deliberate omission from this effect's [diversion] deps.
    const onPointer = interactive ? diversion.onPointer : undefined
    const dispatchPointer = (phase: PointerSample['phase']) => (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
      const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
      // Draw space: 2d draws in CSS px; webgl/webgpu draw in device px (like `size`).
      const scale = diversion.kind === '2d' ? 1 : Math.min(window.devicePixelRatio || 1, 2)
      onPointer!(run.state, {
        phase,
        x: (e.clientX - r.left) * scale,
        y: (e.clientY - r.top) * scale,
        nx, ny,
        buttons: e.buttons,
      })
    }
    const onPointerDown = dispatchPointer('down')
    const onPointerMove = dispatchPointer('move')
    const onPointerUp = dispatchPointer('up')
    const onPointerLeave = dispatchPointer('leave')
    // pointercancel (an interrupted touch/pen gesture) fires INSTEAD of up/leave, so
    // map it to 'leave' too — else a drag consumer's held-button state would stick.
    const onPointerCancel = dispatchPointer('leave')
    if (onPointer) {
      canvas.addEventListener('pointerdown', onPointerDown)
      canvas.addEventListener('pointermove', onPointerMove)
      canvas.addEventListener('pointerup', onPointerUp)
      canvas.addEventListener('pointerleave', onPointerLeave)
      canvas.addEventListener('pointercancel', onPointerCancel)
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
      if (onPointer) {
        canvas.removeEventListener('pointerdown', onPointerDown)
        canvas.removeEventListener('pointermove', onPointerMove)
        canvas.removeEventListener('pointerup', onPointerUp)
        canvas.removeEventListener('pointerleave', onPointerLeave)
        canvas.removeEventListener('pointercancel', onPointerCancel)
      }
      loop.stop()
      loopRef.current = null
      runRef.current = null
      freeRun(diversion, run)
      // Defer the context release to a macrotask (listeners already removed above). If
      // this cleanup is a REUSE — StrictMode's dev remount or a same-kind swap — the
      // very next setup run (synchronous, same commit) clears this timer before it
      // fires, keeping the context alive for reuse. On a real unmount nothing re-runs,
      // so the timer fires and the slot is genuinely freed (the gallery relies on this).
      releaseTimerRef.current = { timer: setTimeout(releaseContext, 0), canvas }
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
      freeRun(diversion, run) // if setup() throws below, the [diversion] cleanup must not re-free (#266)
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
      {/* `--interactive` carries `touch-action: none`, and is gated on the same
          condition as the pointer listeners below. It must NOT move onto
          `.anim-canvas` itself: the gallery mounts this component per tile on a
          tall scrolling page, and `touch-action` is honoured by the compositor
          whether or not a listener exists — a blanket rule would kill scrolling
          over every tile. `pan-y` is not the answer either; a paint-style hook
          drags in both axes. */}
      {/* `data-interactive` publishes the SAME `interactive` prop to a diversion that
          attaches its own canvas listeners instead of using `onPointer` (the three
          GPU cameras — see the pointer bullet in CLAUDE.md). Those listeners live
          outside React and never see a prop, so before #290 they each guessed at this
          with `clientWidth >= 480` — which is true of a GALLERY TILE at viewports
          around 530-628px, where the grid is one column. A wheel over such a tile hit
          `preventDefault()` under `{passive:false}` and blocked page scroll, on a
          plain mouse, with no touch device involved. The host already knows the
          answer; this just says it out loud. */}
      <canvas
        key={diversion.kind}
        ref={canvasRef}
        {...{ [INTERACTIVE_ATTR]: interactive ? 'true' : 'false' }}
        className={
          // `ownsCanvasGestures` is the second way to mean "this mount consumes
          // gestures" (#290): the three GPU cameras wire their own listeners, so
          // gating on `onPointer` alone left their canvas at `touch-action: auto`
          // and a finger drag both panned and scrolled. The listener effect below
          // still keys on `onPointer` ONLY — this flag must never wire framework
          // listeners, just the CSS opt-out.
          interactive && (diversion.onPointer || diversion.ownsCanvasGestures)
            ? 'anim-canvas anim-canvas--interactive'
            : 'anim-canvas'
        }
      />
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
          {barExtra}
        </div>
      )}
    </div>
  )
}
