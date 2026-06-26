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
    <div className="ctl toggle-row">
      <span className="ctl-name">{meta.label}</span>
      <button
        className={`sw ${value ? 'on' : ''}`}
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
      />
    </div>
  )
}
