# Particle Life Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auto-restart-on-stall, a copy-link-with-seed button, and an old-school Mariners default palette to the Particle Life diversion (#191), via one small reusable framework seam.

**Architecture:** Mariners is a discrete OKLCH anchor-ramp added alongside the existing hue-sweep palettes. Auto-restart is a pure stall-detector (`restart.ts`) exposed through a new optional `Diversion.shouldRestart?()` hook that the framework's `AnimationHost` polls per frame — on true it reseeds (fresh `randomizeOnFreshLoad` values + re-`setup`) and reports the new live config up via `onLiveConfigChange`. Copy-link-with-seed reads that live config and encodes it with a new `encodeConfig({ includePinned })` option.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4, Vitest + @testing-library/react, custom SchemaForm + URL codec, canvas 2D.

## Global Constraints

- **Preserve exact worlds:** ZERO changes to `sim.ts`, `grid.ts`, `force.ts`, `matrix.ts`, `render.ts`. Any float-math reordering there re-rolls every seed's world (out of scope; see spec §0).
- **Tests:** Vitest, co-located `*.test.ts(x)` next to sources. Run with `npx vitest run <path>`; full suite `npm test`.
- **Dev server:** pinned to port **5180** (`npm run dev`). Verify in Chrome (chrome-devtools MCP), never a built-in preview.
- **Zod 4:** `.meta({...})` chains after `.default(...)`; grouped fields unwrap via `.unwrap()`.
- **Git identity:** `MattAltermatt <1435066+MattAltermatt@users.noreply.github.com>`. Branch `feature/particle-life-polish` (already created).
- **Commit messages:** terse one-line subject, no trailers, no `Co-Authored-By`.
- **Work is on `feature/particle-life-polish`**; spec at `docs/superpowers/specs/2026-06-30-particle-life-polish-design.md`.

---

### Task 1: Mariners palette (anchor-ramp support + new default)

**Files:**
- Modify: `src/diversions/particle-life/palette.ts`
- Modify: `src/diversions/particle-life/palette.test.ts`
- Modify: `src/diversions/particle-life/schema.ts` (default palette)
- Modify: `src/diversions/particle-life/presets.ts` (Mariners Look preset)
- Test: run `schema.test.ts` too — fix any assertion of the old `'Spectrum'` default.

**Interfaces:**
- Consumes: `oklchToHex(L, C, H): string` (existing, `./oklch`).
- Produces: `PALETTE_NAMES` now includes `'Mariners'` (first); `paletteColors('Mariners', n)` returns `n` distinct hexes.

- [ ] **Step 1: Write failing palette tests**

Add to `src/diversions/particle-life/palette.test.ts`:

```ts
import { paletteColors, PALETTE_NAMES } from './palette'
import { oklchToHex } from './oklch'

test('Mariners is the first palette name', () => {
  expect(PALETTE_NAMES[0]).toBe('Mariners')
})

test('Mariners 6 species = the six anchors exactly', () => {
  const cols = paletteColors('Mariners', 6)
  expect(cols).toEqual([
    oklchToHex(0.40, 0.11, 258),
    oklchToHex(0.55, 0.15, 256),
    oklchToHex(0.78, 0.09, 240),
    oklchToHex(0.90, 0.015, 250),
    oklchToHex(0.88, 0.06, 92),
    oklchToHex(0.80, 0.145, 85),
  ])
})

test('Mariners yields the requested count of valid, distinct hexes', () => {
  for (const n of [3, 6, 8]) {
    const cols = paletteColors('Mariners', n)
    expect(cols).toHaveLength(n)
    for (const c of cols) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    expect(new Set(cols).size).toBe(n) // all distinct
  }
})
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/diversions/particle-life/palette.test.ts`
Expected: FAIL (`'Mariners'` not in `PALETTE_NAMES`).

- [ ] **Step 3: Implement anchor-ramp support in `palette.ts`**

Replace the `PaletteName`/`PALETTE_NAMES`/`PaletteSpec`/`SPECS`/`paletteColors` block with:

