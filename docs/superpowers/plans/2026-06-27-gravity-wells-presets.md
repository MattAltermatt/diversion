# Gravity Wells Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two independent preset axes (Motion + Color) to the Gravity Wells diversion, mirroring Flow Field's preset structure.

**Architecture:** Purely additive data. A new `presets.ts` declares two arrays of named patches; `index.ts` exposes them as `PresetGroup[]`. No framework changes — the preset seam (`PresetPicker`, `matchPresets`, `ConfigScreen` rendering) already exists. The first option of each axis (Vortex / Tide) carries the exact shipped schema defaults so the pickers read a named preset on load.

**Tech Stack:** TypeScript, Zod 4, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-27-gravity-wells-presets-design.md`.
- `seed` is excluded from every preset patch (the 🎲 dice stays independent).
- All color values use `0xaa` alpha (Gravity Wells convention).
- `Vortex` motion patch MUST deep-equal the schema motion defaults; `Tide` color patch MUST deep-equal the schema color defaults — these are what make the pickers read a named preset on load.
- Pattern reference: `src/diversions/flow-field/presets.ts`, `src/diversions/flow-field/index.ts`, `src/diversions/flow-field/presets.test.ts`. Follow them exactly.
- Tests are Vitest, co-located `*.test.ts`. Run with `npx vitest run <path>`.

---

### Task 1: Preset data + tests

**Files:**
- Create: `src/diversions/gravity-wells/presets.ts`
- Test: `src/diversions/gravity-wells/presets.test.ts`

**Interfaces:**
- Consumes: `GravityWellsConfig` from `./schema`; `gravityWellsSchema` (for tests); `matchPresets` from `../../framework/presets`.
- Produces:
  - `type MotionFields = Pick<GravityWellsConfig, 'particles'|'particleSize'|'noiseScale'|'fieldDrift'|'gravityInfluence'|'swirl'|'speed'|'maxWells'|'wellLifespan'|'forceMin'|'forceMax'|'fadeTrails'|'trailLength'>`
  - `type MotionPreset = { name: string; motion: MotionFields }`
  - `type ColorFields = Pick<GravityWellsConfig, 'background'|'blend'|'color'>`
  - `type ColorPreset = { name: string } & ColorFields`
  - `export const motionPresets: MotionPreset[]`
  - `export const colorPresets: ColorPreset[]`

- [ ] **Step 1: Write the failing test**

Create `src/diversions/gravity-wells/presets.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { gravityWellsSchema } from './schema'
import { motionPresets, colorPresets } from './presets'
import { matchPresets } from '../../framework/presets'
import type { GravityWellsConfig } from './schema'

const defaults = gravityWellsSchema.parse({})

