import type { FieldMeta } from '../fieldMeta'

export function Segmented({
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
      </div>
      <div className="seg">
        {(meta.options ?? []).map((opt) => (
          <button key={opt} className={opt === value ? 'on' : ''} onClick={() => onChange(opt)}>
            {opt}
          </button>
        ))}
      </div>
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
