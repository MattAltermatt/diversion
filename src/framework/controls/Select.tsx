import type { FieldMeta } from '../fieldMeta'

/** Native dropdown for an enum field (ui:'select'). Same data contract as Segmented
 *  (`meta.options` mirrors the enum values) but stays a fixed-width control, so a long
 *  option list never widens the panel into a horizontal scrollbar the way a row of
 *  segments does. Use for enums with many/long options (e.g. palette); reserve
 *  Segmented for 2–3 short, always-visible choices. */
export function Select({
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
      <select className="ctl-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {(meta.options ?? []).map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
