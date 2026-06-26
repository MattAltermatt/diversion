import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getDiversion } from '../framework/registry'
import { AnimationHost } from '../framework/AnimationHost'
import { decodeConfig } from '../framework/urlCodec'

export function PlayScreen() {
  const { slug } = useParams()
  const diversion = getDiversion(slug!)

  // Parse config ONCE from the URL; frozen for the session.
  const config = useMemo(
    () =>
      diversion
        ? decodeConfig(diversion.schema, new URLSearchParams(window.location.search))
        : null,
    [diversion],
  )

  if (!diversion || !config) return <div className="empty">Unknown diversion.</div>

  return (
    <div className="play-screen">
      <Link to={`/d/${diversion.id}`} className="play-back">
        ← config
      </Link>
      <AnimationHost diversion={diversion} config={config} fullscreenable />
    </div>
  )
}
