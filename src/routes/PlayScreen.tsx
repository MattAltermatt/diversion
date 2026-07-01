import { useEffect, useMemo, useState } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { getDiversion } from '../framework/registry'
import { AnimationHost } from '../framework/AnimationHost'
import { DiversionErrorBoundary } from '../framework/DiversionErrorBoundary'
import { decodeConfig, encodeConfig, applyFreshLoadRandomization, hasFreshLoadRandomization } from '../framework/urlCodec'
import { CopyLinkButton } from '../framework/CopyLinkButton'

export function PlayScreen() {
  const { slug } = useParams()
  const { search } = useLocation()
  const diversion = getDiversion(slug!)

  // Parse config ONCE from the URL; frozen for the session. Source the query
  // string from the router (useLocation) rather than window.location.search so
  // it stays correct under a HashRouter (where the query lives inside the hash)
  // and consistent with the rest of the router-driven app.
  const config = useMemo(
    () => {
      if (!diversion) return null
      const params = new URLSearchParams(search)
      const decoded = decodeConfig(diversion.schema, params)
      // Bare load (no params) → roll a fresh seed so every visit is a new run.
      // A share-link always carries params, so it reproduces exactly.
      return [...params].length === 0
        ? applyFreshLoadRandomization(diversion.schema, decoded)
        : decoded
    },
    // Frozen for the session: re-decode only when the diversion changes, not on
    // every search edit. `search` is the mount-time snapshot by intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [diversion],
  )

  // Auto-hide the chrome (back link + bar) after a few idle seconds — screensaver feel.
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    let timer = 0
    const wake = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), 2500)
    }
    window.addEventListener('mousemove', wake)
    window.addEventListener('keydown', wake)
    wake() // arm the timer on mount
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousemove', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [])

  if (!diversion || !config) return <div className="empty">Unknown diversion.</div>

  // Back link + copy link must carry the exact run on screen. When the URL already
  // has params, preserve it verbatim (keeps partial-param links clean, #2). On a
  // bare load, only encode if this diversion rolled a fresh value (e.g. a seed) —
  // otherwise stay a clean param-free config URL.
  const qs = search.length > 0
    ? search
    : hasFreshLoadRandomization(diversion.schema)
      ? `?${encodeConfig(diversion.schema, config).toString()}`
      : ''

  return (
    <div className={`play-screen ${idle ? 'idle' : ''}`}>
      <div className="play-chrome">
        <Link to={{ pathname: `/d/${diversion.id}`, search: qs }} className="play-back">
          ← config
        </Link>
        <CopyLinkButton href={`/d/${diversion.id}/play${qs}`} className="play-copy" />
      </div>
      <DiversionErrorBoundary>
        <AnimationHost diversion={diversion} config={config} fullscreenable />
      </DiversionErrorBoundary>
    </div>
  )
}
