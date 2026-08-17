import type { FieldMeta } from '../fieldMeta'

export function Toggle({
  value,
  onChange,
  meta,
}: {
  value: boolean
  onChange: (v: boolean) => void
  meta: FieldMeta
}) {
  return (
    <div className="ctl">
      <div className="toggle-row">
        <span className="ctl-name">{meta.label}</span>
        <button
          className={`sw ${value ? 'on' : ''}`}
          role="switch"
          aria-checked={value}
          // The switch paints a pill, so it has no text of its own, and .ctl-name is
          // a sibling <span> rather than a <label for> — leaving the accessible name
          // empty, which a screen reader announces as an unlabelled "switch, on".
          // That is a WCAG 4.1.2 (Level A) failure, one level more serious than the
          // target-size item this branch started from.
          aria-label={meta.label}
          onClick={() => onChange(!value)}
        />
      </div>
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
