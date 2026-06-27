# Live config preview + history sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the config preview apply visual param edits live (no particle/noise realloc per pointer-move) via a new optional `update?` diversion hook, and re-sync the form on browser back/forward — removing the unused `nuqs` dep.

**Architecture:** Add an optional `update?(state, config, size): boolean | void` to the diversion contract. `AnimationHost` splits its single effect into a `[diversion]` setup/loop effect (run held in a ref) and a `[config]` effect that calls `update` and falls back to a full re-setup when it returns falsy. Flow Field implements `update` live for everything except particle-count/seed. `ConfigScreen` keeps its edit buffer but re-decodes from the URL on history POP.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4 + react-router-dom 7. Vitest + @testing-library/react. Tests co-located `*.test.ts(x)`.

## Global Constraints

- **Tests:** Vitest, co-located `*.test.ts(x)`. Run with `npx vitest run`. Pure logic unit-tested; UI via @testing-library/react.
- **Existing diversions without `update` must keep working** — absent hook ⇒ full re-setup (today's behavior).
- **Don't touch URL codec semantics** — it's the tested keystone (flatten nested→dotted, omit defaults, `safeParse`).
- **Flow Field structural fields = `particles` and `seed` only.** Everything else is read live from `state.cfg` each frame.
- **Git identity:** `MattAltermatt <1435066+MattAltermatt@users.noreply.github.com>`. Branch `feature/live-update-hook`, FF-merge to `main` after verify.
- **Commit messages:** terse one-line subject, no trailers.

---

### Task 1: `update?` contract + Flow Field `updateFlowState`

**Files:**
- Modify: `src/framework/types.ts` (add `update?` to `Diversion<Config>`)
- Modify: `src/diversions/flow-field/flowField.ts` (add `updateFlowState`)
- Modify: `src/diversions/flow-field/index.ts` (wire `update`)
- Test: `src/diversions/flow-field/flowField.test.ts` (add cases)

**Interfaces:**
- Produces: `Diversion.update?(state: DiversionState, config: Config, size: Size): boolean | void`
- Produces: `updateFlowState(state: FlowState, cfg: FlowFieldConfig): boolean`

- [ ] **Step 1: Write the failing tests** — append to `src/diversions/flow-field/flowField.test.ts`:

```ts
import { createFlowState, updateFlowState } from './flowField'
import { flowFieldSchema } from './schema'

describe('updateFlowState', () => {
  const base = flowFieldSchema.parse({})

  it('applies a visual change live, keeping the same particle array', () => {
    const state = createFlowState(base, 800, 600)
    const particlesRef = state.particles
    const ok = updateFlowState(state, { ...base, speed: base.speed + 0.2 })
    expect(ok).toBe(true)
    expect(state.cfg.speed).toBe(base.speed + 0.2)
    expect(state.particles).toBe(particlesRef) // no realloc
  })

  it('recomputes palette styles when colors change', () => {
    const state = createFlowState(base, 800, 600)
    const nextColors = [...base.color.colors]
    nextColors[0] = '#abcdefff'
    const ok = updateFlowState(state, { ...base, color: { ...base.color, colors: nextColors } })
    expect(ok).toBe(true)
    expect(state.styles[0]).toBe('rgba(171, 205, 239, 1)')
  })

  it('requests a re-setup (false) when particle count changes', () => {
    const state = createFlowState(base, 800, 600)
    expect(updateFlowState(state, { ...base, particles: base.particles + 100 })).toBe(false)
  })

  it('requests a re-setup (false) when the seed changes', () => {
    const state = createFlowState(base, 800, 600)
    expect(updateFlowState(state, { ...base, seed: base.seed + 1 })).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/diversions/flow-field/flowField.test.ts`
Expected: FAIL — `updateFlowState` is not exported.

- [ ] **Step 3: Add `update?` to the contract** — in `src/framework/types.ts`, inside `interface Diversion<Config = unknown>`, after the `resize?` line:

```ts
  /** Apply a config change to live state without a full re-setup. Return truthy
   *  if applied live; falsy (or omit the hook) → framework re-runs setup(). */
  update?(state: DiversionState, config: Config, size: Size): boolean | void
```

- [ ] **Step 4: Implement `updateFlowState`** — in `src/diversions/flow-field/flowField.ts`, after `createFlowState`:

```ts
/** Apply a config change to a live FlowState in place. Returns false when the
 *  change is structural (particle count or seed) and needs a full re-setup;
 *  true when applied live. Every per-frame param is read live from state.cfg,
 *  so we just swap cfg and recompute the precomputed palette styles. */
export function updateFlowState(state: FlowState, cfg: FlowFieldConfig): boolean {
  if (cfg.particles !== state.cfg.particles || cfg.seed !== state.cfg.seed) return false
  state.cfg = cfg
  state.styles = cfg.color.colors.map(hexToRgba)
  return true
}
```

- [ ] **Step 5: Wire it into the diversion** — in `src/diversions/flow-field/index.ts`, import and add the method:

```ts
import { createFlowState, stepFlow, updateFlowState, type FlowState } from './flowField'
```
and add to the `flowField` object (after `resize`):
```ts
  update(state, config) {
    return updateFlowState(state as FlowState, config)
  },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/diversions/flow-field/flowField.test.ts && npx tsc --noEmit`
Expected: PASS, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/framework/types.ts src/diversions/flow-field/
git commit -m "Flow Field: updateFlowState live-apply hook + Diversion.update contract (#5)"
```

---

### Task 2: AnimationHost — setup/update effect split

**Files:**
- Modify: `src/framework/AnimationHost.tsx`
- Test: `src/framework/AnimationHost.test.tsx` (create)

**Interfaces:**
- Consumes: `Diversion.update?` (Task 1), `Diversion.setup/frame/teardown/resize`.
- Produces: AnimationHost that runs `setup` once per diversion, calls `update` on config change, re-runs `setup` when `update` returns falsy.

- [ ] **Step 1: Write the failing test** — create `src/framework/AnimationHost.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { z } from 'zod'
import { AnimationHost } from './AnimationHost'
import type { Diversion } from './types'

// jsdom has no 2D context or rAF — stub both so the host's effect runs.
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    setTransform() {}, fillRect() {}, // minimal 2D surface the host calls
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

function makeDiv(calls: string[], updateReturns: boolean): Diversion {
  return {
    id: 'fake', title: 'Fake', description: '', kind: '2d',
    schema: z.object({ v: z.number().default(0) }),
    setup: () => { calls.push('setup'); return { s: 1 } },
    frame: () => {},
    update: () => { calls.push('update'); return updateReturns },
  }
}

describe('AnimationHost lifecycle', () => {
  it('calls setup once on mount, update (not setup) on config change', () => {
    const calls: string[] = []
    const div = makeDiv(calls, true)
    const { rerender } = render(<AnimationHost diversion={div} config={{ v: 0 }} />)
    expect(calls).toEqual(['setup'])
    rerender(<AnimationHost diversion={div} config={{ v: 1 }} />)
    expect(calls).toEqual(['setup', 'update'])
  })

  it('re-runs setup when update returns false', () => {
    const calls: string[] = []
    const div = makeDiv(calls, false)
    const { rerender } = render(<AnimationHost diversion={div} config={{ v: 0 }} />)
    rerender(<AnimationHost diversion={div} config={{ v: 1 }} />)
    expect(calls).toEqual(['setup', 'update', 'setup'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/framework/AnimationHost.test.tsx`
Expected: FAIL — current host re-runs full setup on config change (calls `['setup','setup']`), no `update`.

- [ ] **Step 3: Refactor AnimationHost** — replace the single effect (lines ~23-85) so the live run lives in a ref and config changes go through `update`. New shape:

```tsx
  const runRef = useRef<{ ctx: RenderContext; state: unknown; size: Size } | null>(null)
  const lastConfigRef = useRef<unknown>(null)

  // setup + loop: re-runs only when the diversion changes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = (
      diversion.kind === 'webgl' ? canvas.getContext('webgl2') : canvas.getContext('2d')
    ) as RenderContext | null
    if (!ctx) return

    const sizeOf = (): Size => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(r.width * dpr))
      canvas.height = Math.max(1, Math.floor(r.height * dpr))
      if (diversion.kind === '2d') {
        ;(ctx as CanvasRenderingContext2D).setTransform(dpr, 0, 0, dpr, 0, 0)
        return { width: Math.max(1, Math.floor(r.width)), height: Math.max(1, Math.floor(r.height)) }
      }
      return { width: canvas.width, height: canvas.height }
    }

    const size = sizeOf()
    const state = diversion.setup(ctx, config, size)
    const run = { ctx, state, size }
    runRef.current = run
    lastConfigRef.current = config

    let acc = 0
    let frames = 0
    const loop = createLoop((t, dt) => {
      diversion.frame(run.state, ctx, t, dt)
      if (showChrome) {
        acc += dt; frames++
        if (acc >= 500) { setFps(Math.round((frames * 1000) / acc)); acc = 0; frames = 0 }
      }
    })
    loopRef.current = loop
    loop.setPaused(pausedRef.current || document.hidden)
    loop.start()

    const onResize = () => { run.size = sizeOf(); diversion.resize?.(run.state, run.size) }
    const onVisibility = () => loop.setPaused(pausedRef.current || document.hidden)
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      loop.stop()
      loopRef.current = null
      runRef.current = null
      diversion.teardown?.(run.state)
    }
  }, [diversion])

  // config changes: apply live via update(), else fall back to a full re-setup.
  useEffect(() => {
    const run = runRef.current
    if (!run) return // setup effect runs first on mount with this same config
    if (config === lastConfigRef.current) return
    lastConfigRef.current = config
    const handled = diversion.update?.(run.state, config, run.size)
    if (!handled) {
      diversion.teardown?.(run.state)
      run.state = diversion.setup(run.ctx, config, run.size)
    }
  }, [diversion, config])
```

Keep the existing `[paused]` effect, `toggleFullscreen`, and JSX unchanged. Ensure `Size` is imported (already in the `import type` line).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/framework/AnimationHost.test.tsx && npx tsc --noEmit`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/framework/AnimationHost.tsx src/framework/AnimationHost.test.tsx
git commit -m "AnimationHost: split setup/update effects, live-apply config via update hook (#5)"
```

---

### Task 3: Remove nuqs + ConfigScreen back/forward sync

**Files:**
- Modify: `package.json` (drop `nuqs`)
- Modify: `src/routes/ConfigScreen.tsx`
- Test: `src/routes/ConfigScreen.test.tsx` (create)

**Interfaces:**
- Consumes: `decodeConfig`, `encodeConfig` (unchanged), react-router `useLocation`, `useNavigationType`.

- [ ] **Step 1: Write the failing test** — create `src/routes/ConfigScreen.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ConfigScreen } from './ConfigScreen'

