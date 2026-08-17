import { useMemo } from 'react'
import type { ZodObject } from 'zod'
import type { PresetGroup } from './types'
import { applyPreset, matchPresets } from './presets'
import { freshLoadKeys } from './urlCodec'

// Sentinel value for the "no preset matches" (Custom) state. Selecting it is a
// no-op — there's nothing to apply — so it only ever appears as the displayed
// value when the live config has drifted off every preset.
const CUSTOM = '__custom__'

/** Renders one labeled dropdown per preset group above the config form. Picking
 *  an option patches the config (via `onApply`, the same path SchemaForm uses)
 *  so the canvas, the individual controls, and the URL all update together.
 *  Renders nothing for a diversion that declares no presets.
 *
 *  `schema` is what lets the picker exclude pin-only (`randomizeOnFreshLoad`)
 *  fields from the match — see matchPresets / #305. It is optional so the control
 *  still renders without one; omitting it just restores the old behaviour, where a
 *  preset whose patch carries a seed always reads "Custom". */
export function PresetPicker<C extends object>({
  groups,
  value,
  onApply,
  schema,
}: {
  groups: PresetGroup<C>[] | undefined
  value: C
  onApply: (next: C) => void
  schema?: ZodObject<any>
}) {
  // freshLoadKeys returns URL keys, which for a TOP-LEVEL field are always the
  // field's own name: its dotted path is just the name, so both branches of
  // buildUrlKeyMap's unique/collision split yield the same string. And
  // randomizeOnFreshLoad is only ever read off the top-level shape (by
  // applyFreshLoadRandomization too), so this set is exactly the config keys
  // matchPresets must skip. Reusing the codec's own predicate rather than walking
  // the meta again keeps the two definitions of "pin-only" from drifting apart.
  // Memoized on the schema: this runs on every keystroke of a slider drag.
  const ignoreKeys = useMemo(() => (schema ? freshLoadKeys(schema) : undefined), [schema])
  if (!groups || groups.length === 0) return null
  const matches = matchPresets(groups, value, ignoreKeys)
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
