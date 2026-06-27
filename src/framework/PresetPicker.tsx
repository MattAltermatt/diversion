import type { PresetGroup } from './types'
import { applyPreset, matchPresets } from './presets'

// Sentinel value for the "no preset matches" (Custom) state. Selecting it is a
// no-op — there's nothing to apply — so it only ever appears as the displayed
// value when the live config has drifted off every preset.
const CUSTOM = '__custom__'

/** Renders one labeled dropdown per preset group above the config form. Picking
 *  an option patches the config (via `onApply`, the same path SchemaForm uses)
 *  so the canvas, the individual controls, and the URL all update together.
 *  Renders nothing for a diversion that declares no presets. */
export function PresetPicker<C extends object>({
  groups,
  value,
  onApply,
}: {
  groups: PresetGroup<C>[] | undefined
  value: C
  onApply: (next: C) => void
}) {
  if (!groups || groups.length === 0) return null
  const matches = matchPresets(groups, value)
  return (
    <div className="preset-picker">
      {groups.map((group, gi) => (
        <div className="ctl preset-group" key={group.label}>
          <div className="ctl-top">
            <span className="ctl-name">{group.label}</span>
          </div>
          <select
            className="preset-select"
            aria-label={group.label}
            value={matches[gi] ?? CUSTOM}
            onChange={(e) => {
              const opt = group.options.find((o) => o.name === e.target.value)
              if (opt) onApply(applyPreset(value, opt.patch))
            }}
          >
            {matches[gi] === null && <option value={CUSTOM}>Custom</option>}
            {group.options.map((o) => (
              <option key={o.name} value={o.name}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}
