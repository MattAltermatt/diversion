import { useMemo, useState } from 'react'
import type React from 'react'
import type { FieldMeta } from '../fieldMeta'
import { paletteColors, type PaletteName } from '../../diversions/particle-life/palette'
import { allAttract, allRepel, identity, chase, randomize, invert } from './matrixTransforms'

type Cfg = Record<string, any>

/** The flat matrix in effect: the Custom override when present AND correctly sized
 *  (length colors²), else the seed-derived table via meta.deriveFrom. */
export function effectiveMatrix(config: Cfg, meta: FieldMeta): number[] {
  const n = config.colors
  if (Array.isArray(config.matrix) && config.matrix.length === n * n) return config.matrix
  return meta.deriveFrom ? meta.deriveFrom(config) : new Array(n * n).fill(0)
}

export function speciesLabel(_config: Cfg, i: number): string {
  return `species ${i + 1}`
}

/** The relationship a value expresses — its bold verb + the CSS class that colors
 *  it (attract = blue, repel = red, ignore = neutral), matching the legend. */
export function relation(v: number): { verb: string; cls: string } {
  if (v > 0.05) return { verb: 'attracts', cls: 'mr-attract' }
  if (v < -0.05) return { verb: 'repels', cls: 'mr-repel' }
  return { verb: 'ignores', cls: 'mr-ignore' }
}

/** Cell fill: blue (attract, +) → dark (0) → red (repel, −); brightness ∝ |v|. */
function cellColor(v: number): string {
  const mag = Math.min(1, Math.abs(v))
  const [br, bg, bb] = v >= 0 ? [95, 208, 255] : [255, 107, 107]
  const t = 0.12 + 0.88 * mag
  const mix = (base: number) => Math.round(16 + (base - 16) * t)
  return `rgb(${mix(br)}, ${mix(bg)}, ${mix(bb)})`
}

/** Config-aware control (ui:'matrix'): renders the n×n per-species attract/repel
 *  table. Read direction — cell = how the ROW (left/feeler) species feels about the
 *  COLUMN (top/neighbour) species. Reads sibling fields (colors/palette) and, once
 *  editing lands, writes the whole config back through onConfigChange. */
