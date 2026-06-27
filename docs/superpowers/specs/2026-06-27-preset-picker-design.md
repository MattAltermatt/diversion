# Preset Picker — Design Spec

**Date:** 2026-06-27
**Status:** Approved (option A — framework-level seam)

## 🎯 Goal

Let a diversion declare named **preset groups** that a viewer picks from the
config panel. Each pick patches a subset of the config (e.g. all motion fields,
or the whole palette) and pushes to the URL like any other edit. Flow Field
ships two independent axes — **Flow** (motion) and **Color** (palette) — but the
mechanism is generic so Plasma / Metaballs get presets for free later.

## 🧱 Architecture

The framework owns the chrome; a diversion stays a black box that never touches
React. So presets are **declared data** on the diversion, and the framework
renders the picker. This honors the core rule and the existing schema-driven
form pattern (the diversion describes; the framework renders).

### Types (`src/framework/types.ts`)

Add one optional field to the `Diversion` interface:

```ts
export interface PresetOption<Config> {
  name: string                 // shown in the dropdown, e.g. "Aurora", "pyr3"
  patch: Partial<Config>       // config fields this preset sets
}
export interface PresetGroup<Config> {
  label: string                // the dropdown's label, e.g. "Flow", "Color"
  options: PresetOption<Config>[]
}
// on Diversion<Config, …>:
presets?: PresetGroup<Config>[]
```

`Partial<Config>` is enough: a Flow patch carries flat top-level motion fields;
a Color patch carries `background`, `blend`, and a complete `color` object.
Because `color` is supplied whole, applying a preset is a **top-level spread** —
no deep merge.

### Apply + match helpers (`src/framework/presets.ts`)

```ts
// Merge a preset patch onto the current config (top-level; patch.color is a
// complete object so it replaces wholesale).
export function applyPreset<C extends object>(config: C, patch: Partial<C>): C {
  return { ...config, ...patch }
}

// Which option (if any) the current config currently equals, per group. Returns
// the matching option name or null ("Custom") for each group, by index.
export function matchPresets<C extends object>(
  groups: PresetGroup<C>[], config: C,
): (string | null)[]
```

`matchPresets` compares, for each option, every key in its `patch` against the
config via a small recursive `deepEqual` (arrays + nested objects — the `color`
group and color arrays need it; `JSON.stringify` is too key-order-fragile).
Lives in the same module, unit-tested.

### Picker component (`src/framework/PresetPicker.tsx`)

```tsx
<PresetPicker groups={diversion.presets} value={config} onApply={update} />
```

- Renders nothing when `groups` is undefined/empty (other diversions today).
- One labeled `<select>` per group. Options are the group's option names plus a
  leading **"Custom"** entry that is selected (and disabled-as-a-choice is *not*
  needed — it's just the "no preset matches" state) when `matchPresets` returns
  null for that group.
- `onChange` → `onApply(applyPreset(value, option.patch))` — same `update` path
  `SchemaForm` uses, so the URL updates identically.

### Wiring (`src/routes/ConfigScreen.tsx`)

Render `<PresetPicker>` directly **above** `<SchemaForm>` inside the config
panel — "pick a vibe, then fine-tune below." It reuses the existing `update`
callback; no new state.

### Flow Field declares its groups (`src/diversions/flow-field/index.ts`)

Map the existing `flowPresets` → `{ label: 'Flow', options }` (each option's
`patch` is the `FlowFields` object) and `colorPresets` →
`{ label: 'Color', options }` (each `patch` is `{ background, blend, color }`).

## 🎨 Behaviour

- Picking **Flow** sets the 8 motion fields; **Color** sets background + blend +
  palette. Independent — picking one never disturbs the other.
- Any manual edit that breaks the match flips that group's dropdown to
  **"Custom"** (live state stays honest — invariant #2).
- Selecting a named preset re-applies it exactly (idempotent).

## ✅ Testing

- `applyPreset`: flat patch overrides; `color` object replaced wholesale; other
  fields untouched.
- `deepEqual` / `matchPresets`: exact config → name; one tweaked field → null;
  nested color array difference detected; multiple groups resolved independently.
- Flow Field: `presets` has two groups labeled Flow/Color with the right option
  counts (6, 7) and option names.
- `PresetPicker` (RTL): renders a select per group; selecting an option calls
  `onApply` with the merged config; shows "Custom" when nothing matches; renders
  nothing for a diversion without presets.

## 🚫 Out of scope

- Persisting a "favourite" preset, preset thumbnails, per-preset URLs.
- Presets for Plasma/Metaballs (the seam exists; content is a later arc).
