# Flow Field polish + share-link robustness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make share links permanent full-snapshot URLs with flat names and per-field graceful decode (#4); make Flow Field's fresh load resolve to the named pair Silk + Mariners (#38); default blend to `normal` with bulleted help; add a second gradient color preset, Dusk (#40).

**Architecture:** The generic URL codec (`urlCodec.ts`, the keystone) stops omitting defaults and stops using dotted nesting in URL keys — every field is emitted under its leaf name (unique-in-schema; dotted fallback otherwise), and decode validates each field independently so one stale value can't nuke a whole link. Flow Field's schema defaults and two presets are nudged so `matchPresets` resolves both axes on load.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4 + Vitest. Dev server pinned to port 5180. Verify in Chrome via chrome-devtools MCP.

**Spec:** `docs/superpowers/specs/2026-06-27-flow-field-polish-and-share-links-design.md`

---

## File structure

- `src/framework/urlCodec.ts` — full-snapshot encode, `buildUrlKeyMap` (flat naming), `leafNodes` + per-field decode, `leafNameCollisions` (exported guard).
- `src/framework/urlCodec.test.ts` — rewrite omit-defaults tests → full-snapshot; add per-field degradation + legacy-key tests.
- `src/framework/urlKeys.test.ts` (new) — cross-schema leaf-name uniqueness guard over `listDiversions()`.
- `src/diversions/flow-field/presets.ts` — retune Silk; Mariners → normal; add Dusk gradient preset.
- `src/diversions/flow-field/presets.test.ts` — update color count 7→8; assert Silk/Mariners/Dusk; assert default resolves to Silk/Mariners + blend normal.
- `src/diversions/flow-field/schema.ts` — new defaults (Silk+Mariners values), `blend` default `'normal'`, bulleted blend help.
- `src/framework/theme.css` — `.ctl-help { white-space: pre-line }`.

---

## Task 1: Codec — full-snapshot encode + flat leaf-name keys (inline, foundational)

Locks the new codec shape and test idiom. Per-field decode comes in Task 2; this task keeps the existing final `safeParse`.

**Files:**
- Modify: `src/framework/urlCodec.ts`
- Test: `src/framework/urlCodec.test.ts`

- [ ] **Step 1: Rewrite the encode tests + add legacy-key + array tests to full-snapshot expectations**

In `src/framework/urlCodec.test.ts`, replace the entire `describe('encodeConfig', …)` block with:

```ts
describe('encodeConfig (full snapshot, flat keys)', () => {
  it('emits every field (full snapshot, not just changes)', () => {
    const sp = encodeConfig(schema, defaults)
    expect(sp.get('particles')).toBe('4000')
    expect(sp.get('speed')).toBe('1.2')
    expect(sp.get('blend')).toBe('lighter')
    expect(sp.get('fadeTrails')).toBe('true')
    // nested group leaves flatten to their unique leaf name
    expect(sp.get('background')).toBe('#0a0a12')
    expect(sp.get('hueStart')).toBe('200')
    expect(sp.has('palette.hueStart')).toBe(false) // dotted form not used when leaf is unique
  })

  it('reflects changed values under flat keys', () => {
    const cfg = { ...defaults, particles: 8000, palette: { background: '#0a0a12', hueStart: 300 } }
    const sp = encodeConfig(schema, cfg)
    expect(sp.get('particles')).toBe('8000')
    expect(sp.get('hueStart')).toBe('300')
  })
})
```

In the `describe('decodeConfig', …)` block, add this test (after the round-trip test):

```ts
  it('still decodes legacy dotted-key URLs', () => {
    const out = decodeConfig(schema, new URLSearchParams('particles=5000&palette.hueStart=120'))
    expect(out.particles).toBe(5000)
    expect(out.palette.hueStart).toBe(120)
  })
```

In `describe('non-numeric arrays, vectors, and strings (#3)', …)`, replace the `it('omits arrays still at their default', …)` test with:

```ts
  it('emits arrays even at their default (full snapshot)', () => {
    const sp = encodeConfig(arrSchema, { ...arrDefaults, label: 'ember' })
    expect(sp.has('ramp')).toBe(true)
    expect(sp.has('weights')).toBe(true)
    expect(sp.get('label')).toBe('ember')
  })
```

