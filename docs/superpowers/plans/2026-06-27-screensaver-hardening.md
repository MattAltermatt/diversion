# Screensaver-hardening Implementation Plan (#39 / #6 / #7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the framework for long-running screensaver use — honor `prefers-reduced-motion`, pause offscreen gallery tiles, and refit crisply on container/fullscreen resize.

**Architecture:** All three changes land in `AnimationHost`. A single `shouldPause()` union gates the rAF loop across four sources (manual / hidden / reduced-motion / offscreen). A `ResizeObserver` replaces the `window` resize listener; the `resize` hook gains the drawing context so accumulation diversions can repaint their background.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4 + Vitest + @testing-library/react.

## Global Constraints

- Tests: Vitest, co-located `*.test.ts(x)`. UI via @testing-library/react.
- Diversions never touch React; the framework owns the rAF loop (black-box contract).
- Dev server pinned to port **5180**.
- Guard browser APIs that jsdom lacks (`matchMedia`, `ResizeObserver`, `IntersectionObserver`) with `typeof X !== 'undefined'` so SSR/test envs without stubs don't throw.
- Git identity already configured for the repo. Branch: `feature/screensaver-hardening` (already created; spec already committed).

---

### Task 1: #7 — ResizeObserver + resize background-refill

**Files:**
- Modify: `src/framework/types.ts:47` (extend `resize` signature)
- Modify: `src/framework/AnimationHost.tsx` (ResizeObserver; pass ctx to `resize`)
- Modify: `src/diversions/flow-field/index.ts:39-42` (`resize` bg-fill)
- Modify: `src/diversions/gravity-wells/index.ts:75-78` (`resize` bg-fill)
- Test: `src/framework/AnimationHost.test.tsx`

**Interfaces:**
- Produces: `Diversion.resize?(state, size, ctx?: CtxFor<K>)` — the third arg is the live drawing context (`run.ctx`), passed on every resize. Backward-compatible: existing two-arg `resize` implementations ignore it.

- [ ] **Step 1: Add a ResizeObserver stub to the test `beforeEach`, then write the failing test**

In `src/framework/AnimationHost.test.tsx`, add to the existing `beforeEach` (after the `cancelAnimationFrame` stub):

```ts
  // jsdom lacks ResizeObserver — capture the callback so tests can drive it.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      cb: ResizeObserverCallback
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb
        lastResizeObserver = this
      }
      observe() {}
      disconnect() {}
    },
  )
```

Add a module-level `let lastResizeObserver: any = null` near `let lastContextArgs` and reset it to `null` at the top of `beforeEach`.

Add a `resize` recorder to `makeDiv` so the test can assert it fired. Change `makeDiv` to accept the `calls` array and push `'resize'`:

```ts
    resize: () => {
      calls.push('resize')
    },
```

Then add a new test:

```ts
describe('AnimationHost resize (#7)', () => {
  it('refits via ResizeObserver, passing the context to resize()', () => {
    const calls: string[] = []
    render(<AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />)
    expect(lastResizeObserver).not.toBeNull()
    lastResizeObserver.cb([], lastResizeObserver) // fire a resize
    expect(calls).toContain('resize')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/framework/AnimationHost.test.tsx -t "resize"`
Expected: FAIL — `lastResizeObserver` is `null` (host still uses `window` resize listener), so `resize` is never recorded.

- [ ] **Step 3: Extend the `resize` contract in `types.ts`**

Change line 47:

```ts
  resize?(state: State, size: Size, ctx: CtxFor<K>): void
```

- [ ] **Step 4: Swap the window listener for a ResizeObserver in `AnimationHost.tsx`**

In the setup effect, replace the `onResize` definition + its `window.addEventListener('resize', onResize)` registration. New `onResize` passes the context:

```ts
    const onResize = () => {
      run.size = sizeOf()
      diversion.resize?.(run.state, run.size, ctx)
    }
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null
    ro?.observe(canvas)
```