```ts
export type PaletteName = 'Mariners' | 'Spectrum' | 'Neon' | 'Pastel' | 'Ice' | 'Fire'

export const PALETTE_NAMES: PaletteName[] = ['Mariners', 'Spectrum', 'Neon', 'Pastel', 'Ice', 'Fire']

type SweepSpec = { kind: 'sweep'; lo: number; hi: number; L: number; C: number }
type AnchorSpec = { kind: 'anchors'; stops: Array<[L: number, C: number, H: number]> }
type PaletteSpec = SweepSpec | AnchorSpec

// OKLCH hue landmarks: red≈29 · orange≈70 · yellow≈110 · green≈145 · cyan≈195 ·
// blue≈264 · purple≈310 · magenta≈350.
const SPECS: Record<PaletteName, PaletteSpec> = {
  // Old-school Mariners (1977–86 trident era): royal blue → gold. Ordered dark-blue
  // → light-neutral → gold so interpolation for non-6 counts passes through low
  // chroma (silver), never through off-brand green.
  Mariners: { kind: 'anchors', stops: [
    [0.40, 0.11, 258],  // navy
    [0.55, 0.15, 256],  // royal blue
    [0.78, 0.09, 240],  // sky / powder blue
    [0.90, 0.015, 250], // silver (kept off pure white so additive glow doesn't blow out)
    [0.88, 0.06, 92],   // cream / pale gold
    [0.80, 0.145, 85],  // Mariners gold
  ] },
  Spectrum: { kind: 'sweep', lo: 0, hi: 360, L: 0.72, C: 0.15 },
  Neon: { kind: 'sweep', lo: 0, hi: 360, L: 0.80, C: 0.21 },
  Pastel: { kind: 'sweep', lo: 0, hi: 360, L: 0.82, C: 0.07 },
  Ice: { kind: 'sweep', lo: 200, hi: 285, L: 0.75, C: 0.13 },
  Fire: { kind: 'sweep', lo: 25, hi: 100, L: 0.70, C: 0.15 },
}

/** Shortest-path hue interpolation (degrees), so a ramp never takes the long way round. */
function lerpHue(a: number, b: number, t: number): number {
  const d = (((b - a) % 360) + 540) % 360 - 180
  return a + d * t
}

/** Sample `count` colors evenly along the piecewise-linear OKLCH ramp. For count=1,
 *  the first stop; otherwise `t=i/(count-1)` mapped across the segments. */
function anchorColors(stops: Array<[number, number, number]>, count: number): string[] {
  if (count === 1) return [oklchToHex(stops[0][0], stops[0][1], stops[0][2])]
  const segs = stops.length - 1
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const p = (i / (count - 1)) * segs
    const lo = Math.min(Math.floor(p), segs - 1)
    const f = p - lo
    const [l0, c0, h0] = stops[lo]
    const [l1, c1, h1] = stops[lo + 1]
    out.push(oklchToHex(l0 + (l1 - l0) * f, c0 + (c1 - c0) * f, lerpHue(h0, h1, f)))
  }
  return out
}

/** `n` distinct hex colors for the named palette. Falls back to Spectrum. */
export function paletteColors(name: PaletteName, n: number): string[] {
  const spec = SPECS[name] ?? SPECS.Spectrum
  const count = Math.max(1, n)
  if (spec.kind === 'anchors') return anchorColors(spec.stops, count)
  const span = spec.hi - spec.lo
  const out: string[] = []
  for (let i = 0; i < count; i++) out.push(oklchToHex(spec.L, spec.C, spec.lo + (span * i) / count))
  return out
}
```

- [ ] **Step 4: Change the default palette in `schema.ts`**

`src/diversions/particle-life/schema.ts` — the `palette` field: change `.default('Spectrum')` to `.default('Mariners')`. Leave the `.meta({ options: [...PALETTE_NAMES], ... })` as-is (it now includes Mariners automatically).

- [ ] **Step 5: Add the Mariners Look preset (first) in `presets.ts`**

In `src/diversions/particle-life/presets.ts`, prepend to the `Look` group's `options` array:

```ts
{ name: 'Mariners', patch: { palette: 'Mariners', background: '#05070d', trailFade: 0.15, glow: true, dotSize: 2.5 } },
```

(Patch equals the schema defaults for those fields → a fresh load shows Look = Mariners via `matchPresets`.)

- [ ] **Step 6: Run tests, verify pass + fix any default-assertion fallout**

Run: `npx vitest run src/diversions/particle-life/`
Expected: PASS. If `schema.test.ts` asserts the palette default is `'Spectrum'`, update it to `'Mariners'`.

- [ ] **Step 7: Consult color-expert for final hex accuracy (optional refinement)**

