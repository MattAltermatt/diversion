import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate, useLocation, useNavigationType } from 'react-router-dom'
import { getDiversion } from '../framework/registry'
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
  const diversion = getDiversion(slug!)

  // Initialise from the router URL (stable initializer); fall back to defaults.
  const [config, setConfig] = useState(() => {
    if (!diversion) return null
    const params = new URLSearchParams(location.search)
    const decoded = decodeConfig(diversion.schema, params)
    // Bare load (no params) → roll a fresh seed so the config screen also opens on
    // a new run (matching PlayScreen). Any edit then writes it to the URL.
    return [...params].length === 0
      ? applyFreshLoadRandomization(diversion.schema, decoded)
      : decoded
  })
  // Bumping this remounts AnimationHost (via its key) → a clean teardown + fresh
  // setup() with the current config, so the animation restarts from frame zero
  // (re-seeded maze, regrown slime) without reloading the page or losing edits.
  const [resetCount, setResetCount] = useState(0)

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
        {diversion.presets?.length ? (
          <Subpanel label="Presets">
            <PresetPicker groups={diversion.presets} value={config} onApply={update} />
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
        <DiversionErrorBoundary>
          <AnimationHost key={`${diversion.id}-${resetCount}`} diversion={diversion} config={config} />
        </DiversionErrorBoundary>
      </main>
    </div>
  )
}
