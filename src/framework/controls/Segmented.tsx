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
        {/* Segmented is enum-backed and its options mirror the enum values, so the
            SelectOption form `meta.options` also allows never applies here. Narrow
            at the read site rather than splitting the meta type in two. */}
        {(meta.options ?? []).map((o) => (typeof o === 'string' ? o : o.value)).map((opt) => (
          <button key={opt} className={opt === value ? 'on' : ''} onClick={() => onChange(opt)}>
            {opt}
          </button>
        ))}
      </div>
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
