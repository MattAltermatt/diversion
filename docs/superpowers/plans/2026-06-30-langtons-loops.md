# Langton's Loops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `langtons-loops`, a faithful 2D port of xscreensaver's `loop` (Langton's 1984 self-reproducing cellular automaton), with gallery-grade presentation and a quiescence→fade→reseed lifecycle so it watches well indefinitely.

**Architecture:** Structural analog of `src/diversions/demon/` — a 2D grid CA with a per-step `changed`-cell incremental repaint, `speed` (steps/sec) accumulator capped per frame, palette + preset groups, and `update`/`resize` hooks. Adds: a 219-rule rotate4 transition LUT (`rule.ts`), sheath+signal-hue-ring coloring with aged-coral dimming (`palette.ts`), and a RUNNING→HOLD→FADE→reseed lifecycle state machine (`loops.ts`). Square grid only; cells are plain `fillRect`s in CSS pixels (framework DPR-scales the 2D context).

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4 + Vitest. Reuses `framework/rng.ts` (`mulberry32`) and `diversions/demon/colorRing.ts`'s `buildHueRing` pattern (we add our own `palette.ts`).

**Spec:** `docs/superpowers/specs/2026-06-30-langtons-loops-design.md`

---

## File Structure

- Create `src/diversions/langtons-loops/rule.ts` — 219 base rules → rotate4-expanded `Uint8Array(32768)` LUT; `nextState(c,t,r,b,l)`.
- Create `src/diversions/langtons-loops/rule.test.ts`.
- Create `src/diversions/langtons-loops/schema.ts` — Zod schema (single source of truth).
- Create `src/diversions/langtons-loops/palette.ts` — state→color LUT (background, sheath, signal hue-ring) + `dimSheath(color, bucket)` aging ramp.
- Create `src/diversions/langtons-loops/palette.test.ts`.
- Create `src/diversions/langtons-loops/loops.ts` — sim state, seed planting, `stepLoops`, lifecycle state machine, `update`/`resize`.
- Create `src/diversions/langtons-loops/loops.test.ts`.
- Create `src/diversions/langtons-loops/presets.ts` — Palette preset group.
- Create `src/diversions/langtons-loops/index.ts` — `defineDiversion` (auto-registers via `import.meta.glob`).

No framework files change — the registry auto-discovers the new folder.

---

### Task 1: Transition rule engine (`rule.ts`)

The heart of the port. 219 canonical base rules, each `CTRBL→I` (Center, Top, Right, Bottom, Left → new center). `rotate4` symmetry: each base rule applies to all 4 cyclic rotations of the `(T,R,B,L)` neighbor tuple. Pack the lookup index as `idx = c | t<<3 | r<<6 | b<<9 | l<<12` (3 bits/state, 0..32767). Unknown neighborhoods default to state 0 (the `Uint8Array` zero-init + rule `000000`).

**Files:**
- Create: `src/diversions/langtons-loops/rule.ts`
- Test: `src/diversions/langtons-loops/rule.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/diversions/langtons-loops/rule.test.ts
import { describe, it, expect } from 'vitest'
import { nextState, RULE_TABLE } from './rule'

describe('Langton rule table', () => {
  it('keeps the empty neighborhood quiescent (rule 000000)', () => {
    expect(nextState(0, 0, 0, 0, 0)).toBe(0)
  })

  it('applies a known base transition (rule 000012: C0 T0 R0 B0 L1 -> 2)', () => {
    expect(nextState(0, 0, 0, 0, 1)).toBe(2)
  })

  it('is rotate4-symmetric: all 4 cyclic rotations of (T,R,B,L) give the same output', () => {
    // base (T,R,B,L) = (0,0,0,1) -> 2; cyclic rotations must also -> 2
    expect(nextState(0, 0, 0, 0, 1)).toBe(2) // T,R,B,L = 0,0,0,1
    expect(nextState(0, 1, 0, 0, 0)).toBe(2) // T,R,B,L = 1,0,0,0
    expect(nextState(0, 0, 1, 0, 0)).toBe(2) // T,R,B,L = 0,1,0,0
    expect(nextState(0, 0, 0, 1, 0)).toBe(2) // T,R,B,L = 0,0,1,0
  })

  it('applies another known transition (rule 113221: C1 T1 R3 B2 L2 -> 1)', () => {
    expect(nextState(1, 1, 3, 2, 2)).toBe(1)
  })

  it('builds a dense 32768-entry table', () => {
    expect(RULE_TABLE.length).toBe(32768)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/langtons-loops/rule.test.ts`
Expected: FAIL — `./rule` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/diversions/langtons-loops/rule.ts
// Langton's self-reproducing loops — the canonical 8-state, von Neumann,
// rotate4 transition rule. After xscreensaver's `loop` by David Bagley,
// implementing Christopher Langton's self-reproducing loops (1984). Rule set
// cross-checked byte-for-byte against Golly's `Langtons-Loops.table`.
// Clean-room TypeScript reimplementation (MIT); no GPL source copied.