In the cleanup `return () => { ... }`, replace `window.removeEventListener('resize', onResize)` with:

```ts
      ro?.disconnect()
```

(Observe `canvas`, not `wrapRef`, so the observed box is exactly the drawn surface.)

- [ ] **Step 5: Run the resize test to verify it passes**

Run: `npx vitest run src/framework/AnimationHost.test.tsx -t "resize"`
Expected: PASS.

- [ ] **Step 6: Add background-refill to the two accumulation diversions**

`src/diversions/flow-field/index.ts` — replace the `resize` hook:

```ts
  resize(state, size, ctx) {
    state.w = size.width
    state.h = size.height
    // Setting canvas dims wipes the backing store; repaint the bg so the
    // newly-sized canvas doesn't flash the page colour before trails rebuild.
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },
```

`src/diversions/gravity-wells/index.ts` — replace the `resize` hook the same way:

```ts
  resize(state, size, ctx) {
    state.w = size.width
    state.h = size.height
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },
```

(Buffer-based diversions `substrate` and `sand-stroke` blit a full buffer every frame, so they self-heal and need no change.)

- [ ] **Step 7: Run the full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green. (Existing tests unaffected; the ResizeObserver stub is benign for them.)

- [ ] **Step 8: Commit**

```bash
git add src/framework/types.ts src/framework/AnimationHost.tsx src/framework/AnimationHost.test.tsx src/diversions/flow-field/index.ts src/diversions/gravity-wells/index.ts
git commit -m "framework: ResizeObserver refit + resize bg-refill (#7)"
```

---

### Task 2: #39 — unified pause model + prefers-reduced-motion

**Files:**
- Create: `src/framework/pauseModel.ts`
- Create: `src/framework/pauseModel.test.ts`
- Modify: `src/framework/AnimationHost.tsx`
- Modify: `src/framework/theme.css` (hint chip style)
- Test: `src/framework/AnimationHost.test.tsx`

**Interfaces:**
- Produces: `interface PauseSources { manual: boolean; hidden: boolean; reduced: boolean; offscreen: boolean }` and `shouldPause(s: PauseSources): boolean` — the single OR-union the loop reads. Consumed by `AnimationHost` (this task) and extended by Task 3 (`offscreen`).

- [ ] **Step 1: Write the failing unit test for the union helper**

Create `src/framework/pauseModel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shouldPause } from './pauseModel'

describe('shouldPause', () => {
  const none = { manual: false, hidden: false, reduced: false, offscreen: false }
  it('runs when no source is active', () => {
    expect(shouldPause(none)).toBe(false)
  })
  it('pauses if any single source is active', () => {
    expect(shouldPause({ ...none, manual: true })).toBe(true)
    expect(shouldPause({ ...none, hidden: true })).toBe(true)
    expect(shouldPause({ ...none, reduced: true })).toBe(true)
    expect(shouldPause({ ...none, offscreen: true })).toBe(true)
  })
  it('stays paused while another source is active even as one clears', () => {
    expect(shouldPause({ ...none, hidden: true, offscreen: true })).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/framework/pauseModel.test.ts`
Expected: FAIL — module `./pauseModel` not found.

- [ ] **Step 3: Implement the union helper**

Create `src/framework/pauseModel.ts`:

```ts
/** Every reason the animation loop might be paused. Paused if ANY is true. */
export interface PauseSources {
  manual: boolean // user pressed the pause button
  hidden: boolean // tab/document not visible
  reduced: boolean // OS prefers-reduced-motion, not yet opted out of (#39)
  offscreen: boolean // wrapper scrolled out of view (#6)
}

export const shouldPause = (s: PauseSources): boolean =>
  s.manual || s.hidden || s.reduced || s.offscreen
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/framework/pauseModel.test.ts`
Expected: PASS.

- [ ] **Step 5: Make the test rAF controllable + add a matchMedia stub, then write the failing reduced-motion test**

