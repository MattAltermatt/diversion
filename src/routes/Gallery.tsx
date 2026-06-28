import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { listDiversions } from '../framework/registry'
import { AnimationHost } from '../framework/AnimationHost'
import { DiversionErrorBoundary } from '../framework/DiversionErrorBoundary'

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
            <div className="tile-preview">
              <DiversionErrorBoundary>
                <AnimationHost diversion={d} config={config} showChrome={false} />
              </DiversionErrorBoundary>
            </div>
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
