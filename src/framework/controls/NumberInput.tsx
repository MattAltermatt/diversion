import { useState } from 'react'
import type { FieldMeta } from '../fieldMeta'
import { clampToBounds } from './Slider'

/**
 * Pick a fresh value for a number field. Bounded fields (rare here — those are
 * usually sliders) stay within [min, max]; open-ended fields like a seed get a
 * positive integer with plenty of variety. `rand` is injectable for tests.
 */
export function randomNumber(
  meta: { min?: number; max?: number; step?: number },
  rand: () => number = Math.random,
): number {
  const isInt = Number.isInteger(meta.step ?? 1)
  if (meta.min != null && meta.max != null) {
    const v = meta.min + rand() * (meta.max - meta.min)
    return isInt ? Math.round(v) : v
  }
  return Math.floor(rand() * 1_000_000)
}

export function NumberInput({
  value,
  onChange,
  meta,
}: {
  value: number
  onChange: (v: number) => void
  meta: FieldMeta
}) {
  // While focused, show exactly what's being typed (allows partial/empty input
  // like "" or "-"); when idle (draft === null) the readout reflects the
  // committed value. Committed values are clamped to whichever of [min, max]
  // meta defines — so −/＋ and typing can't drive the field out of bounds (the
  // form was previously laxer than the URL codec, which silently caught it).
  const [draft, setDraft] = useState<string | null>(null)
  const readout = draft ?? String(value)
  const step = meta.step ?? 1

  return (
    <div className="ctl">
      <div className="ctl-top">
        <span className="ctl-name">{meta.label}</span>
      </div>
      <div className="num">
        <button onClick={() => onChange(clampToBounds(value - step, meta))}>–</button>
        <input
          type="number"
          min={meta.min}
          max={meta.max}
          step={step}
          value={readout}
          onChange={(e) => {
            setDraft(e.target.value)
            if (e.target.value === '') return // allow an empty draft mid-edit
            const n = Number(e.target.value)
            if (!Number.isNaN(n)) onChange(clampToBounds(n, meta))
          }}
          onBlur={() => setDraft(null)}
        />
        <button onClick={() => onChange(clampToBounds(value + step, meta))}>+</button>
        <button
          className="num-random"
          aria-label={`Randomize ${meta.label}`}
          title={`Randomize ${meta.label}`}
          onClick={() => onChange(randomNumber(meta))}
        >
          🎲
        </button>
      </div>
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
