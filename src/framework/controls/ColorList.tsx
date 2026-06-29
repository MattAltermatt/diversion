import { useEffect, useRef, useState } from 'react'
import type { FieldMeta } from '../fieldMeta'

const HEX6 = /^#[0-9a-fA-F]{6}$/

/** Split a stop into rgb + alpha percent. "#rrggbbaa" carries an alpha byte;
 *  a 6-digit "#rrggbb" is alpha-less by design (e.g. an opaque density LUT whose
 *  field never uses alpha) — it reports `hasAlpha: false` so the row hides its
 *  alpha slider and edits stay 6-hex (matching the field's own regex). */
export function splitColor(hex: string): { rgb: string; alpha: number; hasAlpha: boolean } {
  const hasAlpha = hex.length >= 9
  return {
    rgb: hex.slice(0, 7),
    alpha: hasAlpha ? Math.round((parseInt(hex.slice(7, 9), 16) / 255) * 100) : 100,
    hasAlpha,
  }
}

/** ("#rrggbb", 0..100) -> "#rrggbbaa" */
export function joinColor(rgb: string, alphaPct: number): string {
  const aa = Math.round((alphaPct / 100) * 255)
    .toString(16)
    .padStart(2, '0')
  return `${rgb}${aa}`
}

function ColorRow({
  hex,
  canRemove,
  onChange,
  onRemove,
}: {
  hex: string
  canRemove: boolean
  onChange: (next: string) => void
  onRemove: () => void
}) {
  const { rgb, alpha, hasAlpha } = splitColor(hex)
  // local text state so typing a partial hex isn't clobbered by the controlled value
  const [text, setText] = useState(rgb)
  useEffect(() => setText(rgb), [rgb])

  // RGBA fields round-trip through the alpha byte; alpha-less (6-hex) fields emit
  // the bare "#rrggbb" so the value still satisfies the field's HEX6 regex.
  const emit = (nextRgb: string) => onChange(hasAlpha ? joinColor(nextRgb, alpha) : nextRgb)

  const commitText = (t: string) => {
    setText(t)
    if (HEX6.test(t)) emit(t)
  }

  return (
    <div className="crow">
      <input type="color" value={rgb} onChange={(e) => emit(e.target.value)} />
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
      {hasAlpha && (
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
      )}
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
    // Match the field's hex format: an alpha-less (6-hex) palette gets an opaque
    // "#rrggbb"; everything else (the common 8-hex RGBA case) gets "#rrggbbaa".
    const rgbOnly = value.length > 0 && value[0].length < 9
    onChange([...value, rgbOnly ? '#7df5cf' : '#7df5cf1a'])
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
        {value.map((hex, i) => (
          <ColorRow
            key={idsRef.current[i]}
            hex={hex}
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