- [ ] **Step 2: Run the codec tests to verify the rewritten ones fail**

Run: `npx vitest run src/framework/urlCodec.test.ts`
Expected: FAIL — the full-snapshot / flat-key / legacy-key assertions fail against the current omit-defaults + dotted codec.

- [ ] **Step 3: Add `buildUrlKeyMap` + `leafNameCollisions`; rewrite `encodeConfig`; thread the reverse map + legacy fallback into `decodeConfig`**

In `src/framework/urlCodec.ts`, insert these two functions immediately after `leafTypes` (before the `--- value <-> string encoding ---` section):

```ts
/** Map each dotted leaf path to its URL key and back. The URL key is the leaf's
 *  final segment when that name is globally unique within the schema; otherwise
 *  the full dotted path (collision fallback). Keeps URLs flat while staying
 *  unambiguous. */
function buildUrlKeyMap(schema: any): { encode: Map<string, string>; decode: Map<string, string> } {
  const paths = [...leafTypes(schema).keys()]
  const counts = new Map<string, number>()
  for (const p of paths) {
    const leaf = p.split('.').at(-1)!
    counts.set(leaf, (counts.get(leaf) ?? 0) + 1)
  }
  const encode = new Map<string, string>()
  const decode = new Map<string, string>()
  for (const p of paths) {
    const leaf = p.split('.').at(-1)!
    const key = counts.get(leaf) === 1 ? leaf : p
    encode.set(p, key)
    decode.set(key, p)
  }
  return { encode, decode }
}

/** Leaf names that occur more than once in the schema (would force a dotted
 *  fallback). Empty array = every leaf flattens cleanly. CI guard. */
export function leafNameCollisions(schema: any): string[] {
  const counts = new Map<string, number>()
  for (const p of leafTypes(schema).keys()) {
    const leaf = p.split('.').at(-1)!
    counts.set(leaf, (counts.get(leaf) ?? 0) + 1)
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([leaf]) => leaf)
}
```

Replace `encodeConfig` entirely with (drops the omit-defaults gate; emits flat keys):

```ts
export function encodeConfig<T extends ZodObject<any>>(
  schema: T,
  value: ReturnType<T['parse']>,
): URLSearchParams {
  const flatVal = flatten(value as Json)
  const { encode } = buildUrlKeyMap(schema)
  const sp = new URLSearchParams()
  for (const [path, v] of Object.entries(flatVal)) {
    sp.set(encode.get(path) ?? path, v) // full snapshot — every field, flat leaf name
  }
  return sp
}
```

Replace `decodeConfig` with (reverse-map flat keys, legacy dotted fallback; final `safeParse` unchanged for now):

```ts
export function decodeConfig<T extends ZodObject<any>>(
  schema: T,
  params: URLSearchParams,
): ReturnType<T['parse']> {
  const defaults = schema.parse({}) as Json
  const leaves = leafTypes(schema)
  const { decode: reverse } = buildUrlKeyMap(schema)
  const out = structuredClone(defaults)
  for (const [rawKey, raw] of params) {
    const path = reverse.get(rawKey) ?? rawKey // flat → dotted; legacy dotted keys pass through
    const leaf = leaves.get(path)
    if (!leaf) continue // unknown / non-schema param → ignore
    setPath(out, path, decodeLeaf(raw, leaf))
  }
  const result = schema.safeParse(out)
  return (result.success ? result.data : defaults) as ReturnType<T['parse']>
}
```

- [ ] **Step 4: Run the codec tests to verify they pass**

Run: `npx vitest run src/framework/urlCodec.test.ts`
Expected: PASS (all describe blocks, including round-trip/coercion/array/8-digit-hex).

- [ ] **Step 5: Commit**

```bash
git add src/framework/urlCodec.ts src/framework/urlCodec.test.ts
git commit -m "codec: full-snapshot encode with flat leaf-name keys (#4)"
```

---

## Task 2: Codec — per-field graceful degradation on decode (subagent-able)

Replace the all-or-nothing `safeParse` fallback so one invalid field defaults only itself, keeping the rest.

**Files:**
- Modify: `src/framework/urlCodec.ts`
- Test: `src/framework/urlCodec.test.ts`

