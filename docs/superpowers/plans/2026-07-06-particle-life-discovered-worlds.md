# Particle Life — Discovered Worlds Gallery (#214) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curated "Worlds" preset axis to `particle-life-gpu` — the current Feel presets become 🎲 Random entries, and hand-picked `matrixSeed` worlds (fixed rules + fresh soup each visit) sit below them.

**Architecture:** Pure data + one preset-group refactor. `presets.ts` replaces its `Feel` group with a `Worlds` group whose every option patches the same 8 dynamics keys (`matrixSeed, colors, symmetry, attractBias, forceScale, friction, beta, rMax`). The `Look` group is untouched. A curated world is identity `matrixSeed` (never `seed`, which is `randomizeOnFreshLoad` and gets discarded on Play). No engine, schema, or shader change. Curated seeds are found by a two-stage Chrome sweep (pre-screen solo → live taste pass with user).

**Tech Stack:** TypeScript, Zod schema, Vitest, chrome-devtools MCP (curation), Vite dev server on port 5180.

**Spec:** `docs/superpowers/specs/2026-07-06-particle-life-discovered-worlds-design.md`

**Execution note:** Task 1 & 3–4 are code; Tasks 2–3 need the dev server + chrome-devtools MCP + the user's live eye (subagent Bash/Chrome perm gap → **lead-inline**). Task 1's pure refactor+test could be subagent, but it's small enough to keep inline with the curation flow.

---

## File Structure

- `src/diversions/particle-life-gpu/presets.ts` — **modify**: `Feel` group → `Worlds` group; expand the 3 Random entries to the 8-key set; append curated worlds in Task 3.
- `src/diversions/particle-life-gpu/presets.test.ts` — **create**: particle-life-gpu-specific structure guards (2 groups labelled `Worlds`/`Look`; 8-key uniformity; 🎲→`matrixSeed:0`, curated→`matrixSeed!==0`; no option patches `matrix`).
- Generic coverage already exists in `src/framework/presetSweep.test.ts` (parse-over-defaults + `matchPresets` round-trip + equal-key-set) — no change needed; it runs over the new group automatically.

---

## Task 1: Refactor `Feel` → `Worlds` axis (mechanism)

**Files:**
- Modify: `src/diversions/particle-life-gpu/presets.ts`
- Create: `src/diversions/particle-life-gpu/presets.test.ts`

- [ ] **Step 1: Write the failing structure test**

Create `src/diversions/particle-life-gpu/presets.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { particleLifeGpuPresets } from './presets'

// The Worlds axis (#214): one dynamics axis ("Worlds") that replaces the old
// "Feel" group, plus the unchanged "Look" axis. A curated world is identity
// `matrixSeed` (fixed rules) + a rerolling soup `seed` (fresh each visit), so
// every Worlds option must pin the same 8 dynamics keys and must NOT patch the
// derived `matrix` array (that would break matrixSeed-reproducibility).

const WORLD_KEYS = [
  'attractBias', 'beta', 'colors', 'forceScale',
  'friction', 'matrixSeed', 'rMax', 'symmetry',
].sort().join(',')

describe('particle-life-gpu presets — Worlds axis (#214)', () => {
  it('declares exactly two groups: Worlds then Look', () => {
    expect(particleLifeGpuPresets.map((g) => g.label)).toEqual(['Worlds', 'Look'])
  })

  const worlds = () => particleLifeGpuPresets.find((g) => g.label === 'Worlds')!

  it('every Worlds option patches the same 8 dynamics keys', () => {
    for (const opt of worlds().options) {
      expect(Object.keys(opt.patch).sort().join(','), opt.name).toBe(WORLD_KEYS)
    }
  })

  it('no Worlds option patches the derived matrix array', () => {
    for (const opt of worlds().options) {
      expect(Object.prototype.hasOwnProperty.call(opt.patch, 'matrix'), opt.name).toBe(false)
    }
  })

  it('🎲 Random options follow the soup (matrixSeed 0); curated ones pin a nonzero matrixSeed', () => {
    for (const opt of worlds().options) {
      const isRandom = opt.name.startsWith('🎲')
      const ms = (opt.patch as { matrixSeed?: number }).matrixSeed
      if (isRandom) expect(ms, opt.name).toBe(0)
      else expect(ms, opt.name).not.toBe(0)
    }
  })

  it('provides the three Random feels', () => {
    const names = worlds().options.map((o) => o.name)
    expect(names).toEqual(expect.arrayContaining(['🎲 Calm', '🎲 Balanced', '🎲 Lively']))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/diversions/particle-life-gpu/presets.test.ts`