In `src/framework/AnimationHost.test.tsx`, replace the `requestAnimationFrame`/`cancelAnimationFrame` stubs in `beforeEach` with a drainable queue, and add a `matchMedia` stub. Add module-level state near the other `let`s:

```ts
let rafCbs: FrameRequestCallback[] = []
let reducedMotion = false
function drainRaf() {
  const cbs = rafCbs
  rafCbs = []
  cbs.forEach((cb) => cb(0))
}
```

In `beforeEach`, reset `rafCbs = []` and `reducedMotion = false`, and set:

```ts
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCbs.push(cb)
    return rafCbs.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reducedMotion && q.includes('reduced-motion'),
    addEventListener() {},
    removeEventListener() {},
  }))
```

Make `makeDiv` count `frame` calls — change its `frame` to push `'frame'` onto `calls`:

```ts
    frame: () => {
      calls.push('frame')
    },
```

Add the test:

```ts
describe('AnimationHost reduced-motion (#39)', () => {
  it('animates freely when reduced-motion is off', () => {
    const calls: string[] = []
    render(<AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />)
    drainRaf(); drainRaf(); drainRaf()
    expect(calls.filter((c) => c === 'frame').length).toBeGreaterThan(1)
  })

  it('paints exactly one frame then freezes when reduced-motion is on', () => {
    reducedMotion = true
    const calls: string[] = []
    render(<AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />)
    drainRaf(); drainRaf(); drainRaf()
    expect(calls.filter((c) => c === 'frame').length).toBe(1)
  })
})
```

- [ ] **Step 6: Run to verify the reduced-motion test fails**

Run: `npx vitest run src/framework/AnimationHost.test.tsx -t "reduced-motion"`
Expected: the "off" test passes; the "on" test FAILS (frame runs every drain — no reduced-motion gate yet).

- [ ] **Step 7: Wire the unified pause model + reduced-motion into `AnimationHost.tsx`**

Add the import:

```ts
import { shouldPause, type PauseSources } from './pauseModel'
```

Replace the `pausedRef`/`paused` setup. Keep `paused` React state (drives the button), add a sources ref and a `reducedActive` state for the hint chip:

```ts
  const pauseRef = useRef<PauseSources>({ manual: false, hidden: false, reduced: false, offscreen: false })
  const [paused, setPaused] = useState(false)
  const [reducedActive, setReducedActive] = useState(false)
  const [fps, setFps] = useState(0)
```

Add a `syncPaused` helper inside the component (before the effects):

```ts
  const syncPaused = () => loopRef.current?.setPaused(shouldPause(pauseRef.current))
```

In the setup effect, after `runRef.current = run`, set up reduced-motion. Add a `framePainted` flag and the media query:

```ts
    let framePainted = false
    const mql =
      typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null
```

In the loop callback, after `diversion.frame(...)`, engage the reduced gate once the first frame is on screen:

```ts
    const loop = createLoop((t, dt) => {
      diversion.frame(run.state, ctx, t, dt)
      if (!framePainted) {
        framePainted = true
        if (mql?.matches) {
          pauseRef.current.reduced = true
          setReducedActive(true)
          syncPaused()
        }
      }
      if (showChrome) {
        // ...existing fps sampling unchanged...
      }
    })
```

Set the initial pause from the sources ref (note: `reduced` starts false so the FIRST frame runs even under reduced-motion; the gate engages after it paints):

```ts
    loopRef.current = loop
    pauseRef.current.hidden = document.hidden
    syncPaused()
    loop.start()
```

Replace `onVisibility`:

```ts
    const onVisibility = () => {
      pauseRef.current.hidden = document.hidden
      syncPaused()
    }
```

React to a live OS reduced-motion toggle:

```ts
    const onReducedChange = () => {
      pauseRef.current.reduced = mql?.matches ?? false
      setReducedActive(pauseRef.current.reduced)
      syncPaused()
    }
    mql?.addEventListener('change', onReducedChange)
```