- [ ] **Step 1: Write the failing per-field tests**

In `src/framework/urlCodec.test.ts`, add a new describe block at the end:

```ts
describe('decodeConfig — per-field graceful degradation', () => {
  it('keeps valid fields when another field is invalid', () => {
    // particles is out of range (max 20000); speed is valid
    const out = decodeConfig(schema, new URLSearchParams('speed=3.5&particles=999999'))
    expect(out.speed).toBe(3.5) // valid field survives
    expect(out.particles).toBe(defaults.particles) // bad field → its own default
  })

  it('defaults only the bad array field, keeping siblings', () => {
    const pSchema = z.object({
      label: z.string().default('x'),
      palette: z
        .object({
          colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).default(['#11223344']),
        })
        .default({ colors: ['#11223344'] }),
    })
    const out = decodeConfig(pSchema, new URLSearchParams('label=ember&colors=bad,#00ff00ff'))
    expect(out.label).toBe('ember') // good field kept
    expect(out.palette.colors).toEqual(['#11223344']) // bad array → default
  })
})
```

Also update the two existing fallback test descriptions in the `decodeConfig` block to reflect per-field behavior (behavior unchanged — they set only the bad field — but the names should not claim "full defaults"):

```ts
  it('defaults an out-of-range field (rest already default → equals defaults)', () => {
    expect(decodeConfig(schema, new URLSearchParams('particles=999999'))).toEqual(defaults)
  })

  it('defaults garbage fields individually (rest already default → equals defaults)', () => {
    expect(decodeConfig(schema, new URLSearchParams('particles=abc&blend=purple'))).toEqual(
      defaults,
    )
  })
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/framework/urlCodec.test.ts -t "per-field"`
Expected: FAIL — `keeps valid fields when another field is invalid` fails because the current single `safeParse` discards `speed` too (whole-object fallback).

- [ ] **Step 3: Add `leafNodes` and per-field validation**

In `src/framework/urlCodec.ts`, add after `leafTypes` (near `buildUrlKeyMap`):

```ts
/** Map each dotted leaf path to its unwrapped Zod node, for per-field validation. */
function leafNodes(schema: any, prefix = '', out: Map<string, any> = new Map()): Map<string, any> {
  const shape = schema.shape as Record<string, unknown>
  for (const [key, field] of Object.entries(shape)) {
    const path = prefix ? `${prefix}.${key}` : key
    const inner = unwrap(field)
    if (defType(inner) === 'object') leafNodes(inner, path, out)
    else out.set(path, inner)
  }
  return out
}
```

In `decodeConfig`, add `const nodes = leafNodes(schema)` next to `const leaves = …`, and replace the loop body's `setPath(...)` line so a value that fails its own node validation is skipped (keeping the cloned default):

```ts
    const leaf = leaves.get(path)
    if (!leaf) continue // unknown / non-schema param → ignore
    const value = decodeLeaf(raw, leaf)
    const node = nodes.get(path)
    if (node && !node.safeParse(value).success) continue // bad field → keep its default
    setPath(out, path, value)
```

(The final `schema.safeParse(out)` stays as a typed-result safety net.)

- [ ] **Step 4: Run the full codec test file**

Run: `npx vitest run src/framework/urlCodec.test.ts`
Expected: PASS (per-field block + all prior tests).

- [ ] **Step 5: Commit**

```bash
git add src/framework/urlCodec.ts src/framework/urlCodec.test.ts
git commit -m "codec: per-field graceful degradation on decode (#4)"
```

---

## Task 3: Codec — cross-schema leaf-name uniqueness guard (subagent-able)

