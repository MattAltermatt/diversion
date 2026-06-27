import { useEffect, useRef, useState } from 'react'
import type { Diversion, RenderContext, Size } from './types'
import { createLoop, type Loop } from './useAnimationLoop'

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
  const pausedRef = useRef(false)
  const [paused, setPaused] = useState(false)
  const [fps, setFps] = useState(0)

  // setup/teardown + the rAF loop. Re-runs only when the diversion changes; the
  // live run is held in runRef so config changes (below) can swap state under a
  // never-stopping loop.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = (
      diversion.kind === 'webgl' ? canvas.getContext('webgl2') : canvas.getContext('2d')
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

    let acc = 0
    let frames = 0
    const loop = createLoop((t, dt) => {
      diversion.frame(run.state, ctx, t, dt)
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
    loop.setPaused(pausedRef.current || document.hidden)
    loop.start()

    const onResize = () => {
      run.size = sizeOf()
      diversion.resize?.(run.state, run.size)
    }
    const onVisibility = () => loop.setPaused(pausedRef.current || document.hidden)
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
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
    pausedRef.current = paused
    loopRef.current?.setPaused(paused || document.hidden)
  }, [paused])

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
          <button onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Play' : 'Pause'}>
            {paused ? '▶' : '⏸'}
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
