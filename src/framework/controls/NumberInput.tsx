import type { FieldMeta } from '../fieldMeta'

export function NumberInput({
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
      </div>
      <div className="num">
        <button onClick={() => onChange(value - (meta.step ?? 1))}>–</button>
        <input
          type="number"
          step={meta.step ?? 1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button onClick={() => onChange(value + (meta.step ?? 1))}>+</button>
      </div>
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
