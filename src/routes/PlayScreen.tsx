import { useEffect, useMemo, useState } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { getDiversion } from '../framework/registry'
import { AnimationHost } from '../framework/AnimationHost'
import { DiversionErrorBoundary } from '../framework/DiversionErrorBoundary'
import { decodeConfig, applyFreshLoadRandomization, encodeConfig } from '../framework/urlCodec'
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
      // Any flagged field (seed) the URL omits → roll fresh, so a seedless link is a
      // new run every visit. An explicit ?seed=N (testing) is honored & reproduces.
      return applyFreshLoadRandomization(diversion.schema, decoded, params)
    },
    // Frozen for the session: re-decode only when the diversion changes, not on
    // every search edit. `search` is the mount-time snapshot by intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [diversion],
  )

  // The world currently on screen. Starts as the mount config; auto-restart reports
  // a fresh one via onLiveConfigChange each time it reseeds. Drives copy-link-with-seed.
  const [liveConfig, setLiveConfig] = useState<unknown>(config)

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

  // Back link + copy link mirror the incoming URL verbatim. Because seed is never
  // encoded, a seedless link stays seedless (a "new world every visit" share link),
  // while an explicit ?seed=N is preserved so a testing link still reproduces.
  const qs = search
  // Pin the live world: a FULL snapshot including the seed, so the link reopens this
  // exact world (not a new one). Falls back to the mount config before the first report.
  const pinnedQs = `?${encodeConfig(diversion.schema, (liveConfig ?? config) as never, { includePinned: true }).toString()}`

  return (
    <div className={`play-screen ${idle ? 'idle' : ''}`}>
      <div className="play-chrome">
        <Link to={{ pathname: `/d/${diversion.id}`, search: qs }} className="play-back">
          ← config
        </Link>
        <CopyLinkButton href={`/d/${diversion.id}/play${qs}`} className="play-copy" />
        <CopyLinkButton
          href={`/d/${diversion.id}/play${pinnedQs}`}
          className="play-copy"
          label="📌 Copy this world"
          copiedLabel="✓ World copied"
        />
      </div>
      <DiversionErrorBoundary>
        <AnimationHost
          diversion={diversion}
          config={config}
          fullscreenable
          onLiveConfigChange={setLiveConfig}
        />
      </DiversionErrorBoundary>
    </div>
  )
}
