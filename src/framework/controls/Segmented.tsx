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
      {/* role=group + a name, because three bare <button>s announce as
          "glow, button. solid, button. xor, button." — no indication of what they
          control, and none of which is in effect. The `.on` class is the ONLY thing
          that carried selection before, and a class is invisible to assistive tech
          (SC 4.1.2, Level A; 137 segmented fields across 86 diversions). */}
      <div className="seg" role="group" aria-label={meta.label}>
        {/* Segmented is enum-backed and its options mirror the enum values, so the
            SelectOption form `meta.options` also allows never applies here. Narrow
            at the read site rather than splitting the meta type in two. */}
        {(meta.options ?? []).map((o) => (typeof o === 'string' ? o : o.value)).map((opt) => (
          <button
            key={opt}
            className={opt === value ? 'on' : ''}
            aria-pressed={opt === value}
            onClick={() => onChange(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
