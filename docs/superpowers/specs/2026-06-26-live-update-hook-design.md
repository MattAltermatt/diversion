# Live config preview + history sync — design (#5)

**Issue:** #5 — Config preview: live-update without full re-setup + sync on browser back/forward.

Two coupled problems from CR #3, addressed as two independent sections:

1. Every control edit creates a new config object → `AnimationHost` re-runs
   `setup()` → reallocates particles + noise grid + re-randomizes, on every
   pointer-move. Add an optional `update?` lifecycle hook so visual-only params
   apply live.
2. `ConfigScreen` reads the URL once and writes with `navigate(replace)` —
   browser back/forward changes the URL but never re-decodes into the form.
   Resolve the **nuqs drift**: `nuqs` is a declared dep but unused.

**Decisions locked in brainstorm:**
- **nuqs:** remove it (Option A). Keep the custom URL codec — the tested
  "keystone" and the architecture CLAUDE.md already names. Amend the spec/stack
  note to say "custom URL codec" with no nuqs.
- **Update-hook contract:** boolean escape hatch (Option A). The diversion owns
  the structural/visual decision; the framework falls back to a full re-setup
  when the hook can't apply a change live.

---

## Section 1 — `update?` lifecycle hook

### Contract (`src/framework/types.ts`)

Add one optional method to `Diversion<Config>`:

```ts
update?(state: DiversionState, config: Config, size: Size): boolean | void
```

- Returns **truthy** → "applied live; keep the running state."
- Returns **falsy** / **hook absent** → framework tears down and re-runs
  `setup()` with the new config. This is exactly today's behavior, so existing
  diversions that don't implement `update` are unaffected (safe default).

### Framework (`src/framework/AnimationHost.tsx`)

Split the single `[diversion, config]` effect into two, holding the live run in
a ref so the loop / resize / visibility handlers always read current state
(re-setup swaps the state object underneath a never-stopping loop):

- **Effect A — `[diversion]`:** acquire ctx, `sizeOf()`, `setup(config)`, start
  the loop, store `{ ctx, state, size }` in `runRef`. The loop callback,
  `onResize`, and `onVisibility` all read `runRef.current`. `onResize` also
  updates `run.size`. Teardown (stop loop, `teardown(state)`) on unmount /
  diversion change.
- **Effect B — `[config]`:** skip the mount run (A already set up with this
  exact config — guard via a `lastConfigRef` set by A, or a first-run flag). On
  later config changes:
  ```ts
  const handled = diversion.update?.(run.state, config, run.size)
  if (!handled) {
    diversion.teardown?.(run.state)
    run.state = diversion.setup(run.ctx, config, run.size)
  }
  ```
  The loop is never stopped; re-setup only swaps `run.state`.

### Flow Field (`src/diversions/flow-field/`)

`stepFlow` already reads every per-frame parameter live from `state.cfg`
(`speed`, `blend`, `fadeTrails`, `trailLength`, `lifespan`, `noiseScale`,
`background`, and `color.*`) plus the precomputed `state.styles`. So the only
**structural** changes are particle **count** (array realloc) and **seed**
(rebuilds the noise function, rng stream, and particle layout).

Extract a pure, testable decision in `flowField.ts`:

```ts
/** Apply a config change to a live FlowState in place. Returns false when the
 *  change is structural (particle count or seed) and needs a full re-setup;
 *  true when applied live. Everything else is read live from state.cfg each
 *  frame, so we just swap cfg and recompute the precomputed palette styles. */
export function updateFlowState(state: FlowState, cfg: FlowFieldConfig): boolean {
  if (cfg.particles !== state.cfg.particles || cfg.seed !== state.cfg.seed) return false
  state.cfg = cfg
  state.styles = cfg.color.colors.map(hexToRgba)
  return true
}
```

`index.ts` wires it: `update(state, config) { return updateFlowState(state as FlowState, config) }`.

---

## Section 2 — back/forward history sync + nuqs removal

- **Remove `nuqs`** from `package.json` dependencies (zero imports today).
- **`src/routes/ConfigScreen.tsx`:** keep the `useState` edit buffer (avoids
  controlled hex/number inputs round-tripping through encode→decode on every
  keystroke), and add one effect that re-decodes from the URL **only on history
  POP**:
  ```ts
  const location = useLocation()
  const navType = useNavigationType()
  useEffect(() => {
    if (navType === 'POP') {
      setConfig(decodeConfig(diversion.schema, new URLSearchParams(location.search)))
    }
  }, [location.key]) // one entry per history change
  ```
  Form writes stay `navigate({ search }, { replace: true })` → navType is not
  POP → no resync loop. Back/forward → POP → form re-syncs from the URL.

Chosen over making the URL the sole source of truth specifically to avoid
controlled-input cursor jank during typing.

---

## Testing

- **`flowField.test.ts`** — `updateFlowState`:
  - visual change (e.g. `speed`, a color) → returns `true`, mutates `state.cfg`,
    keeps the **same `particles` array reference** (no realloc), recomputes
    `styles`.
  - particle-count change → returns `false`.
  - seed change → returns `false`.
- **`AnimationHost.test.tsx`** (new; mock `HTMLCanvasElement.getContext` + rAF):
  a fake diversion counts lifecycle calls — `setup` once on mount, `update` on a
  config change (and **not** `setup`), and a re-`setup` when `update` returns
  `false`.
- **Chrome verify:** drag `speed` / a color in the config preview → updates
  live with particle positions **persisting** (no reset); drag `particles` →
  field rebuilds (expected structural re-setup); browser back/forward → the form
  re-syncs to the URL.

## Out of scope

- Growing/shrinking the particle array in place (re-setup on count change is
  fine and rare). Backlog if ever needed.
- PlayScreen never exercises `update` (it freezes config from the URL once);
  only the ConfigScreen preview benefits. No PlayScreen change.
