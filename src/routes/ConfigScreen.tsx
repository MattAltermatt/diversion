import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate, useLocation, useNavigationType } from 'react-router-dom'
import { getDiversion } from '../framework/registry'
import { SchemaForm } from '../framework/SchemaForm'
import { PresetPicker } from '../framework/PresetPicker'
import { AnimationHost } from '../framework/AnimationHost'
import { encodeConfig, decodeConfig } from '../framework/urlCodec'

export function ConfigScreen() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const navType = useNavigationType()
  const diversion = getDiversion(slug!)

  // Initialise from the router URL (stable initializer); fall back to defaults.
  const [config, setConfig] = useState(() =>
    diversion ? decodeConfig(diversion.schema, new URLSearchParams(location.search)) : null,
  )

  // Back/forward changes the URL but not our edit buffer — re-decode on POP only.
  // Our own form writes use navigate(replace) (navType !== 'POP'), so no loop.
  useEffect(() => {
    if (navType === 'POP' && diversion) {
      setConfig(decodeConfig(diversion.schema, new URLSearchParams(location.search)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  if (!diversion || !config) return <div className="empty">Unknown diversion.</div>

  const update = (next: Record<string, unknown>) => {
    setConfig(next)
    const qs = encodeConfig(diversion.schema, next).toString()
    navigate({ search: qs ? `?${qs}` : '' }, { replace: true })
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
        <PresetPicker groups={diversion.presets} value={config} onApply={update} />
        <SchemaForm schema={diversion.schema} value={config} onChange={update} />
        <Link className="open-btn" to={playHref}>
          Open animation ↗
        </Link>
      </aside>
      <main className="config-preview">
        <AnimationHost diversion={diversion} config={config} />
      </main>
    </div>
  )
}