A build break if any diversion ever introduces a colliding leaf name (which would silently rename another field's URL key).

**Files:**
- Create: `src/framework/urlKeys.test.ts`

- [ ] **Step 1: Write the guard test**

Create `src/framework/urlKeys.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { listDiversions } from './registry'
import { leafNameCollisions } from './urlCodec'

describe('URL key uniqueness (flat-naming guard)', () => {
  for (const d of listDiversions()) {
    it(`${d.id}: every schema leaf name is globally unique`, () => {
      // If this fails, two fields share a final path segment and would collide
      // in the flat URL. Rename one field, or add an explicit url-key escape hatch.
      expect(leafNameCollisions(d.schema as any)).toEqual([])
    })
  }
})
```

- [ ] **Step 2: Run to verify it passes today**

Run: `npx vitest run src/framework/urlKeys.test.ts`
Expected: PASS — one passing `it` per diversion (flow-field, plasma, metaballs).

- [ ] **Step 3: Commit**

```bash
git add src/framework/urlKeys.test.ts
git commit -m "test: guard against URL leaf-name collisions across diversions (#4)"
```

---

## Task 4: Flow Field presets — retune Silk, Mariners→normal, add Dusk gradient (subagent-able)

**Files:**
- Modify: `src/diversions/flow-field/presets.ts`
- Test: `src/diversions/flow-field/presets.test.ts`

- [ ] **Step 1: Update the preset assertions**

In `src/diversions/flow-field/presets.test.ts`:

Change the color-count assertion in the `'exposes every flow/color preset as an option'` test from `toHaveLength(7)` to:

```ts
    expect(color.options).toHaveLength(8)
```

Add a new test block:

```ts
  it('Silk is retuned to the default motion (fieldDrift 0.71, speed 0.15)', () => {
    const silk = flowPresets.find((p) => p.name === 'Silk')!
    expect(silk.flow.fieldDrift).toBe(0.71)
    expect(silk.flow.speed).toBe(0.15)
    expect(silk.flow.particleSize).toBe(2.5)
  })

  it('Mariners uses normal blend (color-true)', () => {
    const mariners = colorPresets.find((p) => p.name === 'Mariners')!
    expect(mariners.blend).toBe('normal')
  })

  it('Dusk is a gradient-mode preset with no pure white', () => {
    const dusk = colorPresets.find((p) => p.name === 'Dusk')!
    expect(dusk.color.mode).toBe('gradient')
    expect(dusk.color.stops).toEqual(['#3b2d8f66', '#c43b9a66', '#ff8a3b66'])
    expect(dusk.color.stops.some((s) => /^#ffffff/i.test(s))).toBe(false)
  })
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/diversions/flow-field/presets.test.ts`
Expected: FAIL — Silk still has `fieldDrift 0.05 / speed 0.24`, Mariners is `screen`, Dusk does not exist, color count is 7.

- [ ] **Step 3: Edit `presets.ts`**

In `src/diversions/flow-field/presets.ts`:

Retune the Silk entry in `flowPresets`:

```ts
  {
    name: 'Silk',
    flow: { noiseScale: 0.0014, fieldDrift: 0.71, speed: 0.15, lifespan: 6.5,
            trailLength: 72, particles: 7200, particleSize: 2.5, fadeTrails: true },
  },
```

Change the Mariners entry's blend in `colorPresets` from `'screen'` to `'normal'`:

```ts
  { name: 'Mariners', background: '#050810', blend: 'normal',
    color: palette(['#2a5cf066', '#4d9bff66', '#ffc22e66', '#ffe08a66']) },
```

Add the Dusk preset to `colorPresets` (place it right after `Spectrum`, keeping the gradient presets together):

```ts
  // Dusk — a second gradient preset (indigo → magenta → warm amber) to give the
  // gradient mode variety beyond Spectrum's full rainbow. No pure white; 0x66 alpha.
  { name: 'Dusk', background: '#06060f', blend: 'screen',
    color: gradient(['#3b2d8f66', '#c43b9a66', '#ff8a3b66']) },
```

- [ ] **Step 4: Run to verify the preset tests pass**

Run: `npx vitest run src/diversions/flow-field/presets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/flow-field/presets.ts src/diversions/flow-field/presets.test.ts
git commit -m "flow-field: retune Silk, Mariners→normal, add Dusk gradient preset (#38/#40)"
```

---

## Task 5: Flow Field schema — defaults to Silk/Mariners, blend default normal, blend help (inline-ish)

**Files:**
- Modify: `src/diversions/flow-field/schema.ts`
- Test: `src/diversions/flow-field/presets.test.ts`

- [ ] **Step 1: Write the failing default-resolution tests**

In `src/diversions/flow-field/presets.test.ts`, add the import at the top:

```ts
import { matchPresets } from '../../framework/presets'
```

Add a new describe block at the end of the file:

```ts
describe('flow-field default config', () => {
  it('resolves to the named pair Silk / Mariners (not Custom/Custom)', () => {
    const defaults = flowFieldSchema.parse({})
    expect(matchPresets(flowField.presets!, defaults)).toEqual(['Silk', 'Mariners'])
  })

  it('defaults blend to normal (color-true out of the box)', () => {
    expect(flowFieldSchema.parse({}).blend).toBe('normal')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/diversions/flow-field/presets.test.ts -t "default config"`
Expected: FAIL — current defaults match neither Silk nor Mariners; blend default is `screen`.

- [ ] **Step 3: Edit `schema.ts` defaults + blend default + help**

In `src/diversions/flow-field/schema.ts`, set the field defaults to the Silk+Mariners values:

```ts
  particles: z.number().int().min(100).max(20000).default(7200)
    .meta({ ui: 'slider', min: 100, max: 20000, step: 100, label: 'Particles' }),
  particleSize: z.number().min(0.5).max(6).default(2.5)
    .meta({ ui: 'slider', min: 0.5, max: 6, step: 0.1, label: 'Particle size',
            help: 'Thickness of each particle stroke, in pixels.' }),
  noiseScale: z.number().min(0.0005).max(0.02).default(0.0014)
    .meta({ ui: 'slider', min: 0.0005, max: 0.02, step: 0.0005, label: 'Noise scale',
            help: 'Lower = broad, sweeping currents. Higher = tight, turbulent detail.' }),
  fieldDrift: z.number().min(0).max(1).default(0.71)
    .meta({ ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Field drift',
            help: 'Slowly morphs the flow field over time. 0 = frozen.' }),
  speed: z.number().min(0).max(1).default(0.15)
    .meta({ ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Speed' }),
  lifespan: z.number().min(0.5).max(12).default(6.5)
    .meta({ ui: 'slider', min: 0.5, max: 12, step: 0.1, label: 'Particle lifespan',
            help: 'Seconds a particle lives before respawning elsewhere. Shorter = busier, '
                + 'fewer long streaks; longer = sparser, longer ribbons.' }),
```

Change the `blend` field — new default `'normal'` and the bulleted help (note `\n- ` lines; rendered as bullets via the `.ctl-help` CSS in Task 6):

```ts
  blend: z.enum(['lighter', 'screen', 'normal']).default('normal')
    .meta({ ui: 'segmented', options: ['lighter', 'screen', 'normal'], label: 'Blend',
            help: 'How overlapping ribbons combine:\n'
                + '- normal (default): each particle’s true color\n'
                + '- screen: glows and mixes; dense areas wash to white\n'
                + '- lighter: stronger glow; whites out fastest' }),
```

Change the `trailLength` default to 72:

```ts
  trailLength: z.number().min(0).max(100).default(72)
```
(keep its existing `.meta({...})` chain unchanged).

Change the `background` default to `'#050810'`:

```ts
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#050810')
    .meta({ ui: 'color', label: 'Background' }),
```

Change the `color.colors` field default AND the `color` group `.default({...})` to the Mariners palette (mode/source/stops unchanged — stops stay the existing fallback set):

In the `colors` field:

```ts
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(8)
      .default(['#2a5cf066', '#4d9bff66', '#ffc22e66', '#ffe08a66'])
      .meta({ ui: 'colorList', label: 'Colors', min: 1, max: 8,
              showWhen: { field: 'mode', equals: 'palette' },
              help: 'Each particle picks one color at random when it spawns and keeps it for '
                  + 'life. Overlapping ribbons always build toward white; higher alpha shows '
                  + 'truer color per stroke before it does, lower alpha layers up more slowly.' }),
```

In the group `.default({...})`:

```ts
  }).default({
    mode: 'palette',
    colors: ['#2a5cf066', '#4d9bff66', '#ffc22e66', '#ffe08a66'],
    source: 'flow-angle',
    stops: ['#ff3b3b66', '#ffd23b66', '#3bff7a66', '#3bd2ff66', '#6a3bff66'],
  }).meta({ ui: 'group', label: 'Color' }),
```

- [ ] **Step 4: Run the default-resolution + full flow-field suite**

Run: `npx vitest run src/diversions/flow-field/`
Expected: PASS — default resolves to `['Silk', 'Mariners']`, blend default `normal`, and the existing `'every preset patch is valid'` test still passes.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/flow-field/schema.ts src/diversions/flow-field/presets.test.ts
git commit -m "flow-field: default to Silk/Mariners + normal blend, bulleted blend help (#38)"
```

---

## Task 6: Help bullets render — `.ctl-help` CSS (inline, trivial; verified visually)

**Files:**
- Modify: `src/framework/theme.css`

- [ ] **Step 1: Add `white-space: pre-line` to `.ctl-help`**

In `src/framework/theme.css`, update the `.ctl-help` rule (around line 240) to:

```css
.ctl-help {
  font-size: 10.5px;
  line-height: 1.45;
  color: var(--muted);
  font-family: -apple-system, system-ui, sans-serif;
  white-space: pre-line; /* honor \n in help text so bullet lists render as lines */
}
```

- [ ] **Step 2: Typecheck + full test run (no unit test for CSS; visual verify in Task 7)**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS / no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/framework/theme.css
git commit -m "framework: render multi-line control help (bullets) via pre-line"
```

---

## Task 7: Chrome verification + docs (inline)

**Files:**
- Modify (docs): `README.md` (feature set / share-link note if present), `CLAUDE.md` (codec gotcha note).

- [ ] **Step 1: Start the dev server (background)**

Run: `npm run dev` (background). Confirm the listening port (expected 5180; Vite may bump to 5181 — check the log).

- [ ] **Step 2: Verify in Chrome (chrome-devtools MCP)**

Navigate to `http://localhost:5180/d/flow-field?mute=1` (use the actual port) and confirm:
- Both dropdowns read **Flow = Silk**, **Color = Mariners** (not Custom).
- Canvas is color-true (blue/amber Mariners palette, normal blend) — **no white-out**.
- BLEND help renders as three bullet lines.
- The address-bar URL is a full snapshot with flat keys (`colors=…`, not `color.colors=…`); copy it, open in a fresh tab, confirm the identical image.
- Switch Color → **Dusk**; confirm the indigo→magenta→amber gradient renders.

- [ ] **Step 3: Update docs**

- `README.md`: ensure the feature description matches (share links are now full snapshots; default look is Silk/Mariners). Adjust any line that claims short/omit-default URLs.
- `CLAUDE.md` "Gotchas learned": add a one-line note that the URL codec is now full-snapshot with flat leaf-name keys and per-field graceful decode (so default changes no longer rot links; a colliding leaf name is a build break via `urlKeys.test.ts`).

- [ ] **Step 4: Commit docs**

```bash
git add README.md CLAUDE.md
git commit -m "docs: full-snapshot share links + Silk/Mariners default"
```

---

## Task 8: Code review (required phase)

- [ ] **Step 1: Dispatch the `diversion-reviewer` subagent** against the branch diff (no implementation bias). Focus: the codec keystone change (round-trip integrity, per-field degradation correctness, flat-naming collision handling), the 5 UX invariants, schema-as-single-source-of-truth.
- [ ] **Step 2: Triage findings.** Mechanism fixes apply directly; any numeric/tuning change is surfaced to the user (gameplay-tuning rule). Re-run `npx vitest run` after fixes.
- [ ] **Step 3:** Hand off to user-verify before FF-merge.

---

## Self-review notes

- **Spec coverage:** #4 → Tasks 1–3 (full-snapshot, flat names, legacy fallback, per-field degradation, uniqueness guard, arrays-as-comma kept, no version marker). #38 → Tasks 4–5 (Silk retune, Mariners normal, defaults resolve to named pair). Blend default + help → Tasks 5–6. #40 Dusk → Task 4. Verify/docs/review → Tasks 7–8. No gaps.
- **Placeholders:** none — every code step shows full content; Dusk stops are concrete.
- **Type consistency:** `buildUrlKeyMap`/`leafNodes`/`leafNameCollisions`/`encodeConfig`/`decodeConfig` signatures consistent across Tasks 1–3; preset field names (`flow`, `blend`, `color.mode`, `color.stops`) match `presets.ts` and the schema; `matchPresets(groups, config)` matches `framework/presets.ts`.