Invoke the `color-expert` skill to sanity-check the six anchors against authentic 1977–86 Mariners royal-blue/gold and sRGB gamut; adjust the `stops` L/C/H if it flags a muddy or out-of-gamut color. Re-run Step 6. (If skipped, the starting anchors ship.)

- [ ] **Step 8: Commit**

```bash
git add src/diversions/particle-life/palette.ts src/diversions/particle-life/palette.test.ts src/diversions/particle-life/schema.ts src/diversions/particle-life/presets.ts src/diversions/particle-life/schema.test.ts
git commit -m "feat(particle-life): Mariners anchor-ramp palette as new default"
```

---

### Task 2: Stall detector (pure logic)

**Files:**
- Create: `src/diversions/particle-life/restart.ts`
- Test: `src/diversions/particle-life/restart.test.ts`

**Interfaces:**
- Produces: `createStallState(): StallState`; `meanSpeed2(vx, vy, n): number`; `tickStall(state: StallState, dtMs: number, speed2: number): boolean`; constants `MIN_AGE_MS`, `STILL_MS`, `FROZEN_SPEED2`.

- [ ] **Step 1: Write failing tests**

Create `src/diversions/particle-life/restart.test.ts`:

```ts
import { createStallState, meanSpeed2, tickStall, MIN_AGE_MS, STILL_MS, FROZEN_SPEED2 } from './restart'

test('meanSpeed2 averages vx^2+vy^2 over n', () => {
  const vx = new Float32Array([3, 0]), vy = new Float32Array([4, 0])
  expect(meanSpeed2(vx, vy, 2)).toBe((25 + 0) / 2) // (3^2+4^2)=25
})

test('never reseeds during the min-age window even if frozen', () => {
  const s = createStallState()
  let fired = false
  for (let t = 0; t < MIN_AGE_MS; t += 100) fired ||= tickStall(s, 100, 0)
  expect(fired).toBe(false)
  expect(s.stillMs).toBe(0)
})

test('reseeds after sustained stillness past min-age', () => {
  const s = createStallState()
  // advance past min-age while moving fast (not still)
  while (s.ageMs < MIN_AGE_MS) tickStall(s, 100, FROZEN_SPEED2 + 100)
  // now hold still for just under STILL_MS → no reseed yet
  let fired = false
  for (let acc = 0; acc < STILL_MS - 100; acc += 100) fired ||= tickStall(s, 100, 0)
  expect(fired).toBe(false)
  // one more still tick crosses the threshold
  expect(tickStall(s, 200, 0)).toBe(true)
})

test('motion resets the stillness clock', () => {
  const s = createStallState()
  while (s.ageMs < MIN_AGE_MS) tickStall(s, 100, 999)
  tickStall(s, 1000, 0)          // accumulate some stillness
  expect(s.stillMs).toBe(1000)
  tickStall(s, 100, FROZEN_SPEED2 + 1) // moving again
  expect(s.stillMs).toBe(0)
})
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npx vitest run src/diversions/particle-life/restart.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `restart.ts`**

```ts
// restart.ts — pure stall detector for auto-restart. The diversion owns the policy
// (when a world is "dead"); the framework owns the reseed lifecycle. No allocation
// in tickStall; safe to call every frame.
export const MIN_AGE_MS = 20_000  // let a fresh world organize before judging it
export const STILL_MS = 4_000     // sustained stillness before a reseed
export const FROZEN_SPEED2 = 4    // (world-units/sec)^2; mean speed < 2 u/s = stopped

export interface StallState {
  ageMs: number
  stillMs: number
}

export function createStallState(): StallState {
  return { ageMs: 0, stillMs: 0 }
}

/** Mean of vx^2+vy^2 over the first n particles (0 when n<=0). */
export function meanSpeed2(vx: Float32Array, vy: Float32Array, n: number): number {
  if (n <= 0) return 0
  let s = 0
  for (let i = 0; i < n; i++) s += vx[i] * vx[i] + vy[i] * vy[i]
  return s / n
}

/** Advance the stall clock by dtMs at the current mean speed^2. Returns true when
 *  the world has been below FROZEN_SPEED2 for STILL_MS straight, past the min-age. */