// 219 base rules. Each is 6 digits: C T R B L I (Center, Top, Right, Bottom,
// Left -> new center). rotate4 symmetry is expanded at load time below.
const BASE_RULES = `
000000 000012 000020 000030 000050 000063 000071 000112 000122 000132
000212 000220 000230 000262 000272 000320 000525 000622 000722 001022
001120 002020 002030 002050 002125 002220 002322 005222 012321 012421
012525 012621 012721 012751 014221 014321 014421 014721 016251 017221
017255 017521 017621 017721 025271 100011 100061 100077 100111 100121
100211 100244 100277 100511 101011 101111 101244 101277 102026 102121
102211 102244 102263 102277 102327 102424 102626 102644 102677 102710
102727 105427 111121 111221 111244 111251 111261 111277 111522 112121
112221 112244 112251 112277 112321 112424 112621 112727 113221 122244
122277 122434 122547 123244 123277 124255 124267 125275 200012 200022
200042 200071 200122 200152 200212 200222 200232 200242 200250 200262
200272 200326 200423 200517 200522 200575 200722 201022 201122 201222
201422 201722 202022 202032 202052 202073 202122 202152 202212 202222
202272 202321 202422 202452 202520 202552 202622 202722 203122 203216
203226 203422 204222 205122 205212 205222 205521 205725 206222 206722
207122 207222 207422 207722 211222 211261 212222 212242 212262 212272
214222 215222 216222 217222 222272 222442 222462 222762 222772 300013
300022 300041 300076 300123 300421 300622 301021 301220 302511 401120
401220 401250 402120 402221 402326 402520 403221 500022 500215 500225
500232 500272 500520 502022 502122 502152 502220 502244 502722 512122
512220 512422 512722 600011 600021 602120 612125 612131 612225 700077
701120 701220 701250 702120 702221 702251 702321 702525 702720
`.trim().split(/\s+/)

const idx = (c: number, t: number, r: number, b: number, l: number): number =>
  c | (t << 3) | (r << 6) | (b << 9) | (l << 12)

/** Dense lookup: index packed from (C,T,R,B,L); value = new center state. */
export const RULE_TABLE: Uint8Array = (() => {
  const table = new Uint8Array(32768) // zero-init = unknown-neighborhood default
  for (const rule of BASE_RULES) {
    const c = +rule[0], i = +rule[5]
    // base neighbor tuple (T,R,B,L) and its 4 cyclic rotations
    const nb = [+rule[1], +rule[2], +rule[3], +rule[4]]
    for (let rot = 0; rot < 4; rot++) {
      const t = nb[(0 + rot) % 4], r = nb[(1 + rot) % 4]
      const b = nb[(2 + rot) % 4], l = nb[(3 + rot) % 4]
      table[idx(c, t, r, b, l)] = i
    }
  }
  return table
})()

/** New center state for a cell with center `c` and von Neumann neighbors. */
export const nextState = (c: number, t: number, r: number, b: number, l: number): number =>
  RULE_TABLE[idx(c, t, r, b, l)]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/langtons-loops/rule.test.ts`
Expected: PASS (5 tests). If the `113221` or `000012` assertions fail, the digit-position mapping is wrong — re-check `C T R B L I` order.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/langtons-loops/rule.ts src/diversions/langtons-loops/rule.test.ts
git commit -m "feat(langtons-loops): 219-rule rotate4 transition LUT"
```

---

### Task 2: Config schema (`schema.ts`)

