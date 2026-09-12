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

  return (
    <div className="ctl">
      <div className="ctl-top">
        <span className="ctl-name">{meta.label}</span>
        {meta.maxLabel != null && meta.max != null && value >= meta.max && draft === null ? (
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