export function tickStall(state: StallState, dtMs: number, speed2: number): boolean {
  state.ageMs += dtMs
  if (state.ageMs < MIN_AGE_MS) {
    state.stillMs = 0
    return false
  }
  state.stillMs = speed2 < FROZEN_SPEED2 ? state.stillMs + dtMs : 0
  return state.stillMs >= STILL_MS
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/diversions/particle-life/restart.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/particle-life/restart.ts src/diversions/particle-life/restart.test.ts
git commit -m "feat(particle-life): pure stall detector for auto-restart"
```

---

### Task 3: Framework restart seam + wire Particle Life

**Files:**
- Modify: `src/framework/types.ts` (add `shouldRestart?`)
- Modify: `src/framework/AnimationHost.tsx` (reseed lifecycle + `onLiveConfigChange`)
- Modify: `src/framework/AnimationHost.test.tsx`
- Modify: `src/diversions/particle-life/index.ts` (implement `shouldRestart`, add stall state)

**Interfaces:**
- Consumes: `applyFreshLoadRandomization(schema, config, params, rand?)` (existing, `./urlCodec`); `createStallState`, `meanSpeed2`, `tickStall` (Task 2).
- Produces: `Diversion.shouldRestart?(state, t, dt): boolean`; `AnimationHost` prop `onLiveConfigChange?(config: unknown): void`.

- [ ] **Step 1: Add the hook to the `Diversion` interface**

`src/framework/types.ts` — inside `interface Diversion`, after `teardown?`:

```ts
  /** Polled once per rendered frame (after frame()). Return true to ask the
   *  framework to reseed: roll fresh randomizeOnFreshLoad fields + re-run setup().
   *  Diversion-specific staleness policy; framework owns the reseed lifecycle.
   *  Omit → never auto-restarts. */
  shouldRestart?(state: State, t: number, dt: number): boolean
```

- [ ] **Step 2: Write the failing AnimationHost test**

Add to `src/framework/AnimationHost.test.tsx` (follow the file's existing canvas/rAF setup; construct a minimal 2D diversion with a `randomizeOnFreshLoad` seed):

```ts
import { z } from 'zod'
import { defineDiversion } from './types'

test('shouldRestart reseeds and reports a new live config', async () => {
  const schema = z.object({
    seed: z.number().int().default(1).meta({ randomizeOnFreshLoad: true }),
  })
  let setups = 0
  let restartOnce = true
  const seen: number[] = []
  const div = defineDiversion({
    id: 'fake', title: 'F', description: '', kind: '2d', schema,
    setup: (_ctx, cfg: { seed: number }) => { setups++; return { seed: cfg.seed } },
    frame: () => {},
    shouldRestart: () => { const go = restartOnce; restartOnce = false; return go },
  })
  const onLive = (c: unknown) => seen.push((c as { seed: number }).seed)

  render(<AnimationHost diversion={div as never} config={{ seed: 1 }} onLiveConfigChange={onLive} />)

  // let the loop tick at least once so shouldRestart fires the reseed
  await waitFor(() => expect(setups).toBeGreaterThanOrEqual(2))
  // initial report (seed 1) + post-reseed report with a different seed
  expect(seen[0]).toBe(1)
  expect(seen.at(-1)).not.toBe(1)
})
```

- [ ] **Step 3: Run test, verify fail**

Run: `npx vitest run src/framework/AnimationHost.test.tsx -t 'shouldRestart reseeds'`
Expected: FAIL (`onLiveConfigChange` not a prop; no reseed).

- [ ] **Step 4: Implement the seam in `AnimationHost.tsx`**

1. Add the import at the top:

```ts
import { applyFreshLoadRandomization } from './urlCodec'
```

2. Add a module-level constant (below imports):

```ts
const EMPTY_PARAMS = new URLSearchParams()
```

3. Add `onLiveConfigChange` to the props destructure and type:

```ts
export function AnimationHost({
  diversion,
  config,
  fullscreenable = false,
  showChrome = true,
  onLiveConfigChange,
}: {
  diversion: Diversion
  config: unknown
  fullscreenable?: boolean
  showChrome?: boolean
  onLiveConfigChange?: (config: unknown) => void
}) {
```

4. Keep the callback fresh across the once-per-diversion effect via a ref. After the existing `const [, setSetupError] = useState<unknown>()` line add:

```ts
  const onLiveRef = useRef<typeof onLiveConfigChange>(undefined)
  onLiveRef.current = onLiveConfigChange
```

5. Report the initial config: right after `lastConfigRef.current = config` (inside the setup effect, ~line 89) add:

```ts
    onLiveRef.current?.(config)
```

6. Poll + reseed inside the loop callback. In `createLoop((t, dt) => { ... })`, immediately after `diversion.frame(run.state, ctx, t, dt)` add:

```ts
      if (diversion.shouldRestart?.(run.state, t, dt)) {
        const next = applyFreshLoadRandomization(
          diversion.schema, run_lastConfig(), EMPTY_PARAMS,
        )
        diversion.teardown?.(run.state)
        try {
          run.state = diversion.setup(ctx, next, run.size)
        } catch (e) {
          setSetupError(() => { throw e })
          return
        }
        lastConfigRef.current = next
        onLiveRef.current?.(next)
      }
```

Where `run_lastConfig()` is just `lastConfigRef.current as never` — inline it directly:

```ts
        const next = applyFreshLoadRandomization(
          diversion.schema, lastConfigRef.current as never, EMPTY_PARAMS,
        )
```

(Reseeding through `applyFreshLoadRandomization` with empty params always rolls fresh `randomizeOnFreshLoad` values — the new seed — and leaves all other fields intact.)

- [ ] **Step 5: Run test, verify pass**

Run: `npx vitest run src/framework/AnimationHost.test.tsx`
Expected: PASS (all cases).

- [ ] **Step 6: Wire `shouldRestart` into Particle Life `index.ts`**

1. Add the import:

```ts
import { createStallState, meanSpeed2, tickStall, type StallState } from './restart'
```

2. Add `stall` to the `State` interface:

```ts
interface State {
  sim: Sim
  sprites: GlowSprites
  cfg: ParticleLifeConfig
  size: Size
  acc: number
  stall: StallState
}
```

3. Initialize it in `setup`'s return:

```ts
  setup(_ctx, cfg, size): State {
    return { sim: createSim(toSimConfig(cfg)), sprites: makeSprites(cfg), cfg, size, acc: 0, stall: createStallState() }
  },
```

4. Add the hook (after `frame`, before `resize`):

```ts
  shouldRestart(state, _t, dt): boolean {
    const s2 = meanSpeed2(state.sim.vx, state.sim.vy, state.sim.n)
    return tickStall(state.stall, dt, s2)
  },
```

- [ ] **Step 7: Run the particle-life + framework suites**

Run: `npx vitest run src/framework/ src/diversions/particle-life/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/framework/types.ts src/framework/AnimationHost.tsx src/framework/AnimationHost.test.tsx src/diversions/particle-life/index.ts
git commit -m "feat: framework shouldRestart seam + Particle Life auto-restart on stall"
```

---

### Task 4: Pinned URL encode (`includePinned`)

**Files:**
- Modify: `src/framework/urlCodec.ts` (`encodeConfig` gains opts)
- Modify: `src/framework/urlCodec.test.ts`

**Interfaces:**
- Produces: `encodeConfig(schema, value, opts?: { includePinned?: boolean }): URLSearchParams` — `includePinned: true` emits the `randomizeOnFreshLoad` fields (seed) too; default omits them (unchanged).

- [ ] **Step 1: Write the failing test**

Add to `src/framework/urlCodec.test.ts` (reuse or mirror an existing schema with a `randomizeOnFreshLoad` seed field; if none, define one inline as in Task 3 Step 2):

```ts
test('encodeConfig includePinned emits the seed; default omits it; round-trips', () => {
  const schema = z.object({
    seed: z.number().int().default(1).meta({ randomizeOnFreshLoad: true }),
    dotSize: z.number().default(2.5),
  })
  const cfg = { seed: 4242, dotSize: 2.5 }

  const plain = encodeConfig(schema, cfg)
  expect(plain.has('seed')).toBe(false)

  const pinned = encodeConfig(schema, cfg, { includePinned: true })
  expect(pinned.get('seed')).toBe('4242')

  // a pinned link reproduces the exact seed on decode
  expect(decodeConfig(schema, pinned).seed).toBe(4242)
})
```

- [ ] **Step 2: Run test, verify fail**

Run: `npx vitest run src/framework/urlCodec.test.ts -t 'includePinned'`
Expected: FAIL (`includePinned` ignored — seed omitted).

- [ ] **Step 3: Implement the opts arg**

In `src/framework/urlCodec.ts`, change `encodeConfig`:

```ts
export function encodeConfig<T extends ZodObject<any>>(
  schema: T,
  value: ReturnType<T['parse']>,
  opts: { includePinned?: boolean } = {},
): URLSearchParams {
  const flatVal = flatten(value as Json)
  const { encode } = buildUrlKeyMap(schema)
  const skip = opts.includePinned ? new Set<string>() : freshLoadKeys(schema)
  const sp = new URLSearchParams()
  for (const [path, v] of Object.entries(flatVal)) {
    const key = encode.get(path) ?? path
    if (skip.has(key)) continue // pin-only field (seed) — omitted unless includePinned
    sp.set(key, v)
  }
  return sp
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run src/framework/urlCodec.test.ts`
Expected: PASS (new case + all existing codec tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/framework/urlCodec.ts src/framework/urlCodec.test.ts
git commit -m "feat(codec): encodeConfig includePinned option for seed-pinned links"
```

---

### Task 5: Copy-link-with-seed UI

**Files:**
- Modify: `src/framework/CopyLinkButton.tsx` (label props)
- Modify: `src/framework/CopyLinkButton.test.tsx`
- Modify: `src/routes/PlayScreen.tsx` (live config + pinned button)
- Modify: `src/routes/PlayScreen.test.tsx`

**Interfaces:**
- Consumes: `encodeConfig(..., { includePinned: true })` (Task 4); `AnimationHost` `onLiveConfigChange` (Task 3).
- Produces: two copy buttons on the play screen — seedless `🔗 Copy link` (unchanged) and pinned `📌 Copy this world`.

- [ ] **Step 1: Write failing CopyLinkButton label test**

Add to `src/framework/CopyLinkButton.test.tsx`:

```ts
test('renders custom label', () => {
  render(<CopyLinkButton href="/x" label="📌 Copy this world" copiedLabel="✓ World copied" />)
  expect(screen.getByRole('button')).toHaveTextContent('📌 Copy this world')
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/framework/CopyLinkButton.test.tsx -t 'custom label'`
Expected: FAIL (button shows the hard-coded `🔗 Copy link`).

- [ ] **Step 3: Parametrize the label in `CopyLinkButton.tsx`**

```ts
export function CopyLinkButton({
  href,
  className,
  label = '🔗 Copy link',
  copiedLabel = '✓ Copied',
}: { href: string; className?: string; label?: string; copiedLabel?: string }) {
```

And the button body:

```tsx
      {copied ? copiedLabel : label}
```

- [ ] **Step 4: Write the failing PlayScreen test**

Add to `src/routes/PlayScreen.test.tsx`. Mock `AnimationHost` so it synchronously reports a live config (avoids needing a real canvas):

```ts
vi.mock('../framework/AnimationHost', () => ({
  AnimationHost: ({ onLiveConfigChange }: { onLiveConfigChange?: (c: unknown) => void }) => {
    onLiveConfigChange?.({ seed: 8231, dotSize: 2.5, palette: 'Mariners' })
    return <div data-testid="host" />
  },
}))

test('renders a pinned "copy this world" link carrying the seed', async () => {
  // render PlayScreen at a particle-life play route (mirror the file's existing
  // router setup / renderPlay helper)
  renderPlayScreen('particle-life')
  const pinned = await screen.findByText('📌 Copy this world')
  expect(pinned).toBeInTheDocument()
})
```

(If `PlayScreen.test.tsx` has no helper, wrap in `<MemoryRouter initialEntries={['/d/particle-life/play']}>` with the same `<Routes>` the file already uses.)

- [ ] **Step 5: Run, verify fail**

Run: `npx vitest run src/routes/PlayScreen.test.tsx -t 'copy this world'`
Expected: FAIL (only one copy button today).

- [ ] **Step 6: Implement live config + pinned button in `PlayScreen.tsx`**

1. Add imports:

```ts
import { useState } from 'react'
import { encodeConfig } from '../framework/urlCodec'
```

(merge `useState` into the existing `react` import line).

2. Add live-config state inside the component (after `config` is computed):

```ts
  const [liveConfig, setLiveConfig] = useState<unknown>(config)
```

3. Pass the reporter to `AnimationHost`:

```tsx
        <AnimationHost
          diversion={diversion}
          config={config}
          fullscreenable
          onLiveConfigChange={setLiveConfig}
        />
```

4. Build the pinned query string and render the second button in `.play-chrome`, next to the existing one:

```tsx
        <CopyLinkButton href={`/d/${diversion.id}/play${qs}`} className="play-copy" />
        <CopyLinkButton
          href={`/d/${diversion.id}/play?${encodeConfig(diversion.schema, liveConfig as never, { includePinned: true }).toString()}`}
          className="play-copy"
          label="📌 Copy this world"
          copiedLabel="✓ World copied"
        />
```

- [ ] **Step 7: Run tests, verify pass**

Run: `npx vitest run src/framework/CopyLinkButton.test.tsx src/routes/PlayScreen.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/framework/CopyLinkButton.tsx src/framework/CopyLinkButton.test.tsx src/routes/PlayScreen.tsx src/routes/PlayScreen.test.tsx
git commit -m "feat: copy-link-with-seed button on the play screen"
```

---

### Task 6: Code review (required phase)

**No code changes.** Dispatch a fresh **`diversion-reviewer`** agent (no implementation bias) against the branch diff. Brief it to check: the 5 UX invariants (esp. readability/contrast of the Mariners palette at 3/6/8 species), the schema-as-single-source-of-truth rule, the URL-codec keystone (does `includePinned` respect the seedless-by-default convention for the existing button?), and that `sim.ts`/`grid.ts`/`force.ts` are untouched (exact worlds preserved). Also dispatch **`perf-analyzer`** only if any hot-path file changed (it should not have). Address findings; re-run `npm test`.

- [ ] Dispatch `diversion-reviewer` on the diff `main..feature/particle-life-polish`.
- [ ] Triage findings; fix any real issue with a test; commit.

---

### Task 7: Full verification + Chrome + docs (inline)

**No new features.** Gate before FF-merge.

- [ ] **Step 1: Full suite + build**

Run: `npm test` then `npm run build`.
Expected: all tests PASS; build clean.

- [ ] **Step 2: Chrome verify (dev server on 5180)**

Start `npm run dev` (background). Open Chrome via chrome-devtools MCP to `http://localhost:5180/#/d/particle-life/play?mute=1` and confirm:
- Default world shows the **Mariners** blue-and-gold palette (not Spectrum).
- Two copy buttons: `🔗 Copy link` and `📌 Copy this world`. Click **📌**, read the clipboard/href back, assert it contains `seed=`. Open that pinned link in a second tab → same world reproduces.
- Auto-restart: to exercise it without a 24 s wait, temporarily lower `MIN_AGE_MS`/`STILL_MS` in `restart.ts` (or drive `forceScale` low so it freezes), confirm the world reseeds to a fresh soup, then restore the constants. Confirm a normal world (moving) does NOT reseed.

- [ ] **Step 3: Tune restart constants if needed (owner sign-off on numbers)**

If Chrome shows false reseeds or sluggish detection, the `MIN_AGE_MS`/`STILL_MS`/`FROZEN_SPEED2` values are tuning — surface the proposed change to the owner before editing (gameplay-tuning-sacrosanct). Mechanism bugs (wrong field read, hook never called) fix without asking.

- [ ] **Step 4: Docs**

Update `README.md` if it enumerates palettes or play-screen features. Mark the spec/plan done. Ensure `#191` scope matches what shipped.

- [ ] **Step 5: Hand off for user-verify before FF-merge**

Surface the live URL + what to look at; wait for explicit approval before FF-merging `feature/particle-life-polish` → `main` (squash), then delete both branch ends per housekeeping rules.

---

## Self-Review

**Spec coverage:**
- §1 auto-restart → Tasks 2 (detector) + 3 (hook/wire) + 7 (verify). ✓
- §2 framework seam → Task 3 (`shouldRestart` + `onLiveConfigChange`). ✓
- §3 copy-link-with-seed → Tasks 4 (pinned encode) + 5 (UI). ✓
- §4 Mariners palette → Task 1. ✓
- §5 tests → each task is TDD (test-first). ✓
- §0 perf-dropped / exact-worlds → Global Constraints + Task 6 review check (sim/grid/force untouched). ✓

**Placeholder scan:** no TBD/TODO; all code shown; constants concrete. ✓

**Type consistency:** `StallState`/`createStallState`/`meanSpeed2`/`tickStall` consistent across Tasks 2–3; `shouldRestart(state,t,dt)` matches `types.ts` and `index.ts`; `encodeConfig(schema,value,opts)` matches Tasks 4–5; `onLiveConfigChange(config)` matches Tasks 3 & 5. ✓
