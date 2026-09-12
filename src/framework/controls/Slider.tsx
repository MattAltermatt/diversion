import { useState } from 'react'
import type { FieldMeta } from '../fieldMeta'
import { clampToBounds } from './bounds'

/** Decimal places implied by the step (0.0005 → 4), so the readout matches the slider. */
function format(value: number, step?: number): string {
  if (!step || Number.isInteger(step)) return String(Math.round(value))
  const decimals = (String(step).split('.')[1] ?? '').length
  return value.toFixed(decimals)
}

export function Slider({
  value,
  onChange,
  meta,
}: {
  value: number
  onChange: (v: number) => void
  meta: FieldMeta
}) {
  // While focused, show exactly what's being typed (allows partial input like "0.");
  // when idle (draft === null) the readout reflects the formatted committed value.
  const [draft, setDraft] = useState<string | null>(null)
  const readout = draft ?? format(value, meta.step)
  const atMax = meta.maxLabel != null && meta.max != null && value >= meta.max && draft === null

  return (
    <div className="ctl">
      <div className="ctl-top">
        <span className="ctl-name">{meta.label}</span>
        {atMax ? (
          <span className="ctl-val ctl-val-max" aria-label={`${meta.label} value`}>{meta.maxLabel}</span>
        ) : (
          <input
            className="ctl-val ctl-val-edit"
            type="number"
            aria-label={`${meta.label} value`}
            min={meta.min}
            max={meta.max}
            step={meta.step ?? 1}
            value={readout}
            onChange={(e) => {
              setDraft(e.target.value)
              if (e.target.value === '') return
              const n = Number(e.target.value)
              if (!Number.isNaN(n)) onChange(clampToBounds(n, meta))
            }}
            onBlur={() => setDraft(null)}
          />
        )}
      </div>
      <input
        type="range"
        // .ctl-name is a sibling <span>, not a <label for>, so without this the track
        // announces as "slider, 4000" with no field name — across 1006 slider fields
        // (SC 4.1.2, Level A). The readout above carries "<label> value" to stay distinct.
        aria-label={meta.label}
        // At max, the readout beside this track swaps the number for meta.maxLabel
        // ("∞", "off"). Without valuetext the slider still announces the raw bound, so
        // the spoken value and the visible one disagree at exactly the value whose
        // meaning is special.
        aria-valuetext={atMax ? meta.maxLabel : undefined}
        min={meta.min}
        max={meta.max}
        step={meta.step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