Add `mql?.removeEventListener('change', onReducedChange)` to the cleanup.

In the WebGL `onRestored`, replace `loop.setPaused(pausedRef.current || document.hidden)` with `syncPaused()`; in `onLost`, `loop.setPaused(true)` stays as-is.

- [ ] **Step 8: Update the manual-pause effect + play button for opt-in**

Replace the `[paused]` effect:

```ts
  useEffect(() => {
    pauseRef.current.manual = paused
    syncPaused()
  }, [paused])
```

Add a `togglePause` handler that clears the reduced gate when the user opts into motion:

```ts
  const togglePause = () => {
    setPaused((p) => {
      const next = !p
      if (!next && pauseRef.current.reduced) {
        pauseRef.current.reduced = false // opting in clears reduced-motion gate for the session
        setReducedActive(false)
      }
      return next
    })
  }
```

Wire the button to `togglePause` instead of the inline `setPaused`. Add the hint chip in the chrome bar (before the pause button):

```tsx
        <div className="anim-bar">
          <span className="fps">{fps} fps</span>
          {reducedActive && paused && (
            <span className="anim-hint">Reduced motion — press ▶ for full motion</span>
          )}
          <button onClick={togglePause} aria-label={paused ? 'Play' : 'Pause'}>
            {paused ? '▶' : '⏸'}
          </button>
          {/* ...fullscreen button unchanged... */}
        </div>
```

- [ ] **Step 9: Add the hint-chip style**

In `src/framework/theme.css`, add (match the existing `.fps` look — find it and mirror font-size/color):

```css
.anim-hint {
  font-size: 0.72rem;
  opacity: 0.8;
  white-space: nowrap;
}
```

- [ ] **Step 10: Run reduced-motion tests + full suite + typecheck**

Run: `npx vitest run src/framework/AnimationHost.test.tsx && npx vitest run src/framework/pauseModel.test.ts && npx tsc --noEmit`
Expected: all green (both reduced-motion tests pass; existing lifecycle/WebGL tests still pass).

- [ ] **Step 11: Commit**

```bash
git add src/framework/pauseModel.ts src/framework/pauseModel.test.ts src/framework/AnimationHost.tsx src/framework/AnimationHost.test.tsx src/framework/theme.css
git commit -m "framework: prefers-reduced-motion + unified pause model (#39)"
```

---

### Task 3: #6 — pause offscreen gallery tiles (IntersectionObserver)

**Files:**
- Modify: `src/framework/AnimationHost.tsx`
- Test: `src/framework/AnimationHost.test.tsx`

**Interfaces:**
- Consumes: `pauseRef.current.offscreen` + `syncPaused()` from Task 2.

- [ ] **Step 1: Add an IntersectionObserver stub + write the failing test**

In `src/framework/AnimationHost.test.tsx` `beforeEach`, add (and a module-level `let lastIntersectionObserver: any = null`, reset to `null` in `beforeEach`):

```ts
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      cb: IntersectionObserverCallback
      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb
        lastIntersectionObserver = this
      }
      observe() {}
      disconnect() {}
    },
  )
```

Add the test:

```ts
describe('AnimationHost offscreen pause (#6)', () => {
  it('stops animating when scrolled out of view, resumes when back', () => {
    const calls: string[] = []
    render(<AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />)
    drainRaf()
    const baseline = calls.filter((c) => c === 'frame').length
    lastIntersectionObserver.cb([{ isIntersecting: false }] as any, lastIntersectionObserver)
    drainRaf(); drainRaf()
    expect(calls.filter((c) => c === 'frame').length).toBe(baseline) // frozen
    lastIntersectionObserver.cb([{ isIntersecting: true }] as any, lastIntersectionObserver)
    drainRaf()
    expect(calls.filter((c) => c === 'frame').length).toBeGreaterThan(baseline) // resumed
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/framework/AnimationHost.test.tsx -t "offscreen"`
Expected: FAIL — `lastIntersectionObserver` is `null` (no observer wired) or frames keep advancing while offscreen.

