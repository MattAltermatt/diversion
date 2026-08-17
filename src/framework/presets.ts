import type { PresetGroup } from './types'

/** Apply a preset's patch onto the current config. Top-level spread: a nested
 *  group (e.g. `color`) is supplied whole in the patch, so it replaces the old
 *  one rather than deep-merging. Never mutates the input. */
export function applyPreset<C extends object>(config: C, patch: Partial<C>): C {
  return { ...config, ...patch }
}

/** Structural equality for plain JSON config values (primitives, arrays, plain
 *  objects). Used to detect whether the live config still equals a preset —
 *  JSON.stringify is too key-order-fragile for that. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  if (a && b && typeof a === 'object') {
    const ka = Object.keys(a as object)
    const kb = Object.keys(b as object)
    if (ka.length !== kb.length) return false
    return ka.every(
      (k) =>
        Object.prototype.hasOwnProperty.call(b, k) &&
        deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    )
  }
  return false
}

/** For each group, the name of the option the current config equals, or null
 *  ("Custom") when none match. An option matches when every key in its patch
 *  deep-equals the corresponding config value. Result is positional by group.
 *
 *  Assumes the options within a group share one key-set (Flow Field's do). If a
 *  future diversion mixes patch widths in one group, a config matching a wider
 *  patch could also match a narrower earlier one (subset) — switch to a
 *  longest-key-set / equal-key-set match then.
 *
 *  `ignoreKeys` names config keys that must be excluded from the comparison —
 *  in practice the schema's `randomizeOnFreshLoad` (pin-only) fields, supplied by
 *  PresetPicker via `freshLoadKeys`. Without it, ANY preset whose patch includes a
 *  seed reads "Custom" on every single load and is unreachable: `encodeConfig`
 *  never emits a pin-only field, so `applyFreshLoadRandomization` re-rolls it on
 *  load and `deepEqual(config.seed, 7)` can never hold. Both halves are individually
 *  right — a seedless link showing a new world every visit is the codec keystone,
 *  and flipping to Custom on manual drift is what the picker is for — they were just
 *  never considered together. Ignoring the seed is also what the preset MEANS: an
 *  option named "Clifford" claims something about the attractor parameters, not
 *  about which particular Clifford world this visit rolled. #305 */
export function matchPresets<C extends object>(
  groups: PresetGroup<C>[],
  config: C,
  ignoreKeys: ReadonlySet<string> = new Set<string>(),
): (string | null)[] {
  return groups.map((group) => {
    const hit = group.options.find((opt) => {
      const keys = (Object.keys(opt.patch) as (keyof C)[]).filter(
        (key) => !ignoreKeys.has(key as string),
      )
      // Every key ignored ⇒ the option asserts nothing comparable, and `.every()`
      // over an empty list would vacuously match — making the FIRST option of a
      // seed-only group display as selected on any config at all. Custom is the
      // honest answer there. (Equal key-sets per group ⇒ this is all-or-nothing.)
      if (keys.length === 0) return false
      return keys.every((key) => deepEqual(config[key], (opt.patch as Partial<C>)[key]))
    })
    return hit ? hit.name : null
  })
}
