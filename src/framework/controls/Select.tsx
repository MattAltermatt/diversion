import type { FieldMeta, SelectOption } from '../fieldMeta'

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
  // Normalize both accepted shapes to one. A bare string is its own label, which
  // is what every pre-existing caller relies on; `group` absent means top level.
  const opts: SelectOption[] = (meta.options ?? []).map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o,
  )
  const ungrouped = opts.filter((o) => !o.group)
  // First-seen order, so the option list controls where each heading lands rather
  // than an alphabetical sort quietly reordering them.
  const groups: string[] = []
  for (const o of opts) if (o.group && !groups.includes(o.group)) groups.push(o.group)

  return (
    <div className="ctl">
      <div className="ctl-top">
        <span className="ctl-name">{meta.label}</span>
      </div>
      <select className="ctl-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {ungrouped.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {opts.filter((o) => o.group === g).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