function renderAt(entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/d/:slug" element={<ConfigScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ConfigScreen URL hydration', () => {
  it('initialises the form from the URL params', () => {
    renderAt(['/d/flow-field?particles=1000'])
    const particles = document.querySelector('input[type="range"]') as HTMLInputElement
    expect(particles.value).toBe('1000')
  })
})
```

- [ ] **Step 2: Run to verify it passes for init (baseline), then confirm nuqs is unreferenced**

Run: `npx vitest run src/routes/ConfigScreen.test.tsx`
Expected: PASS (init-from-URL already works).
Run: `grep -rn "nuqs" src/`
Expected: no matches (safe to drop the dep).

- [ ] **Step 3: Remove the nuqs dependency** — in `package.json`, delete the line:

```json
    "nuqs": "^2.8.9",
```

- [ ] **Step 4: Add the POP-resync effect** — in `src/routes/ConfigScreen.tsx`:

Update the import:
```ts
import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate, useLocation, useNavigationType } from 'react-router-dom'
```
After the `update` function (before `playHref`), add:
```ts
  const location = useLocation()
  const navType = useNavigationType()
  // Back/forward changes the URL but not our edit buffer — re-decode on POP only.
  // Our own form writes use navigate(replace) (navType !== 'POP'), so no loop.
  useEffect(() => {
    if (navType === 'POP' && diversion) {
      setConfig(decodeConfig(diversion.schema, new URLSearchParams(location.search)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])
```

- [ ] **Step 5: Reinstall to update the lockfile**

Run: `npm install`
Expected: `nuqs` removed from `node_modules` + `package-lock.json`.

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/routes/ConfigScreen.tsx src/routes/ConfigScreen.test.tsx
git commit -m "ConfigScreen: re-sync form on history back/forward; drop unused nuqs (#5)"
```

---

### Task 4: Chrome verify + docs

**Files:**
- Modify: `README.md` and/or `CLAUDE.md` if either names `nuqs` or the re-setup gotcha.

- [ ] **Step 1: Start the dev server**

Run (background): `npm run dev`  → http://localhost:5180/

- [ ] **Step 2: Verify live update (no realloc)** — open `http://localhost:5180/d/flow-field`. In the preview, drag the **Speed** slider and edit a palette color. Expected: the field responds immediately and **particle positions persist** (the streaks don't jump/reset). Confirm via DevTools that dragging Speed does not reset positions (the trails stay continuous).

- [ ] **Step 3: Verify structural re-setup** — drag the **Particles** slider. Expected: the field rebuilds (re-setup) — acceptable and expected.

- [ ] **Step 4: Verify back/forward** — change a couple of controls (each writes the URL), then press the browser Back button. Expected: the form controls and preview re-sync to the previous URL state.

- [ ] **Step 5: Doc audit** — grep docs for stale `nuqs` mentions and the re-setup gotcha:

Run: `grep -rn "nuqs" README.md CLAUDE.md docs/ ; grep -n "re-runs .setup" CLAUDE.md`
If `nuqs` is named as a current dep anywhere, remove/fix it. Update the CLAUDE.md "Changing config re-runs `setup`" gotcha to note the new `update?` hook now applies visual params live (re-setup only on structural change). Commit any doc edits:

```bash
git add -A && git commit -m "docs: note update hook + drop nuqs references (#5)"
```

- [ ] **Step 6: Hand off for user verify before FF-merge.**

---

## Self-Review

**Spec coverage:**
- Section 1 `update?` contract + AnimationHost split + flow-field impl → Tasks 1-2. ✓
- Section 2 nuqs removal + back/forward POP-resync → Task 3. ✓
- Testing (updateFlowState unit, AnimationHost lifecycle, Chrome verify) → Tasks 1, 2, 4. ✓
- Out-of-scope items (no in-place array resize, no PlayScreen change) respected — no tasks touch them. ✓

**Placeholder scan:** none — every code step shows full code.

**Type consistency:** `updateFlowState(state: FlowState, cfg: FlowFieldConfig): boolean` defined in Task 1, consumed in Task 1 Step 5 and exercised via the `update` hook in Task 2's fake. `Diversion.update?` signature matches across types.ts (Task 1 Step 3) and AnimationHost call site (Task 2 Step 3). Field names `particles` / `seed` / `speed` match the schema.