export function MatrixEditor({ config, onConfigChange, meta }: {
  config: Cfg; onConfigChange: (next: Cfg) => void; meta: FieldMeta
}) {
  const n: number = config.colors
  const m = effectiveMatrix(config, meta)
  const colors = useMemo(() => paletteColors(config.palette as PaletteName, n), [config.palette, n])
  const [hover, setHover] = useState<[number, number] | null>(null)
  const custom = Array.isArray(config.matrix) && config.matrix.length === n * n

  const clamp = (x: number) => (x < -1 ? -1 : x > 1 ? 1 : x)
  const commit = (i: number, j: number, x: number) => {
    const next = (Array.isArray(config.matrix) && config.matrix.length === n * n
      ? config.matrix.slice()
      : effectiveMatrix(config, meta).slice())
    next[i * n + j] = clamp(x)
    if (config.symmetry === 'Symmetric' && i !== j) next[j * n + i] = clamp(x)
    onConfigChange({ ...config, matrix: next })
  }
  const reset = () => {
    const { matrix: _omit, ...rest } = config // OMIT the key (not undefined) so the codec emits nothing
    onConfigChange(rest)
  }
  const zeroAll = () => onConfigChange({ ...config, matrix: new Array(n * n).fill(0) }) // blank slate — every relationship neutral (Custom)
  const applyMatrix = (next: number[]) => onConfigChange({ ...config, matrix: next }) // whole-grid preset → Custom override (rides the share-link)
  // One-click matrix presets (#220): each is a pure transform that writes the whole
  // grid through the same Custom path as a hand-drag, so it pins into the URL snapshot.
  const presets: Array<[slug: string, label: string, title: string, run: () => number[]]> = [
    ['allplus', 'All +', 'Every pair attracts', () => allAttract(n)],
    ['allminus', 'All −', 'Every pair repels', () => allRepel(n)],
    ['identity', 'Identity', 'Self-attract, cross-repel (tight same-species clumps)', () => identity(n)],
    ['chase', 'Chase', 'Species i attracts i+1 (rock-paper-scissors trains)', () => chase(n)],
    ['random', 'Random', 'Fresh random matrix, independent of the seed', () => randomize(n)],
    ['invert', 'Invert', 'Negate the current matrix', () => invert(effectiveMatrix(config, meta))],
  ]
  const startDrag = (i: number, j: number, e: React.PointerEvent) => {
    const startY = e.clientY
    const startV = m[i * n + j] ?? 0
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture?.(e.pointerId)
    const move = (ev: PointerEvent) => commit(i, j, startV + (startY - ev.clientY) * 0.008)
    const up = () => { target.removeEventListener('pointermove', move as EventListener); target.removeEventListener('pointerup', up as EventListener) }
    target.addEventListener('pointermove', move as EventListener)
    target.addEventListener('pointerup', up as EventListener)
  }
  const typeValue = (i: number, j: number) => {
    const s = prompt(`${speciesLabel(config, i)} → ${speciesLabel(config, j)} (−1…1)`, String((m[i * n + j] ?? 0).toFixed(2)))
    if (s != null && !Number.isNaN(Number(s))) commit(i, j, Number(s))
  }

  const cols = `18px repeat(${n}, 1fr)`
  const active = hover ?? [0, Math.min(1, n - 1)]
  const av = m[active[0] * n + active[1]] ?? 0

  return (
    <div className="matrix-editor">
      <div className="matrix-legend">
        <span><i style={{ background: 'var(--accent-2)' }} />attract +</span>
        <span><i style={{ background: '#ff6b6b' }} />repel −</span>
      </div>
      <div className="matrix-grid" style={{ gridTemplateColumns: cols }}>
        <div className="mcorner" />
        {Array.from({ length: n }, (_, j) => (
          <div key={`h${j}`} className="mhead"><span className="mswatch" style={{ background: colors[j] }} /></div>
        ))}
        {Array.from({ length: n }, (_, i) => (
          <div key={`r${i}`} style={{ display: 'contents' }}>
            <div className="mhead"><span className="mswatch" style={{ background: colors[i] }} /></div>
            {Array.from({ length: n }, (_, j) => {
              const v = m[i * n + j] ?? 0
              const on = !!hover && hover[0] === i && hover[1] === j
              return (
                <div
                  key={`c${i}-${j}`}
                  data-testid={`mcell-${i}-${j}`}
                  className={`mcell${i === j ? ' diag' : ''}${on ? ' active' : ''}`}
                  style={{ background: cellColor(v) }}
                  onPointerEnter={() => setHover([i, j])}
                  onPointerLeave={() => setHover((h) => (h && h[0] === i && h[1] === j ? null : h))}
                  onPointerDown={(e) => startDrag(i, j, e)}
                  onDoubleClick={() => typeValue(i, j)}
                >
                  {n <= 5 ? <span className="mval">{v.toFixed(1)}</span> : null}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="matrix-axis">cell = how the <b>left</b> species feels about the <b>top</b> species</div>
      <div className="matrix-readout" data-testid="matrix-readout">
        <div className="mr-row"><span className="mswatch" style={{ background: colors[active[0]] }} />{speciesLabel(config, active[0])}</div>
        <div className={`mr-verb ${relation(av).cls}`}>{relation(av).verb}</div>
        <div className="mr-row"><span className="mswatch" style={{ background: colors[active[1]] }} />{speciesLabel(config, active[1])}</div>
        <div className="mr-val">{av >= 0 ? '+' : ''}{av.toFixed(2)}</div>
      </div>
      <div className="matrix-presets">
        {presets.map(([slug, label, title, run]) => (
          <button
            key={slug}
            type="button"
            className="matrix-preset"
            data-testid={`matrix-preset-${slug}`}
            title={title}
            onClick={() => applyMatrix(run())}
          >{label}</button>
        ))}
      </div>
      <div className="matrix-actions">
        <button type="button" className="matrix-reset" data-testid="matrix-reset" onClick={reset}>↺ Reset to seed</button>
        <button type="button" className="matrix-reset" data-testid="matrix-zero" onClick={zeroAll}>○ Zero all</button>
        {custom ? <span className="matrix-custom">Custom</span> : null}
      </div>
    </div>
  )
}
