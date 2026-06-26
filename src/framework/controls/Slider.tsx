import type { FieldMeta } from '../fieldMeta'

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
  return (
    <div className="ctl">
      <div className="ctl-top">
        <span className="ctl-name">{meta.label}</span>
        <span className="ctl-val">{format(value, meta.step)}</span>
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
