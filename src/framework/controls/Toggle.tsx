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
          // Load-bearing, not decoration. The switch paints a pill, so it has no text
          // of its own, and .ctl-name is a sibling <span> rather than a <label for> —
          // without this the accessible name is EMPTY and a screen reader announces an
          // unlabelled "switch, on". That was a WCAG 4.1.2 (Level A) failure, fixed in
          // #290, and it is guarded by SchemaForm.test.tsx's getByRole('switch', {name}).
          aria-label={meta.label}
          onClick={() => onChange(!value)}
        />
      </div>
      {meta.help && <div className="ctl-help">{meta.help}</div>}
    </div>
  )
}
