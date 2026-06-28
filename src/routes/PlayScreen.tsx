import { useEffect, useMemo, useState } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { getDiversion } from '../framework/registry'
import { AnimationHost } from '../framework/AnimationHost'
import { decodeConfig } from '../framework/urlCodec'
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
    () => (diversion ? decodeConfig(diversion.schema, new URLSearchParams(search)) : null),
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

  return (
    <div className={`play-screen ${idle ? 'idle' : ''}`}>
      <div className="play-chrome">
        <Link to={{ pathname: `/d/${diversion.id}`, search }} className="play-back">
          ← config
        </Link>
        <CopyLinkButton href={`/d/${diversion.id}/play${search}`} className="play-copy" />
      </div>
      <AnimationHost diversion={diversion} config={config} fullscreenable />
    </div>
  )
}