Zod schema = single source of truth (form + URL codec + `Config` type). Model (B): background + sheath colors + a signal hue-ring group + scale/speed/seeds/seed. Sliders only where bounds exist (UX invariant #4); persistent `help` on every non-obvious field (invariant #3).

**Files:**
- Create: `src/diversions/langtons-loops/schema.ts`

- [ ] **Step 1: Write the schema (no separate unit test — covered by framework sweeps: `contract.test.ts`, `diversionMeta.test.ts`, `presetSweep.test.ts`, `urlKeys.test.ts`)**

```ts
// src/diversions/langtons-loops/schema.ts
import { z } from 'zod'

export const langtonsLoopsSchema = z.object({
  cellSize: z.number().int().min(2).max(12).default(4)
    .meta({ section: 'Field', ui: 'slider', min: 2, max: 12, step: 1, label: 'Cell size',
            help: 'Pixel size of each automaton cell. Small = many tiny loops filling the plane; large = a few bold colonies.' }),
  seeds: z.number().int().min(1).max(6).default(1)
    .meta({ section: 'Field', ui: 'slider', min: 1, max: 6, step: 1, label: 'Seed loops',
            help: 'How many starter loops are planted each generation. 1 = watch a single colony spread from the centre; more = multiple fronts, a faster, busier fill.' }),
  speed: z.number().min(2).max(20).default(8)
    .meta({ section: 'Motion', ui: 'slider', min: 2, max: 20, step: 1, label: 'Speed',
            help: 'Cellular-automaton steps per second. Low and slow is the zen default — you can follow a construction arm extending.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#06080d')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The empty-space colour (state 0) behind the loops.' }),
  sheath: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1f7a8c')
    .meta({ section: 'Color', ui: 'color', label: 'Sheath',
            help: 'Colour of the loop walls (state 2) — the structural "coral" you see everywhere.' }),
  signal: z.object({
    hueStart: z.number().min(0).max(360).default(40)
      .meta({ ui: 'slider', min: 0, max: 360, step: 1, label: 'Signal hue start',
              help: 'Where the signal colour ring begins on the hue wheel (degrees).' }),
    hueSpan: z.number().min(0).max(360).default(260)
      .meta({ ui: 'slider', min: 0, max: 360, step: 1, label: 'Signal hue span',
              help: 'How much of the hue wheel the six signal colours cover.' }),
    saturation: z.number().min(0).max(100).default(78)
      .meta({ ui: 'slider', min: 0, max: 100, step: 1, label: 'Signal saturation',
              help: 'Intensity of the signal colours coursing inside the loops.' }),
    lightness: z.number().min(0).max(100).default(66)
      .meta({ ui: 'slider', min: 0, max: 100, step: 1, label: 'Signal lightness',
              help: 'Brightness of the signals. Kept above the sheath so activity reads as the brightest thing on screen.' }),
  }).default({ hueStart: 40, hueSpan: 260, saturation: 78, lightness: 66 })
    .meta({ section: 'Color', ui: 'group', label: 'Signals' }),
  seed: z.number().int().default(42)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed',
            help: 'Any integer. The same seed regenerates the same loop orientations and reseed sequence.' }),
})

export type LangtonsLoopsConfig = z.infer<typeof langtonsLoopsSchema>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors in `schema.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/diversions/langtons-loops/schema.ts
git commit -m "feat(langtons-loops): config schema (single source of truth)"
```

---

### Task 3: Palette (`palette.ts`)

Maps the 8 states to colors: state 0 → background, state 2 → sheath, states 1,3,4,5,6,7 → six evenly-spaced hues from the signal ring (reusing the `buildHueRing` HSL approach). Plus `dimSheath` for aged-coral: dims the sheath color toward background as the age bucket rises.

**Files:**
- Create: `src/diversions/langtons-loops/palette.ts`
- Test: `src/diversions/langtons-loops/palette.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/diversions/langtons-loops/palette.test.ts
import { describe, it, expect } from 'vitest'
import { buildStateLut, AGE_BUCKETS } from './palette'
import { langtonsLoopsSchema } from './schema'

const cfg = langtonsLoopsSchema.parse({})

describe('Langton palette', () => {
  it('maps state 0 to background and state 2 to sheath', () => {
    const lut = buildStateLut(cfg)
    expect(lut[0]).toBe(cfg.background)
    expect(lut[2]).toBe(cfg.sheath)
  })

  it('gives the six signal states distinct, non-background colors', () => {
    const lut = buildStateLut(cfg)
    const signals = [1, 3, 4, 5, 6, 7].map((s) => lut[s])
    for (const c of signals) expect(c).not.toBe(cfg.background)
    expect(new Set(signals).size).toBe(6) // all distinct
  })

  it('exposes an aged-sheath ramp that darkens toward, but never past, background by the last bucket', () => {
    const lut = buildStateLut(cfg)
    // bucket 0 = freshly-active sheath = full sheath color
    expect(lut.agedSheath[0]).toBe(cfg.sheath)
    // ramp has AGE_BUCKETS entries and the last is dimmer (different) than the first
    expect(lut.agedSheath.length).toBe(AGE_BUCKETS)
    expect(lut.agedSheath[AGE_BUCKETS - 1]).not.toBe(cfg.sheath)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/langtons-loops/palette.test.ts`
Expected: FAIL — `./palette` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/diversions/langtons-loops/palette.ts
import { hslToRgb } from '../../framework/color'
import type { LangtonsLoopsConfig } from './schema'

/** Number of brightness steps in the aged-coral ramp (active -> settled-dim). */
export const AGE_BUCKETS = 8

/** Which non-background, non-sheath states are "signals" (in ring order). */
const SIGNAL_STATES = [1, 3, 4, 5, 6, 7] as const

const hex = (h: string) => ({
  r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16),
})
const rgb = (r: number, g: number, b: number) => `rgb(${r | 0},${g | 0},${b | 0})`

export interface StateLut {
  /** state index (0..7) -> CSS color. Index 2 is the *active* sheath color. */
  [state: number]: string
  /** aged-sheath ramp: bucket 0 = active sheath, last = most-settled (dim). */
  agedSheath: string[]
}

/** Build the state -> color lookup from config (model B: bg + sheath + signal ring). */
export function buildStateLut(cfg: LangtonsLoopsConfig): StateLut {
  const lut = {} as StateLut
  lut[0] = cfg.background
  lut[2] = cfg.sheath
  const { hueStart, hueSpan, saturation, lightness } = cfg.signal
  SIGNAL_STATES.forEach((state, i) => {
    const hue = hueStart + (hueSpan * i) / SIGNAL_STATES.length
    const { r, g, b } = hslToRgb(hue, saturation, lightness)
    lut[state] = rgb(r, g, b)
  })
  // aged-coral ramp: lerp sheath -> background across buckets, but stop at 65%
  // so settled coral stays visible (recessed, not gone).
  const s = hex(cfg.sheath), bg = hex(cfg.background)
  const agedSheath: string[] = []
  for (let k = 0; k < AGE_BUCKETS; k++) {
    const f = (k / (AGE_BUCKETS - 1)) * 0.65
    agedSheath.push(rgb(s.r + (bg.r - s.r) * f, s.g + (bg.g - s.g) * f, s.b + (bg.b - s.b) * f))
  }
  lut.agedSheath = agedSheath
  return lut
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/langtons-loops/palette.test.ts`
Expected: PASS (3 tests). Confirm `hslToRgb` exists in `src/framework/color.ts` (it backs `colorRing.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/langtons-loops/palette.ts src/diversions/langtons-loops/palette.test.ts
git commit -m "feat(langtons-loops): sheath+signal-ring palette with aged-coral ramp"
```

---

### Task 4: Sim core + lifecycle (`loops.ts`)

The grid, the CA step, seed planting, the `bornStep` aging field, and the RUNNING→HOLD→FADE→reseed state machine. Off-grid neighbors read as state 0 (bounded, non-toroidal). `changed` carries indices repainted incrementally each step.

**Files:**
- Create: `src/diversions/langtons-loops/loops.ts`
- Test: `src/diversions/langtons-loops/loops.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/diversions/langtons-loops/loops.test.ts
import { describe, it, expect } from 'vitest'
import { createLoopsState, stepLoops, SEED_W, SEED_H } from './loops'
import { langtonsLoopsSchema } from './schema'

const cfg = langtonsLoopsSchema.parse({})
// a canvas big enough for the 10x10 seed + room to grow
const mk = () => createLoopsState(cfg, 200, 200)

describe('Langton loops sim', () => {
  it('plants seed cells (the grid is not all empty after setup)', () => {
    const st = mk()
    let nonZero = 0
    for (let i = 0; i < st.cur.length; i++) if (st.cur[i] !== 0) nonZero++
    // the canonical 10x10 seed has well over 30 non-empty cells
    expect(nonZero).toBeGreaterThan(30)
    expect(SEED_W).toBe(10)
    expect(SEED_H).toBe(10)
  })

  it('is deterministic for a fixed seed', () => {
    const a = createLoopsState(cfg, 200, 200)
    const b = createLoopsState(cfg, 200, 200)
    for (let s = 0; s < 20; s++) { stepLoops(a); stepLoops(b) }
    expect(Array.from(a.cur)).toEqual(Array.from(b.cur))
  })

  it('actually evolves: the seed reproduces (grows past its initial live-cell count)', () => {
    const st = mk()
    let initialLive = 0
    for (let i = 0; i < st.cur.length; i++) if (st.cur[i] !== 0) initialLive++
    for (let s = 0; s < 120; s++) stepLoops(st)
    let laterLive = 0
    for (let i = 0; i < st.cur.length; i++) if (st.cur[i] !== 0) laterLive++
    expect(laterLive).toBeGreaterThan(initialLive) // the colony grew
  })

  it('records changed-cell indices each step for incremental repaint', () => {
    const st = mk()
    stepLoops(st)
    expect(st.changed.length).toBeGreaterThan(0)
  })

  it('reaches the HOLD phase once growth stalls in a tiny grid', () => {
    // a grid only a little bigger than the seed fills and goes quiescent fast
    const small = createLoopsState(cfg, 80, 80)
    let phase = small.phase
    for (let s = 0; s < 5000 && phase === 'running'; s++) { stepLoops(small); phase = small.phase }
    expect(small.phase).not.toBe('running') // transitioned out of running
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/langtons-loops/loops.test.ts`
Expected: FAIL — `./loops` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/diversions/langtons-loops/loops.ts
import { mulberry32 } from '../../framework/rng'
import type { Size } from '../../framework/types'
import type { LangtonsLoopsConfig } from './schema'
import { nextState } from './rule'

export const SEED_W = 10
export const SEED_H = 10

// Canonical 10x10 Langton seed (sheath square + circulating signals + arm).
const SEED: number[][] = [
  [0, 2, 2, 2, 2, 2, 2, 2, 2, 0],
  [2, 4, 0, 1, 4, 0, 1, 1, 1, 2],
  [2, 1, 2, 2, 2, 2, 2, 2, 1, 2],
  [2, 0, 2, 0, 0, 0, 0, 2, 1, 2],
  [2, 7, 2, 0, 0, 0, 0, 2, 7, 2],
  [2, 1, 2, 0, 0, 0, 0, 2, 0, 2],
  [2, 0, 2, 0, 0, 0, 0, 2, 1, 2],
  [2, 7, 2, 2, 2, 2, 2, 2, 7, 2],
  [2, 1, 0, 6, 1, 0, 7, 1, 0, 2],
  [0, 2, 2, 2, 2, 2, 2, 2, 2, 0],
]

export type Phase = 'running' | 'hold' | 'fade'

export interface LoopsState {
  cfg: LangtonsLoopsConfig
  w: number; h: number        // CSS pixels
  cols: number; rows: number  // grid dims
  cur: Uint8Array; next: Uint8Array
  bornStep: Int32Array        // step at which each cell last changed (for aging)
  changed: number[]
  step: number
  acc: number                 // sub-step accumulator (steps/sec)
  rng: () => number
  // lifecycle
  phase: Phase
  phaseTimer: number          // seconds remaining in hold/fade
  quietSteps: number
  needsClear: boolean
}

const QUIET_WINDOW = 90        // consecutive low-change steps -> quiescent
const MIN_STEPS = 200          // never declare quiescence before this many steps
const HOLD_SECONDS = 3
const FADE_SECONDS = 2

function gridDims(cfg: LangtonsLoopsConfig, w: number, h: number) {
  return { cols: Math.max(SEED_W, Math.floor(w / cfg.cellSize)), rows: Math.max(SEED_H, Math.floor(h / cfg.cellSize)) }
}

/** Rotate the 10x10 seed by 0/90/180/270 degrees (k quarter-turns). */
function rotatedSeed(k: number): number[][] {
  let g = SEED
  for (let n = 0; n < (k & 3); n++) {
    const r: number[][] = Array.from({ length: SEED_W }, () => new Array(SEED_H).fill(0))
    for (let y = 0; y < SEED_H; y++) for (let x = 0; x < SEED_W; x++) r[x][SEED_H - 1 - y] = g[y][x]
    g = r
  }
  return g
}

/** Plant one seed loop with top-left at (ox,oy) in a random orientation. */
function plantSeed(st: LoopsState, ox: number, oy: number): void {
  const g = rotatedSeed(Math.floor(st.rng() * 4))
  for (let y = 0; y < SEED_H; y++) {
    for (let x = 0; x < SEED_W; x++) {
      const gx = ox + x, gy = oy + y
      if (gx < 0 || gy < 0 || gx >= st.cols || gy >= st.rows) continue
      const i = gy * st.cols + gx
      st.cur[i] = g[y][x]
      st.bornStep[i] = 0
    }
  }
}

/** Clear the grid and plant `cfg.seeds` loops (1 = centre; >1 = scattered). */
function seedGrid(st: LoopsState): void {
  st.cur.fill(0); st.bornStep.fill(0)
  st.step = 0; st.quietSteps = 0
  const n = st.cfg.seeds
  if (n === 1) {
    plantSeed(st, ((st.cols - SEED_W) >> 1), ((st.rows - SEED_H) >> 1))
  } else {
    for (let s = 0; s < n; s++) {
      const ox = Math.floor(st.rng() * Math.max(1, st.cols - SEED_W))
      const oy = Math.floor(st.rng() * Math.max(1, st.rows - SEED_H))
      plantSeed(st, ox, oy)
    }
  }
}

export function createLoopsState(cfg: LangtonsLoopsConfig, w: number, h: number): LoopsState {
  const { cols, rows } = gridDims(cfg, w, h)
  const st: LoopsState = {
    cfg, w, h, cols, rows,
    cur: new Uint8Array(cols * rows), next: new Uint8Array(cols * rows),
    bornStep: new Int32Array(cols * rows),
    changed: [], step: 0, acc: 0,
    rng: mulberry32(cfg.seed >>> 0),
    phase: 'running', phaseTimer: 0, quietSteps: 0, needsClear: true,
  }
  seedGrid(st)
  return st
}

/** One synchronous CA generation. Fills `changed`; advances the lifecycle. */
export function stepLoops(st: LoopsState): void {
  if (st.phase !== 'running') return
  const { cur, next, cols, rows } = st
  const changed = st.changed
  changed.length = 0
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      const c = cur[i]
      const t = y > 0 ? cur[i - cols] : 0
      const b = y < rows - 1 ? cur[i + cols] : 0
      const l = x > 0 ? cur[i - 1] : 0
      const r = x < cols - 1 ? cur[i + 1] : 0
      const nv = nextState(c, t, r, b, l)
      next[i] = nv
      if (nv !== c) { changed.push(i); st.bornStep[i] = st.step + 1 }
    }
  }
  st.cur = next; st.next = cur
  st.step++
  // quiescence: a step that changes < 0.1% of cells (min 1) counts as "quiet"
  const quietThreshold = Math.max(1, Math.floor(cur.length * 0.001))
  if (changed.length <= quietThreshold) st.quietSteps++
  else st.quietSteps = 0
  if (st.step >= MIN_STEPS && st.quietSteps >= QUIET_WINDOW) {
    st.phase = 'hold'; st.phaseTimer = HOLD_SECONDS
  }
}

/** Advance the hold/fade timers (called from `frame` with real dt seconds). */
export function tickLifecycle(st: LoopsState, dtSeconds: number): void {
  if (st.phase === 'running') return
  st.phaseTimer -= dtSeconds
  if (st.phaseTimer > 0) return
  if (st.phase === 'hold') { st.phase = 'fade'; st.phaseTimer = FADE_SECONDS; return }
  if (st.phase === 'fade') {
    seedGrid(st)
    st.phase = 'running'
    st.needsClear = true
  }
}

/** 0..1 fade-to-background progress during the FADE phase (0 elsewhere). */
export function fadeAlpha(st: LoopsState): number {
  if (st.phase !== 'fade') return 0
  return 1 - Math.max(0, st.phaseTimer) / FADE_SECONDS
}

/** Live-apply tunables; return false to force structural teardown + setup. */
export function updateLoopsState(st: LoopsState, cfg: LangtonsLoopsConfig, _size: Size): boolean {
  if (cfg.cellSize !== st.cfg.cellSize || cfg.seeds !== st.cfg.seeds || cfg.seed !== st.cfg.seed) {
    return false // structural: grid geometry / seed layout changed
  }
  st.cfg = cfg          // color-only change
  st.needsClear = true  // repaint whole field with new palette next frame
  return true
}

export function resizeLoopsState(st: LoopsState, size: Size): void {
  Object.assign(st, createLoopsState(st.cfg, size.width, size.height))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/langtons-loops/loops.test.ts`
Expected: PASS (5 tests). The growth test (`120` steps) confirms reproduction; if it fails, the rule table or neighbor order (`nextState(c,t,r,b,l)`) is mismatched — Top=above (`i-cols`), Bottom=below (`i+cols`), Left=`i-1`, Right=`i+1`.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/langtons-loops/loops.ts src/diversions/langtons-loops/loops.test.ts
git commit -m "feat(langtons-loops): grid sim, seed planting, quiescence/hold/fade/reseed lifecycle"
```

---

### Task 5: Presets (`presets.ts`)

A single Palette preset group: Reef (default look), Bone, Ink, Nocturne. Each patches the whole `signal` group (nested → must be supplied whole) plus `background`/`sheath`.

**Files:**
- Create: `src/diversions/langtons-loops/presets.ts`

- [ ] **Step 1: Write it**

```ts
// src/diversions/langtons-loops/presets.ts
import type { PresetOption } from '../../framework/types'
import type { LangtonsLoopsConfig } from './schema'

type Sig = LangtonsLoopsConfig['signal']

export const palettePresets: PresetOption<LangtonsLoopsConfig>[] = [
  { name: 'Reef', patch: { background: '#06080d', sheath: '#1f7a8c',
      signal: { hueStart: 40, hueSpan: 260, saturation: 78, lightness: 66 } as Sig } },
  { name: 'Bone', patch: { background: '#0b0e14', sheath: '#e8e2d0',
      signal: { hueStart: 190, hueSpan: 150, saturation: 38, lightness: 62 } as Sig } },
  { name: 'Ink', patch: { background: '#f4f1e8', sheath: '#3a4252',
      signal: { hueStart: 200, hueSpan: 160, saturation: 45, lightness: 48 } as Sig } },
  { name: 'Nocturne', patch: { background: '#0a0a1f', sheath: '#5a7fd6',
      signal: { hueStart: 170, hueSpan: 90, saturation: 70, lightness: 64 } as Sig } },
]
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/diversions/langtons-loops/presets.ts
git commit -m "feat(langtons-loops): Reef/Bone/Ink/Nocturne palette presets"
```

---

### Task 6: Diversion entry + rendering (`index.ts`)

Wires the contract. `frame`: advance the step accumulator (capped per frame), step the sim, repaint `changed` cells incrementally; run a throttled (~2 Hz) aged-coral pass that re-dims inert sheath cells; tick the lifecycle and draw a fade-to-background overlay during FADE. `needsClear` triggers a full repaint (setup, palette change, post-reseed).

**Files:**
- Create: `src/diversions/langtons-loops/index.ts`

- [ ] **Step 1: Write it**

```ts
// src/diversions/langtons-loops/index.ts
// Langton's Loops — clean-room port of xscreensaver's `loop` by David Bagley,
// implementing Christopher Langton's self-reproducing loops (1984). Faithful
// 8-state / von-Neumann / rotate4 mechanic; gallery-grade presentation
// (sheath + signal-hue-ring palette, aged coral, breathing reseed lifecycle).
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { langtonsLoopsSchema, type LangtonsLoopsConfig } from './schema'
import { buildStateLut, AGE_BUCKETS, type StateLut } from './palette'
import { palettePresets } from './presets'
import {
  createLoopsState, stepLoops, tickLifecycle, fadeAlpha,
  updateLoopsState, resizeLoopsState, type LoopsState,
} from './loops'

const MAX_STEPS_PER_FRAME = 4
const AGE_PASS_HZ = 2                 // throttle the aged-coral repaint
const AGE_BUCKET_STEPS = 24           // CA steps per age bucket (~3s/bucket at 8/s)

interface RenderState extends LoopsState {
  lut: StateLut
  ageAcc: number                      // seconds since last age pass
  bucketOf: Uint8Array                // last-painted age bucket per cell
}

const presets: PresetGroup<LangtonsLoopsConfig>[] = [
  { label: 'Palette', options: palettePresets },
]

function cellColor(rs: RenderState, i: number): string {
  const s = rs.cur[i]
  if (s === 2) {
    const age = rs.step - rs.bornStep[i]
    const bucket = Math.min(AGE_BUCKETS - 1, Math.max(0, Math.floor(age / AGE_BUCKET_STEPS)))
    return rs.lut.agedSheath[bucket]
  }
  return rs.lut[s]
}

function paintCell(rs: RenderState, ctx: CanvasRenderingContext2D, i: number): void {
  const cs = rs.cfg.cellSize
  const x = (i % rs.cols) * cs, y = Math.floor(i / rs.cols) * cs
  ctx.fillStyle = cellColor(rs, i)
  ctx.fillRect(x, y, cs, cs)
}

function paintAll(rs: RenderState, ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = rs.cfg.background
  ctx.fillRect(0, 0, rs.w, rs.h)
  for (let i = 0; i < rs.cur.length; i++) {
    if (rs.cur[i] !== 0) paintCell(rs, ctx, i)
    const age = rs.step - rs.bornStep[i]
    rs.bucketOf[i] = Math.min(AGE_BUCKETS - 1, Math.max(0, Math.floor(age / AGE_BUCKET_STEPS)))
  }
  rs.needsClear = false
}

const langtonsLoops = defineDiversion<typeof langtonsLoopsSchema, RenderState, '2d'>({
  id: 'langtons-loops',
  title: "Langton's Loops",
  description:
    'Christopher Langton’s self-reproducing loops (1984): a looped organism extends a '
    + 'construction arm and buds off copies, colonising the plane. After xscreensaver’s '
    + '“loop” by David Bagley.',
  kind: '2d',
  schema: langtonsLoopsSchema,
  presets,

  setup(ctx, config, size) {
    const base = createLoopsState(config, size.width, size.height)
    const rs: RenderState = Object.assign(base, {
      lut: buildStateLut(config), ageAcc: 0,
      bucketOf: new Uint8Array(base.cur.length),
    })
    paintAll(rs, ctx)
    return rs
  },

  frame(rs, ctx, _t, dt) {
    const dts = dt / 1000
    if (rs.needsClear) { rs.lut = buildStateLut(rs.cfg); paintAll(rs, ctx) }

    // advance CA steps (capped)
    rs.acc += rs.cfg.speed * dts
    let steps = Math.floor(rs.acc); rs.acc -= steps
    if (steps > MAX_STEPS_PER_FRAME) steps = MAX_STEPS_PER_FRAME
    for (let s = 0; s < steps; s++) {
      stepLoops(rs)
      for (let c = 0; c < rs.changed.length; c++) paintCell(rs, ctx, rs.changed[c])
    }

    // throttled aged-coral pass: re-dim inert sheath cells whose bucket advanced
    rs.ageAcc += dts
    if (rs.ageAcc >= 1 / AGE_PASS_HZ) {
      rs.ageAcc = 0
      for (let i = 0; i < rs.cur.length; i++) {
        if (rs.cur[i] !== 2) continue
        const age = rs.step - rs.bornStep[i]
        const bucket = Math.min(AGE_BUCKETS - 1, Math.max(0, Math.floor(age / AGE_BUCKET_STEPS)))
        if (bucket !== rs.bucketOf[i]) { rs.bucketOf[i] = bucket; paintCell(rs, ctx, i) }
      }
    }

    // lifecycle: hold -> fade (overlay) -> reseed
    tickLifecycle(rs, dts)
    const a = fadeAlpha(rs)
    if (a > 0) {
      ctx.fillStyle = rs.cfg.background
      ctx.globalAlpha = Math.min(1, a)
      ctx.fillRect(0, 0, rs.w, rs.h)
      ctx.globalAlpha = 1
    }
  },

  resize(rs, size) {
    resizeLoopsState(rs, size)
    rs.lut = buildStateLut(rs.cfg)
    rs.bucketOf = new Uint8Array(rs.cur.length)
    rs.ageAcc = 0
    rs.needsClear = true
  },

  update(rs, config, size) {
    const live = updateLoopsState(rs, config, size)
    if (live) rs.lut = buildStateLut(config)
    return live
  },
})

export default langtonsLoops
```

- [ ] **Step 2: Typecheck + full suite + framework sweeps**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npx vitest run`
Expected: PASS — including the framework auto-discovery sweeps that now see the new diversion:
`contract.test.ts` (contract shape), `diversionMeta.test.ts` (every field has label/help; sliders have bounds), `presetSweep.test.ts` (preset patches are valid config subsets), `codecSweep.test.ts` + `urlKeys.test.ts` (URL codec round-trips every field, leaf keys unique). If `urlKeys` fails on a non-unique leaf (`hueStart`/`saturation`/etc. collide with another diversion's `signal`/`color` group), it falls back to the dotted path automatically — only a hard duplicate of a *flat* key fails; resolve by confirming the guard test's expectation.

- [ ] **Step 3: Commit**

```bash
git add src/diversions/langtons-loops/index.ts
git commit -m "feat(langtons-loops): diversion entry, incremental render, aged coral, fade overlay"
```

---

### Task 7: Verify in Chrome (manual, separate task)

Not a code change — a verification gate (REQUIRED before review/merge per project conventions).

- [ ] **Step 1: Start the dev server (background) on the pinned port**

Run: `npm run dev` (background). Server is pinned to **:5180** (`vite.config.ts`).

- [ ] **Step 2: Open the diversion in Chrome (chrome-devtools MCP, NOT a built-in preview)**

URL (on its own line, muted — ambient piece, no audio but keep the convention):
`http://localhost:5180/diversion/d/langtons-loops/play?mute=1`

Also open the config screen: `http://localhost:5180/diversion/d/langtons-loops`

- [ ] **Step 3: Confirm it actually looks good (not just renders)**

Checklist:
- A single loop at centre extends an arm, turns, and **buds a daughter loop** — reproduction is visible within ~10–20s.
- The colony grows outward; the frontier reads as **alive**, the filled interior **recedes** (aged coral dims).
- Signals (warm→cool) are legible coursing inside the sheath walls; contrast is strong on the dark bg.
- When growth stalls: ~3s **hold** on the finished coral, ~2s **fade**, then a fresh centre loop — no jarring pop.
- Console is **clean** (no errors/warnings) — check via MCP `list_console_messages`.
- Config: each slider moves live; changing `cellSize`/`seeds` re-seeds (structural), color changes apply live; **presets** (Reef/Bone/Ink/Nocturne) all read well; the **share link** reproduces the exact look.

- [ ] **Step 4: Capture a screenshot for the record**

Use MCP `take_screenshot` mid-growth; note the path for the user (CLI can't inline images).

---

### Task 8: Code review + perf review (separate task)

- [ ] **Step 1: Dispatch the project reviewers (required review phase, no implementation bias)**

Dispatch `diversion-reviewer` (UX invariants, schema-as-SSOT, codec keystone) and `perf-analyzer` (per-frame allocations in `frame`/`paintAll`, the 2 Hz age-pass cost, no leaked resources) against the branch diff.

- [ ] **Step 2: Triage findings, fix mediums inline, commit fixes.**

---

### Task 9: Ship (separate task — gated on user verify)

- [ ] **Step 1: Update docs** — README diversion list/count; close-out note in spec; ensure `whats-next`/memory queue reflect the new ship.
- [ ] **Step 2: Hand off to the user for manual verify** (user-verify-before-FF-merge gate). Surface the URL + what to look at; wait for explicit approval.
- [ ] **Step 3: On approval** — squash → FF-merge `main` → delete branch (both ends) → push → GH-Pages deploy → live-validate `/diversion/d/langtons-loops/play` → close #111.

---

## Self-Review

**Spec coverage:**
- Mechanic (8-state/vonNeumann/rotate4/219 rules/seed/default-0) → Task 1 + Task 4. ✓
- Color model B (bg + sheath + signal ring) → Task 3 (`buildStateLut`) + Task 2 (schema). ✓
- Presets Reef/Bone/Ink/Nocturne → Task 5. ✓
- cellSize 4 / speed 8 / seeds → Task 2 defaults. ✓
- Color mode Solid (no glow) → Task 6 paints solid cells; glow correctly omitted (backlog). ✓
- Lifecycle quiescence→hold→fade→reseed → Task 4 (`stepLoops`/`tickLifecycle`/`fadeAlpha`). ✓
- Aged coral (throttled 2 Hz, bucketed) → Task 3 (`agedSheath` ramp) + Task 6 (age-pass). ✓
- Credit (description + source comment) → Task 1 + Task 6 headers, Task 6 `description`. ✓
- Tests: rule rotate4 + known transitions, seed determinism, reproduction-grows, quiescence trigger, palette mapping → Tasks 1/3/4. ✓
- Verify in Chrome / reviewers / ship → Tasks 7/8/9. ✓

**Placeholder scan:** none — every code step is complete; the 219 rules are embedded verbatim.

**Type consistency:** `LoopsState`/`RenderState` (RenderState extends LoopsState), `StateLut` (indexable + `agedSheath`), `nextState(c,t,r,b,l)`, `buildStateLut(cfg)`, `createLoopsState`/`stepLoops`/`tickLifecycle`/`fadeAlpha`/`updateLoopsState`/`resizeLoopsState`, `SEED_W`/`SEED_H`, `AGE_BUCKETS` — all defined where first used and referenced consistently. `PresetOption`/`PresetGroup` imported from `framework/types`. ✓

**Risk note:** the only behavioral unknown is whether the bounded (non-toroidal) finite grid reproduces correctly with the canonical seed at edges — covered by the Task 4 reproduction test (120 steps must grow) and the Chrome verify. If reproduction stalls immediately, re-check neighbor order and the `rotate4` cyclic-shift direction in Task 1.
