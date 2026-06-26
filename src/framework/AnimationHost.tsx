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
  const pausedRef = useRef(false)
  const [paused, setPaused] = useState(false)
  const [fps, setFps] = useState(0)

  // setup/teardown + the rAF loop. Re-runs only when the diversion or config identity changes.
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
      return { width: canvas.width, height: canvas.height }
    }

    let size = sizeOf()
    const state = diversion.setup(ctx, config, size)

    let acc = 0
    let frames = 0
    const loop = createLoop((t, dt) => {
      diversion.frame(state, ctx, t, dt)
      acc += dt
      frames++
      if (acc >= 500) {
        setFps(Math.round((frames * 1000) / acc))
        acc = 0
        frames = 0
      }
    })
    loopRef.current = loop
    loop.setPaused(pausedRef.current || document.hidden)
    loop.start()

    const onResize = () => {
      size = sizeOf()
      diversion.resize?.(state, size)
    }
    const onVisibility = () => loop.setPaused(pausedRef.current || document.hidden)
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      loop.stop()
      loopRef.current = null
      diversion.teardown?.(state)
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