Expected: FAIL — the current group is labelled `Feel`, and its options patch only 5 keys (no `matrixSeed`/`colors`/`rMax`).

- [ ] **Step 3: Rewrite `presets.ts` to the Worlds axis**

Replace the entire body of `src/diversions/particle-life-gpu/presets.ts` with:

```ts
// presets.ts — declared data, not chrome. Two independent axes:
//   • Worlds — WHICH world (the dynamics/identity axis). Every option pins the
//     same 8 keys. The 🎲 Random entries keep matrixSeed:0 (rules follow the
//     rerolling soup seed — these are the old "Feel" presets); the named,
//     curated worlds pin a nonzero matrixSeed (fixed rules) so the same
//     who-chases-whom character grows every visit while the soup rerolls fresh
//     (see the #214 design spec). A curated world is reproducible from
//     matrixSeed ALONE, so no option ever patches the derived `matrix` array.
//   • Look — how it LOOKS (palette/glow/trails). Unchanged; fully orthogonal.
// matchPresets assumes one key-set per group, so picking a world flips only the
// Worlds axis and a manual dynamics edit drops it to "Custom".
import type { PresetGroup } from '../../framework/types'
import type { ParticleLifeGpuConfig } from './schema'

export const particleLifeGpuPresets: PresetGroup<ParticleLifeGpuConfig>[] = [
  {
    label: 'Worlds',
    options: [
      { name: '🎲 Calm',     patch: { matrixSeed: 0, colors: 6, symmetry: 'Symmetric',  attractBias: 0.15, forceScale: 0.6, friction: 0.08,  beta: 0.32, rMax: 80 } },
      { name: '🎲 Balanced', patch: { matrixSeed: 0, colors: 6, symmetry: 'Asymmetric', attractBias: 0.10, forceScale: 1.0, friction: 0.04,  beta: 0.30, rMax: 80 } },
      { name: '🎲 Lively',   patch: { matrixSeed: 0, colors: 6, symmetry: 'Asymmetric', attractBias: 0.05, forceScale: 1.6, friction: 0.025, beta: 0.28, rMax: 80 } },
      // Curated worlds (matrixSeed:N) appended in Task 3 after the live pass.
    ],
  },
  {
    label: 'Look',
    options: [
      { name: 'Mariners', patch: { palette: 'Mariners', background: '#05070d', trailFade: 0.15, glow: true, dotSize: 2.5 } },
      { name: 'Spectrum', patch: { palette: 'Spectrum', background: '#05070d', trailFade: 0.15, glow: true, dotSize: 2.5 } },
      { name: 'Neon Night', patch: { palette: 'Neon', background: '#05070d', trailFade: 0.2, glow: true, dotSize: 2.5 } },
      { name: 'Pastel Dream', patch: { palette: 'Pastel', background: '#0b0a12', trailFade: 0.25, glow: true, dotSize: 3 } },
      { name: 'Ember', patch: { palette: 'Fire', background: '#0a0503', trailFade: 0.18, glow: true, dotSize: 2.5 } },
      { name: 'Ice', patch: { palette: 'Ice', background: '#04070d', trailFade: 0.2, glow: true, dotSize: 2.5 } },
    ],
  },
]
```

- [ ] **Step 4: Run the particle-life-gpu tests to verify they pass**

Run: `npx vitest run src/diversions/particle-life-gpu/`
Expected: PASS — new `presets.test.ts` green; `reconcile`/`liveApply`/`matrixCodec`/`schema` unaffected.

