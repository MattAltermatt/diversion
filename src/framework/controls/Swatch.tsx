import type { FieldMeta } from '../fieldMeta'

export function Swatch({
  value,
  onChange,
  meta,
}: {
  value: string
  onChange: (v: string) => void
  meta: FieldMeta
}) {
  return (
    <div className="ctl">
      <div className="ctl-top">
        <span className="ctl-name">{meta.label}</span>
        <span className="ctl-val">{value}</span>
      </div>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