- [ ] **Step 3: Wire the IntersectionObserver in `AnimationHost.tsx`**

In the setup effect (after the ResizeObserver setup), observe the wrapper:

```ts
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entries) => {
            pauseRef.current.offscreen = !entries[entries.length - 1].isIntersecting
            syncPaused()
          })
        : null
    if (wrapRef.current) io?.observe(wrapRef.current)
```

Add `io?.disconnect()` to the cleanup.

- [ ] **Step 4: Run the offscreen test to verify it passes**

Run: `npx vitest run src/framework/AnimationHost.test.tsx -t "offscreen"`
Expected: PASS.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/framework/AnimationHost.tsx src/framework/AnimationHost.test.tsx
git commit -m "framework: pause offscreen tiles via IntersectionObserver (#6)"
```

---

### Task 4: Docs, code review, Chrome verify

**Files:**
- Modify: `CLAUDE.md` (WebGL gotcha note — `resize` now receives the context)
- Modify: `README.md` if it enumerates framework behaviors (check first)

- [ ] **Step 1: Update the CLAUDE.md WebGL gotcha**

The gotcha currently says `resize?(state,size)` and `teardown?(state)` do NOT receive the context. `resize` now DOES receive it (3rd arg). Update that sentence to: `resize?(state,size,ctx)` receives the context; only `teardown?(state)` does not. Keep the per-frame `gl.viewport` guidance (still valid).

- [ ] **Step 2: Dispatch the diversion-reviewer subagent**

Review the full branch diff against the 5 UX invariants, the schema-as-SSOT rule, and the URL-codec keystone. Address any high-confidence findings (receiving-code-review skill), re-run tests.

- [ ] **Step 3: Chrome verify (dev server on :5180, `?mute=1`)**

1. **#6 offscreen:** Gallery `http://localhost:5180/diversion/?mute=1` — scroll tiles out of view, confirm offscreen tiles stop animating (DevTools Performance / fps), re-enter view → resume.
2. **#39 reduced-motion:** DevTools → Rendering → "Emulate CSS prefers-reduced-motion: reduce" → open a diversion play screen → confirm one frame paints then freezes, hint chip visible, ▶ press animates. Confirm gallery tiles show a static first frame.
3. **#7 resize:** Open flow-field & gravity-wells play screens → drag window / toggle fullscreen → confirm canvas refits crisply (no blur/stretch) and no background flash in the newly-exposed area.

- [ ] **Step 4: Commit docs + close issues on FF-merge**

```bash
git add CLAUDE.md README.md
git commit -m "docs: resize now passes context; screensaver-hardening notes"
```

After user-verify + FF-merge to `main`, close #39 / #6 / #7 (note in #6 that captured static thumbnails "at scale" remain backlogged).

---

## Self-Review

**Spec coverage:**
- #39 reduced-motion (static first frame + opt-in) → Task 2 ✓
- Unified pause model → Task 2 (`pauseModel.ts`) ✓
- #6 offscreen IntersectionObserver in AnimationHost → Task 3 ✓
- #6 static-thumbnails-at-scale → explicitly backlogged (Task 4 Step 4 note) ✓
- #7 ResizeObserver → Task 1 ✓
- #7 resize bg-refill (flow-field, gravity-wells; buffer diversions self-heal) → Task 1 ✓
- Tests: union helper, reduced-motion behavior, offscreen behavior, resize-call → Tasks 1-3 ✓
- Chrome verify checklist → Task 4 ✓

**Placeholder scan:** none — all steps carry concrete code/commands.

**Type consistency:** `PauseSources`/`shouldPause` defined in Task 2, consumed by Task 3 (`pauseRef.current.offscreen`). `resize?(state,size,ctx)` defined in Task 1 `types.ts`, used by flow-field/gravity-wells in Task 1. `syncPaused`/`framePainted`/`pauseRef` consistent across Tasks 2-3.
