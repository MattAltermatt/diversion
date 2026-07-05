import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { listDiversions } from '../framework/registry'
import { AnimationHost } from '../framework/AnimationHost'
import { DiversionErrorBoundary } from '../framework/DiversionErrorBoundary'
import { acquireGpuSlot, releaseGpuSlot, subscribeGpuSlot } from '../framework/gpuBudget'
import type { Diversion } from '../framework/types'

// Lazy-mount the live preview so the gallery never holds more than a screenful of
// running animations at once. Mounting every tile (there are 100+) spins up one
// WebGL context each; browsers cap active WebGL contexts at ~16, so the oldest
// get force-lost → "shader compile failed: null" on the earliest WebGL tiles, and
// 100 concurrent rAF loops churn the whole page. Here each tile only mounts its
// AnimationHost (and thus acquires a context / starts a loop) while it's on or near
// screen, and UNMOUNTS when scrolled well away — freeing the context and stopping
// the loop. The .tile-preview box keeps its aspect-ratio height whether or not a
// host is inside it, so layout never shifts. (AnimationHost has its own #6 observer
// that only PAUSES an off-screen loop; that can't help here because the context is
// already allocated at mount — the fix has to gate the mount itself.)
function LazyPreview({ diversion, config }: { diversion: Diversion; config: unknown }) {
  const ref = useRef<HTMLDivElement>(null)
  const isGpu = diversion.kind !== '2d'
  // No IntersectionObserver (jsdom/SSR) → render eagerly so nothing silently blanks.
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined')
  // A GPU tile also needs a context slot from the global budget; 2D tiles never do.
  const [slot, setSlot] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    let settle: ReturnType<typeof setTimeout> | undefined
    const io = new IntersectionObserver(
      (entries) => {
        const inView = entries[entries.length - 1].isIntersecting
        clearTimeout(settle)
        // Debounce the MOUNT (not the unmount): a fast scroll flies a tile through
        // the near-zone in well under this delay, so it never mounts — never grabs a
        // WebGL context it would immediately have to throw away. Only tiles the user
        // actually settles near acquire a context. Unmount is immediate so a context
        // (and its budget slot) is freed the instant its tile leaves.
        if (inView) settle = setTimeout(() => setNear(true), 160)
        else setNear(false)
      },
      // A modest margin prefetches the next row just before it scrolls in (smooth)
      // without mounting so many rows that we approach the WebGL context cap.
      { rootMargin: '200px 0px' },
    )
    io.observe(el)
    return () => {
      clearTimeout(settle)
      io.disconnect()
    }
  }, [])

  // GPU tiles claim a slot from the global budget while near-visible; hold the render
  // back until they have one so the gallery never creates the browser's 17th context
  // (which would force-lose an on-screen tile). A tile that can't get a slot yet stays
  // a dark placeholder and is woken the moment another GPU tile scrolls away.
  useEffect(() => {
    if (!isGpu || !near) return
    let held = acquireGpuSlot()
    setSlot(held)
    let unsub: (() => void) | undefined
    if (!held) {
      unsub = subscribeGpuSlot(() => {
        if (acquireGpuSlot()) {
          held = true
          setSlot(true)
          unsub?.()
        }
      })
    }
    return () => {
      unsub?.()
      if (held) releaseGpuSlot()
      setSlot(false)
    }
  }, [isGpu, near])

  const show = near && (!isGpu || slot)
  return (
    <div ref={ref} className="tile-preview">
      {show && (
        // maxRetries: belt-and-suspenders — if a tile ever does lose the context race,
        // it remounts and recovers instead of latching "failed to start".
        <DiversionErrorBoundary maxRetries={5}>
          <AnimationHost diversion={diversion} config={config} showChrome={false} />
        </DiversionErrorBoundary>
      )}
    </div>
  )
}

export function Gallery() {
  // Parse each default config ONCE so AnimationHost's setup effect stays stable.
  const items = useMemo(
    () => listDiversions().map((d) => ({ d, config: d.schema.parse({}) })),
    [],
  )

  return (
    <div className="gallery">
      <header className="gallery-head">
        <h1 className="gallery-title">Diversions</h1>
        <p className="gallery-sub">A collection of small animated things.</p>
      </header>
      <div className="gallery-grid">
        {items.map(({ d, config }) => (
          <Link key={d.id} to={`/d/${d.id}`} className="tile">
            <LazyPreview diversion={d} config={config} />
            <div className="tile-meta">
              <h3>{d.title}</h3>
              <p>{d.description}</p>
            </div>
          </Link>
        ))}
        {items.length === 0 && <p className="empty">No diversions registered yet.</p>}
      </div>
    </div>
  )
}
