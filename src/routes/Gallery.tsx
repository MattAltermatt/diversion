import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { OfflineToggle } from '../framework/OfflineToggle'
import { listDiversions, loadDiversion, peekDiversion } from '../framework/registry'
import { AnimationHost } from '../framework/AnimationHost'
import { DiversionErrorBoundary } from '../framework/DiversionErrorBoundary'
import { acquireGpuSlot, releaseGpuSlot, subscribeGpuSlot } from '../framework/gpuBudget'
import type { Diversion, DiversionMeta } from '../framework/types'

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
// Since #288 the tile also owns FETCHING its diversion's code. `kind` comes from the
// eager metadata, which is what makes that compatible with the GPU budget below: the
// slot decision has to be made before any module loads, or every tile would download
// its chunk merely to learn whether it needs a WebGL context.
// Exported for Gallery.test.tsx: the gallery renders 137 of these and the test
// harness only records the most recently constructed IntersectionObserver, so a test
// cannot otherwise target a tile of a chosen `kind` — which made the GPU-slot
// regression test silently vacuous (the last tile alphabetically is a 2D piece).
export function LazyPreview({ meta }: { meta: DiversionMeta }) {
  const ref = useRef<HTMLDivElement>(null)
  const isGpu = meta.kind !== '2d'
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

  // Fetch the diversion's chunk once the tile SETTLES near the viewport (#288). This
  // deliberately hangs off the DEBOUNCED `near` state and not the IntersectionObserver
  // callback: the callback fires per tile per crossing, so a fling down the 50,000px
  // gallery would kick off 137 imports. On `near`, the existing 160ms debounce filters
  // them out — a measured hard fling issues zero.
  //
  // Not gated on `slot`: a GPU tile queued behind the budget should have its code in
  // hand the moment a slot frees, rather than starting a download then. The initial
  // peek renders a warm chunk on the first paint with no flash — a tile that scrolled
  // out and back, or any tile on a revisit.
  const [mod, setMod] = useState<Diversion | null>(() => peekDiversion(meta.id) ?? null)
  useEffect(() => {
    if (!near || mod) return
    let live = true
    loadDiversion(meta.id).then(
      (d) => {
        if (live && d) setMod(d)
      },
      // Swallowed on purpose: a tile whose chunk fails to load stays the same dark
      // placeholder it already shows while waiting for a GPU slot. There is no
      // Suspense boundary in the grid, so one dead chunk cannot blank a row.
      () => {},
    )
    return () => {
      live = false
    }
  }, [near, mod, meta.id])

  // GPU tiles claim a slot from the global budget while near-visible; hold the render
  // back until they have one so the gallery never creates the browser's 17th context
  // (which would force-lose an on-screen tile). A tile that can't get a slot yet stays
  // a dark placeholder and is woken the moment another GPU tile scrolls away.
  useEffect(() => {
    // Waits for `mod` too: since #288 the tile has to fetch its chunk first, and a
    // slot claimed before that arrives is one of only ~6 held across a network
    // round-trip while rendering nothing. Worse, a FAILED fetch leaves `mod` null
    // forever, so without this the tile would hold its slot, show nothing, and never
    // release until scrolled away — six of those starve every GPU tile on screen.
    // Orthogonal to the deliberate choice not to gate the FETCH on `slot`.
    if (!isGpu || !near || !mod) return
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
  }, [isGpu, near, mod])

  // Was Gallery()'s top-level useMemo; it needs a schema, so it could not stay there.
  // Still parsed exactly once per loaded module, keeping AnimationHost's setup effect
  // stable.
  const config = useMemo(() => mod?.schema.parse({}), [mod])

  const show = near && (!isGpu || slot) && !!mod
  return (
    <div ref={ref} className="tile-preview">
      {show && (
        // maxRetries: belt-and-suspenders — if a tile ever does lose the context race,
        // it remounts and recovers instead of latching "failed to start".
        <DiversionErrorBoundary maxRetries={5}>
          <AnimationHost
            diversion={mod!}
            config={config}
            showChrome={false}
            interactive={false}
          />
        </DiversionErrorBoundary>
      )}
    </div>
  )
}

export function Gallery() {
  // Metadata only — no schemas, no diversion code. All 137 tiles lay out on the first
  // paint; each fetches its own implementation when it scrolls near.
  const items = listDiversions()

  return (
    <div className="gallery">
      <header className="gallery-head">
        <h1 className="gallery-title">Diversions</h1>
        <p className="gallery-sub">A collection of small animated things.</p>
        <OfflineToggle />
      </header>
      <div className="gallery-grid">
        {items.map((m) => (
          <Link key={m.id} to={`/d/${m.id}`} className="tile">
            <LazyPreview meta={m} />
            <div className="tile-meta">
              <h3>{m.title}</h3>
              <p>{m.description}</p>
            </div>
          </Link>
        ))}
        {items.length === 0 && <p className="empty">No diversions registered yet.</p>}
      </div>
    </div>
  )
}
