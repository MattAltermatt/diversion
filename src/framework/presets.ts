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
 *  longest-key-set / equal-key-set match then. */
export function matchPresets<C extends object>(
  groups: PresetGroup<C>[],
  config: C,
): (string | null)[] {
  return groups.map((group) => {
    const hit = group.options.find((opt) =>
      (Object.keys(opt.patch) as (keyof C)[]).every((key) =>
        deepEqual(config[key], (opt.patch as Partial<C>)[key]),
      ),
    )
    return hit ? hit.name : null
  })
}
