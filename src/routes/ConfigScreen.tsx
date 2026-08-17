import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate, useLocation, useNavigationType } from 'react-router-dom'
import { useDiversion } from '../framework/registry'
import { SchemaForm } from '../framework/SchemaForm'
import { PresetPicker } from '../framework/PresetPicker'
import { Subpanel } from '../framework/controls/Subpanel'
import { AnimationHost } from '../framework/AnimationHost'
import { DiversionErrorBoundary } from '../framework/DiversionErrorBoundary'
import { encodeConfig, decodeConfig, applyFreshLoadRandomization } from '../framework/urlCodec'
import { CopyLinkButton } from '../framework/CopyLinkButton'

export function ConfigScreen() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const navType = useNavigationType()
  const diversion = useDiversion(slug!)

  // Initialise from the router URL (stable initializer); fall back to defaults.
  const [config, setConfig] = useState(() => {
    if (!diversion) return null
    const params = new URLSearchParams(location.search)
    const decoded = decodeConfig(diversion.schema, params)
    // A flagged field (seed) the URL omits → roll fresh, so the config screen also
    // opens on a new run (matching PlayScreen). seed is never encoded, so edits keep
    // the URL seedless; an explicit ?seed=N is honored for reproducible testing.
    return applyFreshLoadRandomization(diversion.schema, decoded, params)
  })
  // Bumping this remounts AnimationHost (via its key) → a clean teardown + fresh
  // setup() with the current config, so the animation restarts from frame zero
  // (re-seeded maze, regrown slime) without reloading the page or losing edits.
  const [resetCount, setResetCount] = useState(0)

  // The location.key this screen MOUNTED at (#301). `useNavigationType()` reports
  // 'POP' for an initial page load — a reload, a bookmark, a deep link — not only for
  // back/forward. Without this guard the effect below re-ran on that very first pass
  // and re-rolled the seed the useState initializer had just rolled, so setup() ran
  // TWICE with two different worlds and the first was thrown away before it painted
  // (measured: flow-field seeds [521358674, 913967606] on one load). A ref, not state,
  // so it never renders; keyed on the mount key rather than a boolean, so React
  // strict-mode's double-invoked effect can't consume the skip.
  const mountKey = useRef(location.key)

  // Back/forward changes the URL but not our edit buffer — re-decode on POP only.
  // Our own form writes use navigate(replace) (navType !== 'POP'), so no loop.
  useEffect(() => {
    if (location.key === mountKey.current) return // first render, not a back/forward
    if (navType === 'POP' && diversion) {
      const params = new URLSearchParams(location.search)
      setConfig(applyFreshLoadRandomization(diversion.schema, decodeConfig(diversion.schema, params), params))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  // ── The URL write is coalesced to one per frame (#303) ─────────────────────
  //
  // Only the URL. `setConfig` below stays synchronous: there is deliberately no
  // debounce between a slider and the diversion's update(), and adding one here
  // would make the live preview lag the control.
  //
  // A drag emits one `input` event per rendered frame (60–120/s) and each one used
  // to call navigate(replace) → history.replaceState. WebKit rate-limits that to 100
  // calls per 10 s and then THROWS SecurityError, and react-router's `replace` has no
  // try/catch (its `push` sibling does) — so the throw escaped through navigate(),
  // the URL silently stopped updating, and "Open animation ↗" / "Copy link" / a
  // reload all carried the pre-freeze config. This app ships a PWA aimed at iOS
  // standalone, where every browser is WebKit.
  //
  // Trailing-edge only, always carrying the LATEST search string, so a drag costs one
  // replaceState per frame instead of one per event, and the value that lands is the
  // one the viewer stopped on.
  const pendingSearch = useRef<string | null>(null)
  const rafId = useRef<number | null>(null)
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  // Refs only — safe to close over from an effect that never re-subscribes.
  const writeSearch = () => {
    rafId.current = null
    const search = pendingSearch.current
    if (search === null) return
    pendingSearch.current = null
    try {
      // preventScrollReset (#302): <ScrollRestoration/> lives in Root and its restore
      // layout-effect keys on the location, and `replace` mints a NEW location key per
      // call — so every slider tick fell through to window.scrollTo(0, 0). Pinned at 0
      // and invisible above 820px (`.config-screen` is overflow:hidden there), but
      // below it #284 made the page scroll, so a phone teleported to the top of the
      // form on the first tick and stayed there for the whole drag.
      //
      // A data router's navigate() is ASYNC (it awaits router.navigate), so a history
      // throw surfaces as a REJECTION, not as a sync throw — the try/catch alone would
      // miss the very case this exists for. Guard both shapes.
      const settled = navigateRef.current({ search }, { replace: true, preventScrollReset: true }) as
        | Promise<void>
        | void
      if (settled && typeof settled.then === 'function') settled.then(undefined, () => {})
    } catch {
      // A refused history write (WebKit's rate limit, or a navigation racing the
      // flush). The config state is already applied and the preview is already
      // correct, so degrade to "the URL is briefly behind" rather than letting the
      // throw kill the form for the rest of the session.
    }
  }

  const queueSearch = (search: string) => {
    pendingSearch.current = search
    if (rafId.current === null) rafId.current = requestAnimationFrame(writeSearch)
  }

  useEffect(() => {
    // Flush on unmount so the last edit of a drag always reaches the URL even if the
    // screen goes away inside the same frame.
    return () => {
      if (rafId.current === null) return
      cancelAnimationFrame(rafId.current)
      writeSearch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!diversion || !config) return <div className="empty">Unknown diversion.</div>

  const update = (next: Record<string, unknown>) => {
    const reconciled = (diversion.reconcile ? diversion.reconcile(config as any, next as any) : next) as Record<string, unknown>
    setConfig(reconciled)
    const qs = encodeConfig(diversion.schema, reconciled).toString()
    queueSearch(qs ? `?${qs}` : '')
  }

  const playHref = `/d/${diversion.id}/play?${encodeConfig(diversion.schema, config).toString()}`

  return (
    <div className="config-screen">
      <aside className="config-panel">
        <header className="config-head">
          <Link to="/" className="back">
            ← gallery
          </Link>
          <h2>{diversion.title}</h2>
        </header>
        {diversion.presets?.length ? (
          <Subpanel label="Presets">
            {/* schema (#305): lets the picker exclude pin-only (randomizeOnFreshLoad)
                fields from the match, so a preset whose patch names a seed — "Clifford",
                "Martin (sqrt)", "Classic Bird" — stops reading Custom on every load. */}
            <PresetPicker
              groups={diversion.presets}
              value={config}
              onApply={update}
              schema={diversion.schema}
            />
          </Subpanel>
        ) : null}
        <SchemaForm schema={diversion.schema} value={config} onChange={update} />
        <div className="config-actions">
          <Link className="open-btn" to={playHref}>
            Open animation ↗
          </Link>
          <CopyLinkButton href={playHref} />
        </div>
      </aside>
      <main className="config-preview">
        <Link className="animate-pill" to={playHref}>
          animate →
        </Link>
        <button
          type="button"
          className="reset-pill"
          onClick={() => setResetCount((c) => c + 1)}
          title="Restart the animation from the beginning with the current settings"
        >
          ↺ reset
        </button>
        {/* Key the BOUNDARY (not just the host) so ↺ reset remounts it fresh — a bumped
            key on the child alone can't clear a boundary that already latched hasError. */}
        <DiversionErrorBoundary key={`${diversion.id}-${resetCount}`}>
          <AnimationHost diversion={diversion} config={config} />
        </DiversionErrorBoundary>
      </main>
    </div>
  )
}