- [ ] **Step 5: Run the generic preset sweep to confirm no cross-diversion regression**

Run: `npx vitest run src/framework/presetSweep.test.ts`
Expected: PASS — every Worlds option parses over defaults, round-trips its own name in `matchPresets`, and shares one key-set.

- [ ] **Step 6: Confirm nothing hardcodes the old "Feel" label**

Run: `grep -rn "'Feel'" src/ ; echo done`
Expected: no matches (only `done` prints). If a match appears in a test, update it to `'Worlds'`.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/diversions/particle-life-gpu/presets.ts src/diversions/particle-life-gpu/presets.test.ts
git commit -m "feat(particle-life-gpu): Worlds preset axis replacing Feel (#214 mechanism)"
```

---

## Task 2: Stage-1 pre-screen sweep (lead-inline, no commit)

**Purpose:** Produce a shortlist of ~15–20 `matrixSeed` candidates that have real structure, so the live pass with the user is fast. No code changes; output is a scratchpad note.

**Files:** none committed. Scratch notes → `<scratchpad>/pl-worlds-shortlist.md`.

- [ ] **Step 1: Start the dev server (background)**

Run: `npm run dev` (background). Confirm the listening port (pinned to 5180; Vite may bump if taken).

- [ ] **Step 2: Sweep matrixSeed with the soup pinned**

For `matrixSeed = 1..40`, drive chrome-devtools MCP to:
`http://localhost:5180/#/d/particle-life-gpu/play?matrixSeed=<N>&seed=1&colors=6&mute=1`
Pinning `seed=1` holds the soup constant so only the RULES vary (isolates matrixSeed's effect). Let each settle ~15–20s of **foreground** time (avoid long `setTimeout` in the tab — rAF throttle gotcha; use short polled waits), then `take_screenshot`.

- [ ] **Step 3: Reject the dead broths**

Discard configs that collapse to a dot, freeze, or read as one flat field (no sustained structure). Keep those showing cells / membranes / gliders / chase-tails / lattices. Record the survivors' `matrixSeed` values + a one-line description in `<scratchpad>/pl-worlds-shortlist.md`.

- [ ] **Step 4: Sanity-check soup-independence on ~3 survivors**

For 3 shortlisted seeds, reload WITHOUT `seed` (e.g. `?matrixSeed=<N>&colors=6&mute=1`) two or three times and confirm the same *character* re-grows from a fresh soup. Drop any whose beauty depended on the pinned soup (fragile — fails the "fresh soup each visit" promise). This is the gate that makes matrixSeed-only honest.

_No commit — this task produces a shortlist for Task 3._

---

## Task 3: Stage-2 live taste pass + capture worlds

**Files:**
- Modify: `src/diversions/particle-life-gpu/presets.ts` (append curated entries)

- [ ] **Step 1: Drive the shortlist live with the user**

With the dev server running, load each shortlisted seed live (`?matrixSeed=<N>&colors=6&mute=1`) and let the user watch the **motion**. The user flags keepers. Target ~6–8 total.

- [ ] **Step 2: Capture each keeper's 8-key patch**

For each keeper, read the live config values and write one line into the `Worlds` group's `options` array (below the 🎲 Random entries), pinning all 8 keys. Propose an evocative name (Coral Reef, Jellyfish, Chase Chains, Lattice, Nebula, Cells…); the user confirms/renames. Example:

```ts
{ name: 'Coral Reef', patch: { matrixSeed: 42, colors: 5, symmetry: 'Asymmetric', attractBias: 0.20, forceScale: 1.1, friction: 0.05, beta: 0.28, rMax: 95 } },
```

Rules: pin exactly the 8 keys (same set as the Random entries); never patch `matrix`; `colors` must equal the species count the seed was judged at (the matrix is `colors²`, so a different `colors` is a different world).

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/diversions/particle-life-gpu/ src/framework/presetSweep.test.ts`
Expected: PASS — new curated options satisfy the 8-key uniformity + `matrixSeed!==0` guards and round-trip in the generic sweep.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/particle-life-gpu/presets.ts
git commit -m "feat(particle-life-gpu): curated Discovered Worlds seed gallery (#214)"
```

---

## Task 4: Verify, document, review, ship

**Files:**
- Modify: `README.md` and/or `CHANGELOG.md` if either enumerates preset axes (verify first; edit only if they mention Feel/Look presets).

- [ ] **Step 1: Chrome-verify the picker end-to-end**

With the dev server running, open `http://localhost:5180/#/d/particle-life-gpu` (Config screen). Confirm:
- one **Worlds** dropdown + one **Look** dropdown render above the form;
- picking a curated world updates the canvas AND the form fields (matrixSeed/colors/dynamics), and the interaction **matrix rebuilds** (reconcile drops the Custom override on the matrixSeed change);
- editing any dynamics slider flips the Worlds dropdown to **Custom**;
- console is clean (no per-frame WebGPU validation spam).

- [ ] **Step 2: Verify the fresh-soup promise on the Play screen**

Open a curated world's Play view seedless (`#/d/particle-life-gpu/play?matrixSeed=<N>&colors=<C>&mute=1`), reload a few times, and confirm the same character re-grows from a visibly different starting soup each time.

- [ ] **Step 3: Update docs if they enumerate presets**

Run: `grep -rn "Feel\|Look presets\|preset" README.md CHANGELOG.md ; echo done`
If either doc lists the old Feel/Look axes, update to reflect the Worlds axis. Otherwise no change. Commit any edit:

```bash
git add README.md CHANGELOG.md
git commit -m "docs: note Particle Life Discovered Worlds axis (#214)"
```

- [ ] **Step 4: Code review**

Dispatch a fresh `diversion-reviewer` agent on the branch diff (UX invariants + schema-as-source-of-truth + codec keystone). Address any blocking findings.

- [ ] **Step 5: User-verify before FF-merge**

Hand the user the Config URL and the fresh-soup Play URL; wait for explicit approval.

- [ ] **Step 6: Squash, FF-merge, close #214, clean up branch**

After approval: squash the branch to one commit, FF-merge to `main`, push, `gh issue close 214` with a note, and delete the branch both ends (standing session authorization).

---

## Self-Review

**Spec coverage:**
- matrixSeed-only identity → Task 1 test (`matrix` never patched; matrixSeed is the pinned identity) + Task 2 Step 4 soup-independence gate. ✓
- Worlds replaces Feel, Random on top → Task 1 (rewrite + `['Worlds','Look']` + 🎲 entries). ✓
- 8-key patch set → Task 1 test (`WORLD_KEYS`) + Task 3 Step 2 rule. ✓
- Look axis unchanged / orthogonal → Task 1 (Look block copied verbatim). ✓
- Two-stage curation → Tasks 2 (pre-screen) + 3 (live). ✓
- Ship mechanism + ~6–8 worlds together → branch not merged until Task 4 (mechanism Task 1 + worlds Task 3 land together). ✓
- Testing (equal-key-set, round-trip, seed contract untouched) → generic `presetSweep` (Task 1 Step 5) + local `presets.test.ts`; seed/`seedContract` unchanged (no `randomizeOnFreshLoad` fields added). ✓
- Reconcile rebuilds matrix on world pick → Task 4 Step 1 verify (mechanism already exists in `reconcileMatrix`). ✓

**Placeholder scan:** the only "appended later" note is the Task 3 curated-world capture, which is the genuine interactive deliverable, not a hidden TODO — its exact shape (8-key line) is specified. No other placeholders.

**Type consistency:** `matrixSeed, colors, symmetry, attractBias, forceScale, friction, beta, rMax` — all real `ParticleLifeGpuConfig` fields (verified against `schema.ts`); `particleLifeGpuPresets` export name and `PresetGroup<ParticleLifeGpuConfig>` type match the existing file. `WORLD_KEYS` in the test lists the identical 8 keys the patches use.
