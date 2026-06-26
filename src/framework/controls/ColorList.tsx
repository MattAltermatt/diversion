import { useEffect, useRef, useState } from 'react'
import type { FieldMeta } from '../fieldMeta'

const HEX6 = /^#[0-9a-fA-F]{6}$/

/** "#rrggbbaa" -> { rgb: "#rrggbb", alpha: 0..100 } */
export function splitColor(hex8: string): { rgb: string; alpha: number } {
  return { rgb: hex8.slice(0, 7), alpha: Math.round((parseInt(hex8.slice(7, 9), 16) / 255) * 100) }
}

/** ("#rrggbb", 0..100) -> "#rrggbbaa" */
export function joinColor(rgb: string, alphaPct: number): string {
  const aa = Math.round((alphaPct / 100) * 255)
    .toString(16)
    .padStart(2, '0')
  return `${rgb}${aa}`
}

function ColorRow({
  hex8,
  canRemove,
  onChange,
  onRemove,
}: {
  hex8: string
  canRemove: boolean
  onChange: (next: string) => void
  onRemove: () => void
}) {
  const { rgb, alpha } = splitColor(hex8)
  // local text state so typing a partial hex isn't clobbered by the controlled value
  const [text, setText] = useState(rgb)
  useEffect(() => setText(rgb), [rgb])

  const commitText = (t: string) => {
    setText(t)
    if (HEX6.test(t)) onChange(joinColor(t, alpha))
  }

  return (
    <div className="crow">
      <input
        type="color"
        value={rgb}
        onChange={(e) => onChange(joinColor(e.target.value, alpha))}
      />
      <input className="hex" value={text} onChange={(e) => commitText(e.target.value)} />
      <button
        className="rm"
        aria-label="Remove color"
        title="Remove color"
        disabled={!canRemove}
        onClick={onRemove}
      >
        ✕
      </button>
      <div className="arow">
        <span className="alab">α</span>
        <input
          type="range"
          min={0}
          max={100}
          value={alpha}
          onChange={(e) => onChange(joinColor(rgb, Number(e.target.value)))}
        />
        <span className="aval">{alpha}%</span>
      </div>
    </div>
  )
}

export function ColorList({
  value,
  onChange,
  meta,
}: {
  value: string[]
  onChange: (v: string[]) => void
  meta: FieldMeta
}) {
  const min = meta.min ?? 1
  const max = meta.max ?? 8

  // Stable per-row ids so a ColorRow keeps its instance (and its in-progress,
  // not-yet-committed hex text) across sibling deletions — an index key would
  // unmount the holding row and silently drop the edit. Add/remove splice the
  // ids in lockstep below; a length mismatch (external change, e.g. URL decode,
  // where no local edit needs preserving) reconciles by index.
  const idsRef = useRef<number[]>([])
  const nextId = useRef(0)
  if (idsRef.current.length !== value.length) {
    idsRef.current = value.map((_, i) => idsRef.current[i] ?? nextId.current++)
  }

  const addColor = () => {
    idsRef.current = [...idsRef.current, nextId.current++]
    onChange([...value, '#7df5cf1a'])
  }
  const removeAt = (i: number) => {
    idsRef.current = idsRef.current.filter((_, j) => j !== i)
    onChange(value.filter((_, j) => j !== i))
  }

  return (
    <div className="ctl">
      <div className="ctl-top">
        <span className="ctl-name">{meta.label}</span>
        <span className="ctl-val">
          {value.length} {value.length === 1 ? 'color' : 'colors'}
        </span>
      </div>
      {meta.help && <div className="ctl-help">{meta.help}</div>}
      <div className="clist">
        {value.map((hex8, i) => (
          <ColorRow
            key={idsRef.current[i]}
            hex8={hex8}
            canRemove={value.length > min}
            onChange={(next) => onChange(value.map((c, j) => (j === i ? next : c)))}
            onRemove={() => removeAt(i)}
          />
        ))}
      </div>
      {value.length < max && (
        <button className="addc" onClick={addColor}>
          + Add color
        </button>
      )}
    </div>
  )
}