describe('gravity-wells presets', () => {
  it('every motion preset patch parses against the schema', () => {
    for (const p of motionPresets) {
      expect(() => gravityWellsSchema.parse({ ...defaults, ...p.motion })).not.toThrow()
    }
  })

  it('every color preset patch parses against the schema', () => {
    for (const p of colorPresets) {
      const patch = { background: p.background, blend: p.blend, color: p.color }
      expect(() => gravityWellsSchema.parse({ ...defaults, ...patch })).not.toThrow()
    }
  })

  it('Vortex motion equals the schema motion defaults (reads named on load)', () => {
    const vortex = motionPresets.find((p) => p.name === 'Vortex')!
    for (const key of Object.keys(vortex.motion) as (keyof typeof vortex.motion)[]) {
      expect(vortex.motion[key]).toEqual(defaults[key])
    }
  })

  it('Tide color equals the schema color defaults (reads named on load)', () => {
    const tide = colorPresets.find((p) => p.name === 'Tide')!
    expect(tide.background).toEqual(defaults.background)
    expect(tide.blend).toEqual(defaults.blend)
    expect(tide.color).toEqual(defaults.color)
  })

  it('matchPresets round-trips every option', () => {
    const groups = [
      { label: 'Motion', options: motionPresets.map((p) => ({ name: p.name, patch: p.motion })) },
      {
        label: 'Color',
        options: colorPresets.map((p) => ({
          name: p.name,
          patch: { background: p.background, blend: p.blend, color: p.color },
        })),
      },
    ]
    for (const p of motionPresets) {
      const cfg = { ...defaults, ...p.motion } as GravityWellsConfig
      expect(matchPresets(groups, cfg)[0]).toBe(p.name)
    }
    for (const p of colorPresets) {
      const cfg = { ...defaults, background: p.background, blend: p.blend, color: p.color } as GravityWellsConfig
      expect(matchPresets(groups, cfg)[1]).toBe(p.name)
    }
  })

  it('names are unique within each axis', () => {
    expect(new Set(motionPresets.map((p) => p.name)).size).toBe(motionPresets.length)
    expect(new Set(colorPresets.map((p) => p.name)).size).toBe(colorPresets.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/gravity-wells/presets.test.ts`
Expected: FAIL — cannot resolve `./presets` (module not created yet).

- [ ] **Step 3: Write the implementation**

Create `src/diversions/gravity-wells/presets.ts`:

```ts
import type { GravityWellsConfig } from './schema'

// The motion fields a Motion preset sets: base flow + well dynamics + trails.
// `seed` and color are deliberately excluded — the 🎲 dice and color stay on
// their own axes.
export type MotionFields = Pick<
  GravityWellsConfig,
  | 'particles'
  | 'particleSize'
  | 'noiseScale'
  | 'fieldDrift'
  | 'gravityInfluence'
  | 'swirl'
  | 'speed'
  | 'maxWells'
  | 'wellLifespan'
  | 'forceMin'
  | 'forceMax'
  | 'fadeTrails'
  | 'trailLength'
>

export type MotionPreset = { name: string; motion: MotionFields }

// All keep fadeTrails on (trails are core to the look) and forceMin 0.1.
// Vortex carries the exact shipped schema defaults so the picker reads "Vortex"
// on load. Spread across the swirl axis (0 = drain → 1 = whirlpool).
export const motionPresets: MotionPreset[] = [
  {
    name: 'Vortex',
    motion: { particles: 10600, particleSize: 1.6, noiseScale: 0.0016, fieldDrift: 0.35,
              gravityInfluence: 1.6, swirl: 1, speed: 0.2, maxWells: 5, wellLifespan: 60,
              forceMin: 0.1, forceMax: 1.5, fadeTrails: true, trailLength: 95 },
  },
  {
    name: 'Maelstrom',
    motion: { particles: 9000, particleSize: 2.2, noiseScale: 0.004, fieldDrift: 0.6,
              gravityInfluence: 2, swirl: 0.9, speed: 0.5, maxWells: 8, wellLifespan: 25,
              forceMin: 0.1, forceMax: 1.8, fadeTrails: true, trailLength: 60 },
  },
  {
    name: 'Drain',
    motion: { particles: 9000, particleSize: 1.4, noiseScale: 0.0016, fieldDrift: 0.2,
              gravityInfluence: 1.8, swirl: 0, speed: 0.25, maxWells: 6, wellLifespan: 40,
              forceMin: 0.1, forceMax: 1.6, fadeTrails: true, trailLength: 85 },
  },
  {
    name: 'Spiral',
    motion: { particles: 10000, particleSize: 1.6, noiseScale: 0.002, fieldDrift: 0.4,
              gravityInfluence: 1.6, swirl: 0.55, speed: 0.3, maxWells: 5, wellLifespan: 45,
              forceMin: 0.1, forceMax: 1.5, fadeTrails: true, trailLength: 90 },
  },
  {
    name: 'Drift',
    motion: { particles: 7000, particleSize: 2.4, noiseScale: 0.0012, fieldDrift: 0.15,
              gravityInfluence: 0.8, swirl: 0.7, speed: 0.15, maxWells: 4, wellLifespan: 60,
              forceMin: 0.1, forceMax: 1.2, fadeTrails: true, trailLength: 80 },
  },
  {
    name: 'Galaxy',
    motion: { particles: 14000, particleSize: 1, noiseScale: 0.0008, fieldDrift: 0.25,
              gravityInfluence: 1.4, swirl: 0.95, speed: 0.18, maxWells: 10, wellLifespan: 50,
              forceMin: 0.1, forceMax: 1.3, fadeTrails: true, trailLength: 95 },
  },
]

// ─── Color presets ───────────────────────────────────────────────────────────
// A Color preset sets background + blend + the whole color group. All 0xaa alpha
// (Gravity Wells convention — long trails + lighten blend keep hue, no white-out).
// Tide carries the exact shipped color defaults so the picker reads "Tide" on
// load. Fallbacks equal the schema defaults so palette↔gradient toggling never
// lands on empty data (and Tide deep-equals the default color group).
export type ColorFields = Pick<GravityWellsConfig, 'background' | 'blend' | 'color'>
export type ColorPreset = { name: string } & ColorFields

const FALLBACK_COLORS = ['#3bd2ffaa', '#4d9bffaa', '#ffd23baa', '#ff7a3baa']
const FALLBACK_STOPS = ['#1b3a8aaa', '#3bd2ffaa', '#ffd23baa', '#ff3b3baa']

function palette(colors: string[]): GravityWellsConfig['color'] {
  return { mode: 'palette', colors, source: 'flow-angle', stops: FALLBACK_STOPS }
}
function gradient(
  stops: string[],
  source: GravityWellsConfig['color']['source'] = 'flow-angle',
): GravityWellsConfig['color'] {
  return { mode: 'gradient', colors: FALLBACK_COLORS, source, stops }
}

export const colorPresets: ColorPreset[] = [
  { name: 'Tide', background: '#05060f', blend: 'lighten',
    color: palette(['#3bd2ffaa', '#4d9bffaa', '#ffd23baa', '#ff7a3baa']) },
  { name: 'Nebula', background: '#05060f', blend: 'screen',
    color: palette(['#3a6dffaa', '#18d2ffaa', '#ff45a8aa', '#d6e6ffaa']) },
  { name: 'Ember', background: '#0a0a0c', blend: 'lighten',
    color: palette(['#bf2408aa', '#ff8c1aaa', '#ffbe3eaa', '#ffb56eaa']) },
  { name: 'Acid', background: '#02080a', blend: 'lighten',
    color: palette(['#39ff14aa', '#aaff00aa', '#00ffc8aa', '#d4ff3aaa']) },
  { name: 'Mono', background: '#050507', blend: 'lighten',
    color: palette(['#e6ebf2aa', '#a8b3c4aa', '#5e6a7eaa']) },
  { name: 'Spectrum', background: '#06060a', blend: 'lighten',
    color: gradient(['#ff4d6aaa', '#ffb24daa', '#7cff4daa', '#4dd6ffaa', '#9a6bffaa']) },
  { name: 'Field Heat', background: '#06060f', blend: 'lighten',
    color: gradient(['#1b3a8aaa', '#3bd2ffaa', '#ffd23baa', '#ff3b3baa'], 'field') },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/gravity-wells/presets.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/gravity-wells/presets.ts src/diversions/gravity-wells/presets.test.ts
git commit -m "gravity-wells: Motion + Color preset data + tests (#42)"
```

---

### Task 2: Wire presets into the diversion

**Files:**
- Modify: `src/diversions/gravity-wells/index.ts`

**Interfaces:**
- Consumes: `motionPresets`, `colorPresets` from `./presets`; `PresetGroup` from `../../framework/types`.
- Produces: the exported `gravityWells` diversion now has a `presets` field, which `ConfigScreen` renders as two `PresetPicker` dropdowns.

- [ ] **Step 1: Add the import**

In `src/diversions/gravity-wells/index.ts`, add to the existing imports:

```ts
import type { Diversion, PresetGroup } from '../../framework/types'
import { motionPresets, colorPresets } from './presets'
```
(Merge `PresetGroup` into the existing `import type { Diversion } ...` line if `Diversion` is imported alone; check the current import and adjust.)

- [ ] **Step 2: Declare the preset groups**

Above the `const gravityWells: Diversion<...>` declaration, add:

```ts
// Two independent preset axes. A Motion option patches the flow + well dynamics
// + trails; a Color option patches background + blend + the whole color group.
// Seed is excluded from both — the 🎲 dice stays independent of the chosen look.
const presets: PresetGroup<GravityWellsConfig>[] = [
  { label: 'Motion', options: motionPresets.map((p) => ({ name: p.name, patch: p.motion })) },
  {
    label: 'Color',
    options: colorPresets.map((p) => ({
      name: p.name,
      patch: { background: p.background, blend: p.blend, color: p.color },
    })),
  },
]
```
(`GravityWellsConfig` is already imported in `index.ts`; if not, add it from `./schema`.)

- [ ] **Step 3: Attach `presets` to the diversion**

Add `presets,` to the exported `gravityWells` diversion object (alongside `setup`, `frame`, `update`, etc.), mirroring `flow-field/index.ts`.

- [ ] **Step 4: Run the full test suite + typecheck**

Run: `npx vitest run`
Expected: PASS (all existing tests + the 6 new preset tests).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/gravity-wells/index.ts
git commit -m "gravity-wells: expose Motion + Color preset pickers (#42)"
```

---

## Verification (separate phases — not tasks)

- **Code review:** dispatch the `diversion-reviewer` agent against the branch diff (required pre-FF-merge phase, no implementation bias).
- **Chrome verify** (chrome-devtools MCP, port 5180): open the Gravity Wells config screen at `http://localhost:5180/...?mute=1`; confirm:
  - Two preset dropdowns (Motion + Color) render above the form.
  - On load both read **Vortex** / **Tide** (not "Custom").
  - Picking each Motion preset visibly changes the motion; picking each Color preset changes palette/canvas.
  - **Field Heat** shows particles flaring hot near wells (the `field` source showcase).
  - Editing any control flips the relevant group to "Custom".
- **Docs:** none required (presets are self-describing data); close #42 on FF-merge.

## Self-Review

- **Spec coverage:** Motion presets (6) ✓ Task 1. Color presets (7) ✓ Task 1. Two-axis wiring ✓ Task 2. Unused-axis fallback ✓ (`FALLBACK_*` in Task 1). Vortex/Tide match-on-load ✓ (tests in Task 1). Field-source showcase ✓ (Field Heat). ColorList unchanged ✓ (not touched). Control-org out of scope ✓ (not touched).
- **Placeholder scan:** none — all code is literal.
- **Type consistency:** `motionPresets`/`colorPresets` names consistent across Task 1 (definition) and Task 2 (import). `MotionFields`/`ColorFields` Pick key-sets match the spec's axis field lists.
