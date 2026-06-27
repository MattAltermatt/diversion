# Flow Field Trails, Lifespan & White-out Tame — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote Flow Field's hardcoded trail-fade and particle-lifespan to user sliders, and flip the default blend to `screen`, so the piece no longer clips to white out of the box (#22, #27).

**Architecture:** Two new top-level number fields in the Zod schema (`trailLength`, `lifespan`) plus a default-blend flip; `flowField.ts` gains pure helpers `trailFadeAlpha`/`toHex2` for the per-frame fade alpha and `lifeBounds`/`randomLife(lifespan)` derived from the lifespan slider (preserving today's ⅓ min/max ratio). No new control type — `slider`/`toggle` already exist.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4, Vitest. Custom SchemaForm + URL codec (numbers already supported).

## Global Constraints

- **Stack/deps:** no new deps. One Zod schema is the single source of truth (form + URL codec + Config type); `.meta({...})` chains after `.default(...)`.
- **UX invariants (MUST):** readability; hide nothing (every control visible & live — `trailLength` stays visible even when inert); persistent inline help; sliders only when bounds defined; high contrast.
- **WIP diversion:** Flow Field unreleased — schema may change freely; no backward-compat for URLs.
- **Default look preserved:** `trailLength:88` ≈ old `'22'` fade; `lifespan:4` ⇒ old `MIN_LIFE 1333`/`MAX_LIFE 4000`. Only the blend default intentionally changes (`lighter`→`screen`).
- **Git identity:** `MattAltermatt <1435066+MattAltermatt@users.noreply.github.com>`. Commit messages terse, one line, **no trailers**.
- **Verify:** `npx vitest run`, `npx tsc --noEmit`, `npm run build`.

---

### Task 1: Schema fields + fade/lifespan mechanism

Adds the two sliders, flips the blend default, and rewires `flowField.ts` to use them via pure helpers. TDD: helper tests first.

**Files:**
- Modify: `src/diversions/flow-field/schema.ts` (blend default; add `trailLength`, `lifespan`)
- Modify: `src/diversions/flow-field/flowField.ts` (helpers; fade fill; lifespan-derived life)
- Modify: `src/diversions/flow-field/flowField.test.ts` (add helper + lifespan + default-blend tests)

**Interfaces:**
- Produces (exported from `flowField.ts`): `trailFadeAlpha(trailLength: number) => number`; `toHex2(alpha: number) => string`. Internal (not exported): `lifeBounds(lifespanSeconds) => {min,max}`, `randomLife(rng, lifespanSeconds) => number`.
- Consumes: `FlowFieldConfig.trailLength: number`, `FlowFieldConfig.lifespan: number`, `FlowFieldConfig.blend` (default now `'screen'`).

- [ ] **Step 1: Write the failing tests**

Append to `src/diversions/flow-field/flowField.test.ts` (after the existing `hexToRgba` describe), and add the new imports at the top. Replace the import line `import { createFlowState, hexToRgba } from './flowField'` with:

```ts
import { createFlowState, hexToRgba, trailFadeAlpha, toHex2 } from './flowField'
```

Then append these describes:

```ts
describe('trailFadeAlpha', () => {
  it('maps 0 -> full wipe (1.0) and 100 -> the floor (0.02)', () => {
    expect(trailFadeAlpha(0)).toBe(1)
    expect(trailFadeAlpha(100)).toBeCloseTo(0.02, 5)
  })
  it('matches the legacy ~0.13 fade near the default (88)', () => {
    expect(trailFadeAlpha(88)).toBeCloseTo(0.1376, 3)
  })
  it('is monotonically decreasing in trail length', () => {
    expect(trailFadeAlpha(20)).toBeGreaterThan(trailFadeAlpha(80))
  })
})

describe('toHex2', () => {
  it('converts a 0..1 alpha to a 2-digit hex byte', () => {
    expect(toHex2(1)).toBe('ff')
    expect(toHex2(0)).toBe('00')
    expect(toHex2(0.1376)).toBe('23') // round(0.1376*255)=35=0x23
  })
})

describe('lifespan-derived particle life', () => {
  it('keeps every particle life within [lifespan/3, lifespan] seconds (default 4s)', () => {
    const cfg = flowFieldSchema.parse({})
    const s = createFlowState({ ...cfg, particles: 300 }, 800, 600)
    for (const p of s.particles) {
      expect(p.life).toBeGreaterThanOrEqual(1333) // 4000/3
      expect(p.life).toBeLessThanOrEqual(4000)
    }
  })
  it('scales the bounds with the lifespan slider (12s -> [4000, 12000])', () => {
    const cfg = flowFieldSchema.parse({})
    const s = createFlowState({ ...cfg, particles: 300, lifespan: 12 }, 800, 600)
    for (const p of s.particles) {
      expect(p.life).toBeGreaterThanOrEqual(4000)
      expect(p.life).toBeLessThanOrEqual(12000)
    }
  })
})

describe('schema defaults', () => {
  it('defaults blend to screen (out-of-box white-out tame)', () => {
    expect(flowFieldSchema.parse({}).blend).toBe('screen')
  })
  it('defaults trailLength to 88 and lifespan to 4', () => {
    const cfg = flowFieldSchema.parse({})
    expect(cfg.trailLength).toBe(88)
    expect(cfg.lifespan).toBe(4)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/diversions/flow-field/flowField.test.ts`
Expected: FAIL — `trailFadeAlpha`/`toHex2` not exported; `cfg.trailLength`/`cfg.lifespan` undefined; blend default is `'lighter'`.

- [ ] **Step 3: Update the schema**

In `src/diversions/flow-field/schema.ts`:

Change the `blend` default (line 14) from `'lighter'` to `'screen'`:

```ts
  blend: z.enum(['lighter', 'screen', 'normal']).default('screen')
    .meta({ ui: 'segmented', options: ['lighter', 'screen', 'normal'], label: 'Blend' }),
```

Add `lifespan` immediately after the `speed` field (after line 10):

```ts
  lifespan: z.number().min(0.5).max(12).default(4)
    .meta({ ui: 'slider', min: 0.5, max: 12, step: 0.1, label: 'Particle lifespan',
            help: 'Seconds a particle lives before respawning elsewhere. Shorter = busier, '
                + 'fewer long streaks; longer = sparser, longer ribbons.' }),
```

Add `trailLength` immediately after the `fadeTrails` field (after line 18):

```ts
  trailLength: z.number().min(0).max(100).default(88)
    .meta({ ui: 'slider', min: 0, max: 100, step: 1, label: 'Trail length',
            help: 'Length of the fading motion trails. 0 wipes each frame; higher leaves '
                + 'longer, slower-fading ribbons. Only affects the look when Motion Trails is on.' }),
```

- [ ] **Step 4: Add helpers + rewire `flowField.ts`**

In `src/diversions/flow-field/flowField.ts`:

Add the two exported helpers after `hexToRgba` (after line 19):

```ts
const TRAIL_FADE_FLOOR = 0.02
/** trailLength 0..100 -> per-frame fade alpha 1.0..0.02 (higher length = longer trail). */
export function trailFadeAlpha(trailLength: number): number {
  const a = 1 - (trailLength / 100) * (1 - TRAIL_FADE_FLOOR)
  return Math.min(1, Math.max(TRAIL_FADE_FLOOR, a))
}
/** 0..1 alpha -> two-digit hex byte for hex-append (e.g. 0.1376 -> "23"). */
export function toHex2(alpha: number): string {
  return Math.round(alpha * 255).toString(16).padStart(2, '0')
}
```

Replace the `MIN_LIFE`/`MAX_LIFE` block and `randomLife` (lines 31-41) with lifespan-derived bounds:

```ts
// Particle lifespans are derived from the `lifespan` slider (seconds -> ms) so
// behavior is identical at any fps. The fixed ⅓ min/max ratio preserves the
// staggered respawns (anti-pulse) and keeps the field populated — without
// respawning, every particle drifts onto the dominant attractor and the rest
// empties out. The schema floor (0.5s) keeps the field from degenerating.
const LIFE_MIN_RATIO = 1 / 3
function lifeBounds(lifespanSeconds: number): { min: number; max: number } {
  const max = lifespanSeconds * 1000
  return { min: max * LIFE_MIN_RATIO, max }
}
function randomLife(rng: () => number, lifespanSeconds: number): number {
  const { min, max } = lifeBounds(lifespanSeconds)
  return min + rng() * (max - min)
}
```

In `createFlowState`, update the particle init (lines 50-56) to use lifespan-derived values — `age` stagger uses `lifeBounds(cfg.lifespan).max`, `life` uses `randomLife(rng, cfg.lifespan)`:

```ts
  const styles = cfg.palette.colors.map(hexToRgba)
  const n = cfg.palette.colors.length
  const maxLife = lifeBounds(cfg.lifespan).max
  const particles: Particle[] = Array.from({ length: cfg.particles }, () => ({
    x: rng() * w,
    y: rng() * h,
    age: rng() * maxLife, // stagger initial ages so respawns don't pulse
    life: randomLife(rng, cfg.lifespan),
    ci: Math.floor(rng() * n), // pick a palette color for this particle's life
  }))
```

In `stepFlow`, replace the fade fill (lines 62-65) so it uses the trail-length slider:

```ts
  // fade the canvas for trails (alpha from the Trail length slider), or hard-clear
  ctx.globalCompositeOperation = 'source-over'
  const fadeAlpha = cfg.fadeTrails ? trailFadeAlpha(cfg.trailLength) : 1
  ctx.fillStyle = `${cfg.palette.background}${toHex2(fadeAlpha)}`
  ctx.fillRect(0, 0, w, h)
```

In the respawn branch of `stepFlow` (line 79), update the life reassignment to pass lifespan:

```ts
      p.life = randomLife(rng, cfg.lifespan)
```

- [ ] **Step 5: Run tests + types + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: PASS — all tests green (including the existing determinism tests, which still hold since the RNG call order per particle is unchanged: x, y, age, life, ci), tsc exits 0 (a pre-existing `ZodTypeAny` deprecation *warning* in fieldMeta.ts/SchemaForm.tsx is expected and is NOT an error — ignore it), build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/diversions/flow-field/schema.ts src/diversions/flow-field/flowField.ts src/diversions/flow-field/flowField.test.ts
git commit -m "Flow Field: trail-length + lifespan sliders, default blend screen (#22, #27)"
```

---

### Task 2: Chrome verification (manual)

A verification gate, not a code task. Confirm the controls and the white-out tame in Chrome (project convention; chrome-devtools MCP, never a built-in preview). The dev server is pinned to port 5180.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open Flow Field config in Chrome**

URL: `http://localhost:5180/d/flow-field?mute=1`

- [ ] **Step 3: Verify defaults (the #27 win)**
  - Blend segmented shows **`screen`** selected by default.
  - The animation does **not** clip to white on the dominant streamlines (the out-of-box look is colored, not blown out).
  - Two new sliders present with help: **Particle lifespan** (default 4.0) after Speed, **Trail length** (default 88) after Motion trails.

- [ ] **Step 4: Verify the controls**
  - Drag **Trail length** to 0 → trails vanish (each frame wiped). Drag toward 100 → long, slowly-fading ribbons.
  - Toggle **Motion trails** off → hard clear regardless of Trail length; on → Trail length takes effect again.
  - Drag **Particle lifespan** short (~0.5s) → busier, twinklier field; long (~12s) → sparser, longer streaks. Field never collapses to a single line.
  - Flip **Blend** to `lighter` → confirm the trail-length + lifespan sliders can still tame accumulation (shorter trails / shorter life reduce the white-out).

- [ ] **Step 5: Verify the share link**
  - Change the sliders + blend, copy the URL, open in a fresh tab — the same look loads (codec round-trip).

## Self-Review

**Spec coverage:**
- `blend` default → `screen` → Task 1 Step 3 + test. ✅
- `trailLength` slider (0–100, default 88, always visible, help) → Task 1 Step 3. ✅
- `lifespan` slider (0.5–12s, default 4, help) → Task 1 Step 3. ✅
- `trailFadeAlpha` (floor 0.02, 0→1, 88≈0.1376) + `toHex2` → Task 1 Step 4 + tests. ✅
- Fade fill uses slider; `fadeTrails` off → opaque clear → Task 1 Step 4 + Chrome Step 4. ✅
- Lifespan-derived `MIN/MAX` with ⅓ ratio, constants removed → Task 1 Step 4 + tests. ✅
- Determinism preserved (RNG order unchanged) → noted Task 1 Step 5; existing tests. ✅
- UX invariants (visible/live inert slider, help, bounded sliders) → schema meta + Chrome verify. ✅
- No per-pixel cap (deferred) → out of scope, nothing to implement. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✅

**Type consistency:** `trailFadeAlpha`/`toHex2` signatures match their test calls and the `stepFlow` usage; `lifeBounds`/`randomLife(rng, lifespan)` are used consistently in `createFlowState` and the respawn branch; schema field names `trailLength`/`lifespan` match `cfg.trailLength`/`cfg.lifespan`. ✅
