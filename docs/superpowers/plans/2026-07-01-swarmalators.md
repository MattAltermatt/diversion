# Swarmalators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `webgpu` "Swarmalators" diversion (#215) — self-propelled particles that swarm in space and sync in phase, rendering the iconic rotating rainbow ring.

**Architecture:** Clone the `particle-life-gpu` five-file seam (`schema`/`pack`/`gpu`/`index`/`presets` + tests). Free-space first-order all-pairs sim (O'Keeffe–Hong–Strogatz 2017): two-pass compute (forces→integrate), per-particle phase, color-from-phase fragment shader, persistent-accumulation trail + two-layer glow reused verbatim. No toroidal wrap, no matrix, no reconcile hook.

**Tech Stack:** WebGPU/WGSL, TypeScript, Zod 4 schema, Vitest (jsdom). Reference file to mirror throughout: `src/diversions/particle-life-gpu/{schema,pack,gpu,index,presets}.ts`.

**Spec:** `docs/superpowers/specs/2026-07-01-swarmalators-design.md`

---

## File Structure

```text
src/diversions/swarmalators/
  schema.ts        Zod schema = single source of truth (form + codec + Config type)
  pack.ts          PURE CPU seeding + uniform/storage byte layout (jsdom-testable)
  gpu.ts           WGSL compute (2-pass) + render (glow+trail) + init/run/resize/write/dispose
  index.ts         defineDiversion: ready-flag async setup, zoom/pan, live-apply update()
  presets.ts       one PresetGroup "State" — the five canonical (J,K) states
  pack.test.ts     seed determinism + byte layouts
  schema.test.ts   field metadata + seed pin
  presets.test.ts  the five states' coordinates
  liveApply.test.ts  update() live vs structural routing
```

`gpu.ts` has no unit test (WGSL needs a real GPU, absent in CI) — it is covered by the framework `diversionSmoke` sweep (which mocks the context) + the required Chrome verify.

**Execution mode:** Tasks 1–3 (pure logic/tests) are subagent-friendly. Tasks 4–6 (WGSL, lifecycle, Chrome verify) are **lead-inline** — they need `navigator.gpu` reasoning and the chrome-devtools MCP that subagents lack. Recommended split: lead does Task 1 inline to lock the pack shape, then 2–3 can fan to subagents, 4–7 lead-inline.

---

### Task 1: `pack.ts` — pure CPU seeding + byte layouts

**Files:**
- Create: `src/diversions/swarmalators/pack.ts`
- Test: `src/diversions/swarmalators/pack.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/diversions/swarmalators/pack.test.ts
import { describe, it, expect } from 'vitest'
import { seedWorld, packParams, packView, PARAMS_SIZE, VIEW_SIZE, DT, EPS, VIEW_RADIUS, DEFAULT_CAMERA } from './pack'

describe('seedWorld', () => {
  it('is deterministic for a given seed and byte-identical on re-seed', () => {
    const a = seedWorld(500, 42)
    const b = seedWorld(500, 42)
    expect(a.pos).toEqual(b.pos)
    expect(a.phase).toEqual(b.phase)
    expect(a.omega).toEqual(b.omega)
  })
  it('a different seed gives a different world', () => {
    const a = seedWorld(500, 1)
    const b = seedWorld(500, 2)
    expect(a.pos).not.toEqual(b.pos)
  })
  it('seeds positions in [-1,1], phases in [-PI,PI), and the right lengths', () => {
    const n = 1000
    const { pos, phase, vel, phaseVel, omega } = seedWorld(n, 7)
    expect(pos.length).toBe(n * 2)
    expect(vel.length).toBe(n * 2)
    expect(phase.length).toBe(n)
    expect(phaseVel.length).toBe(n)
    expect(omega.length).toBe(n)
    for (let i = 0; i < pos.length; i++) { expect(pos[i]).toBeGreaterThanOrEqual(-1); expect(pos[i]).toBeLessThanOrEqual(1) }
    for (let i = 0; i < n; i++) { expect(phase[i]).toBeGreaterThanOrEqual(-Math.PI); expect(phase[i]).toBeLessThan(Math.PI) }
    expect(Array.from(vel)).toEqual(new Array(n * 2).fill(0))
    expect(Array.from(phaseVel)).toEqual(new Array(n).fill(0))
  })
})

describe('packParams', () => {
  it('lays out N, invN, J, K, dt, eps, omegaSpread little-endian', () => {
    const buf = packParams({ count: 1000, J: 1, K: -0.75, omegaSpread: 0.3 })
    expect(buf.byteLength).toBe(PARAMS_SIZE)
    const dv = new DataView(buf)
    expect(dv.getUint32(0, true)).toBe(1000)
    expect(dv.getFloat32(4, true)).toBeCloseTo(1 / 1000, 6) // invN
    expect(dv.getFloat32(8, true)).toBeCloseTo(1)     // J
    expect(dv.getFloat32(12, true)).toBeCloseTo(-0.75) // K
    expect(dv.getFloat32(16, true)).toBeCloseTo(DT)
    expect(dv.getFloat32(20, true)).toBeCloseTo(EPS)
    expect(dv.getFloat32(24, true)).toBeCloseTo(0.3)  // omegaSpread
  })
})

describe('packView', () => {
  it('centers on origin, fits VIEW_RADIUS to the min screen dim, and encodes colorMap', () => {
    const buf = packView({ dotSize: 2.5, colorMap: 'Sinebow' }, { width: 800, height: 600 }, 1, DEFAULT_CAMERA)
    expect(buf.byteLength).toBe(VIEW_SIZE)
    const dv = new DataView(buf)
    // scale = (minDim/2 * 0.9 / VIEW_RADIUS) * zoom(1); centerX/Y = 0 + pan(0)
    const expScale = (600 / 2 * 0.9 / VIEW_RADIUS)
    expect(dv.getFloat32(0, true)).toBeCloseTo(expScale, 3)
    expect(dv.getFloat32(4, true)).toBeCloseTo(0) // centerX
    expect(dv.getFloat32(8, true)).toBeCloseTo(0) // centerY
    expect(dv.getUint32(28, true)).toBe(1) // colorMap index: Sinebow → 1
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/swarmalators/pack.test.ts`
Expected: FAIL — cannot resolve `./pack`.

- [ ] **Step 3: Write `pack.ts`**

```typescript
// pack.ts — PURE, GPU-agnostic seams of the swarmalator sim: seed the world on the CPU
// (bit-exact reproducible) and lay out the bytes uploaded into GPU buffers. No WebGPU
// calls → fully unit-testable under jsdom. gpu.ts does nothing but createBuffer +
// writeBuffer these. Mirrors particle-life-gpu/pack.ts, minus the toroidal world and
// per-species palette (color is per-particle from phase, computed in the shader).
//
// Model: O'Keeffe–Hong–Strogatz 2017 (arXiv:1701.05670). Free space, first-order.
import { mulberry32 } from '../../framework/rng'
import { parseHex6 } from '../../framework/color'

// The swarm self-confines (COM conserved) to a disk of radius ≈1; initial conditions
// are a centered box [-1,1]². A fixed view radius of 1.6 shows every state with margin.
export const VIEW_RADIUS = 1.6
export const DT = 0.02 // fixed step; `speed` runs N steps/frame, never changes the outcome
export const EPS = 0.01 // softening on the 1/r & 1/r² denominators — REQUIRED for fixed-step
                        // Euler stability (papers use adaptive solvers; realtime GPU cannot).
const TAU = Math.PI * 2

export const COLOR_MAPS = ['Spectrum', 'Sinebow', 'Pastel'] as const
export type ColorMap = (typeof COLOR_MAPS)[number]
export const colorMapIndex = (m: ColorMap): number => Math.max(0, COLOR_MAPS.indexOf(m))

export interface Camera { zoom: number; panX: number; panY: number }
export const DEFAULT_CAMERA: Camera = { zoom: 1, panX: 0, panY: 0 }

export interface SeededWorld {
  pos: Float32Array      // interleaved x,y (2*n) → array<vec2f>, uniform in [-1,1]²
  phase: Float32Array    // per particle (n), uniform in [-PI,PI)
  vel: Float32Array      // interleaved vx,vy (2*n), zeroed at genesis
  phaseVel: Float32Array // per particle (n), zeroed
  omega: Float32Array    // per-particle base natural frequency ~ N(0,1), seeded
}

/** Box-Muller standard normal from two uniforms. */
function gaussian(rng: () => number): number {
  const u = Math.max(1e-12, rng())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rng())
}

/** Seed positions (uniform box), phases (uniform circle), base natural frequencies
 *  (unit normal). Salt is swarmalator-specific so it never collides with other pieces. */
export function seedWorld(count: number, seed: number): SeededWorld {
  const pos = new Float32Array(count * 2)
  const phase = new Float32Array(count)
  const vel = new Float32Array(count * 2)
  const phaseVel = new Float32Array(count)
  const omega = new Float32Array(count)
  const rng = mulberry32((seed ^ 0x5w4c) >>> 0) // NB: replaced below with a valid hex
  for (let i = 0; i < count; i++) {
    pos[i * 2] = rng() * 2 - 1
    pos[i * 2 + 1] = rng() * 2 - 1
    phase[i] = rng() * TAU - Math.PI
    omega[i] = gaussian(rng)
  }
  return { pos, phase, vel, phaseVel, omega }
}

// --- uniform buffer byte layouts (little-endian via DataView; struct rounds to 16) ---

export const PARAMS_SIZE = 32 // 7×4 = 28 → round up to 16 = 32

/** Compute-shader params. invN precomputed so the shader stays divide-light. */
export function packParams(
  cfg: { count: number; J: number; K: number; omegaSpread: number },
): ArrayBuffer {
  const buf = new ArrayBuffer(PARAMS_SIZE)
  const dv = new DataView(buf)
  dv.setUint32(0, cfg.count, true)
  dv.setFloat32(4, 1 / Math.max(1, cfg.count), true) // invN
  dv.setFloat32(8, cfg.J, true)
  dv.setFloat32(12, cfg.K, true)
  dv.setFloat32(16, DT, true)
  dv.setFloat32(20, EPS, true)
  dv.setFloat32(24, cfg.omegaSpread, true)
  return buf
}

export const VIEW_SIZE = 48 // 10×4 = 40 → round up to 16 = 48

/** Render view uniform. World is origin-centered; scale fits VIEW_RADIUS into 90% of the
 *  min screen half-dimension, times the camera zoom. Pan shifts the center in world units. */
export function packView(
  cfg: { dotSize: number; colorMap: ColorMap },
  size: { width: number; height: number },
  dpr: number,
  cam: Camera,
): ArrayBuffer {
  const fit = (Math.min(size.width, size.height) / 2) * 0.9 / VIEW_RADIUS
  const scale = fit * cam.zoom
  const core = cfg.dotSize * dpr * 1.3
  const halo = Math.max(8, cfg.dotSize * 7) * 0.5 * dpr
  const buf = new ArrayBuffer(VIEW_SIZE)
  const dv = new DataView(buf)
  dv.setFloat32(0, scale, true)
  dv.setFloat32(4, cam.panX, true)  // centerX (world)
  dv.setFloat32(8, cam.panY, true)  // centerY (world)
  dv.setFloat32(12, size.width, true)
  dv.setFloat32(16, size.height, true)
  dv.setFloat32(20, core, true)
  dv.setFloat32(24, halo, true)
  dv.setUint32(28, colorMapIndex(cfg.colorMap), true)
  return buf
}

/** bg rgb (0..1) parsed from a #hex6, for the trail-fade uniform + clear value. */
export function parseBg(hex: string): { r: number; g: number; b: number } {
  const { r, g, b } = parseHex6(hex)
  return { r: r / 255, g: g / 255, b: b / 255 }
}
```

> ⚠️ **Fix before running:** the RNG salt above contains a placeholder `0x5w4c` (not valid hex — it documents intent). Replace with a real 32-bit salt: `mulberry32((seed ^ 0x53_77_61_72) >>> 0)` (ASCII "Swar"). Use exactly `0x53776172`.

- [ ] **Step 4: Correct the salt and run tests**

Edit the `rng` line to: `const rng = mulberry32((seed ^ 0x53776172) >>> 0)`
Run: `npx vitest run src/diversions/swarmalators/pack.test.ts`
Expected: PASS (7 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/swarmalators/pack.ts src/diversions/swarmalators/pack.test.ts
git commit -m "feat(swarmalators): pure CPU seed + byte layouts"
```

---

### Task 2: `schema.ts` — single source of truth

**Files:**
- Create: `src/diversions/swarmalators/schema.ts`
- Test: `src/diversions/swarmalators/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// schema.test.ts
import { describe, it, expect } from 'vitest'
import { swarmalatorsSchema } from './schema'

describe('swarmalatorsSchema', () => {
  const shape = swarmalatorsSchema.shape
  it('every field carries a label and help', () => {
    for (const [key, field] of Object.entries(shape)) {
      const meta = (field as any).meta?.()
      expect(meta?.label, `${key} label`).toBeTruthy()
      expect(meta?.help, `${key} help`).toBeTruthy()
    }
  })
  it('slider fields define min/max/step', () => {
    for (const [key, field] of Object.entries(shape)) {
      const meta = (field as any).meta?.()
      if (meta?.ui === 'slider') {
        expect(typeof meta.min, `${key} min`).toBe('number')
        expect(typeof meta.max, `${key} max`).toBe('number')
        expect(typeof meta.step, `${key} step`).toBe('number')
      }
    }
  })
  it('seed is pin-only (randomizeOnFreshLoad)', () => {
    expect((shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
  })
  it('defaults to the Active phase wave coupling', () => {
    const cfg = swarmalatorsSchema.parse({})
    expect(cfg.J).toBe(1)
    expect(cfg.K).toBe(-0.75)
    expect(cfg.omegaSpread).toBe(0)
    expect(cfg.colorMap).toBe('Spectrum')
  })
})
```

- [ ] **Step 2: Run test → FAIL** (`Cannot find module './schema'`).

Run: `npx vitest run src/diversions/swarmalators/schema.test.ts`

- [ ] **Step 3: Write `schema.ts`**

```typescript
// schema.ts — single source of truth (form + URL codec + Config type) for Swarmalators.
// Two live knobs J,K sweep the five collective states; colour is per-particle from phase.
import { z } from 'zod'
import { COLOR_MAPS } from './pack'

export const swarmalatorsSchema = z.object({
  count: z.number().int().min(500).max(16000).default(3000)
    .meta({ section: 'Swarm', ui: 'slider', min: 500, max: 16000, step: 500, label: 'Particles',
            help: 'How many swarmalators fill the field. The coupling is all-pairs, so the GPU works hardest here — 3000 stays smooth; push higher for a denser, glossier ring.' }),

  J: z.number().min(-1).max(1).default(1)
    .meta({ section: 'Coupling', ui: 'slider', min: -1, max: 1, step: 0.05, label: 'Phase → space (J)',
            help: 'How strongly a particle prefers to sit near others of a SIMILAR phase (colour). High J sorts colours into a smooth wheel; the rainbow-ring states all live at J≈1.' }),
  K: z.number().min(-1).max(1).default(-0.75)
    .meta({ section: 'Coupling', ui: 'slider', min: -1, max: 1, step: 0.05, label: 'Phase sync (K)',
            help: 'How strongly neighbours pull each other into the SAME phase. K>0 syncs to one colour; the interesting swarming states are at K≤0, where space and phase fight and the ring comes alive.' }),
  omegaSpread: z.number().min(0).max(1).default(0)
    .meta({ section: 'Coupling', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Shimmer',
            help: 'Gives each particle its own natural rhythm. 0 = the pure model. Turn it up to keep even the frozen states shimmering in colour — a gentle life for the static presets.' }),

  colorMap: z.enum(COLOR_MAPS).default('Spectrum')
    .meta({ section: 'Look', ui: 'segmented', options: [...COLOR_MAPS], label: 'Colour wheel',
            help: 'Maps phase → colour on a seamless cyclic wheel. Spectrum is a perceptually-even rainbow; Sinebow is punchier; Pastel is soft and dreamy.' }),
  dotSize: z.number().min(1).max(5).default(2.5)
    .meta({ section: 'Look', ui: 'slider', min: 1, max: 5, step: 0.5, label: 'Particle size',
            help: 'Radius of each particle in pixels.' }),
  glow: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Glow',
            help: 'Render soft luminous blobs that bloom where they overlap. Off = crisp flat dots.' }),
  trailFade: z.number().min(0).max(0.6).default(0.12)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 0.6, step: 0.01, label: 'Trail length',
            help: 'How slowly the previous frame fades. Higher = longer, dreamier trails as the ring rotates. 0 = crisp, no trails.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070d')
    .meta({ section: 'Look', ui: 'color', label: 'Background', help: 'Trails fade toward this colour. Dark reads best.' }),

  speed: z.number().min(0.02).max(4).default(1)
    .meta({ section: 'Motion', ui: 'slider', min: 0.02, max: 4, step: 0.02, label: 'Speed',
            help: 'Visual playback speed. Far below 1× slows the swarm to a meditative creep; above 1× fast-forwards the dance. The GPU has headroom to spare.' }),

  seed: z.number().int().default(1337)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The seed rolls the starting positions, phases and natural rhythms, so the same seed always STARTS the same world. A fresh visit rolls a new one.' }),
})

export type SwarmalatorsConfig = z.infer<typeof swarmalatorsSchema>
```

- [ ] **Step 4: Run test → PASS.**

Run: `npx vitest run src/diversions/swarmalators/schema.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/diversions/swarmalators/schema.ts src/diversions/swarmalators/schema.test.ts
git commit -m "feat(swarmalators): schema — J/K/shimmer + colour wheel + pin-only seed"
```

---

### Task 3: `presets.ts` — the five canonical states

**Files:**
- Create: `src/diversions/swarmalators/presets.ts`
- Test: `src/diversions/swarmalators/presets.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// presets.test.ts
import { describe, it, expect } from 'vitest'
import { swarmalatorsPresets } from './presets'

describe('swarmalatorsPresets', () => {
  it('exposes one State group with the five canonical states', () => {
    expect(swarmalatorsPresets).toHaveLength(1)
    const group = swarmalatorsPresets[0]
    expect(group.label).toBe('State')
    const byName = Object.fromEntries(group.options.map((o) => [o.label, o.patch]))
    expect(byName['Active phase wave']).toMatchObject({ J: 1, K: -0.75 })
    expect(byName['Splintered phase wave']).toMatchObject({ J: 1, K: -0.1 })
    expect(byName['Static phase wave']).toMatchObject({ J: 1, K: 0 })
    expect(byName['Static sync']).toMatchObject({ J: 0.1, K: 1 })
    expect(byName['Static async']).toMatchObject({ J: 0.1, K: -1 })
  })
  it('every option resets shimmer to 0 (pure canonical states)', () => {
    for (const o of swarmalatorsPresets[0].options) expect(o.patch.omegaSpread).toBe(0)
  })
})
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run src/diversions/swarmalators/presets.test.ts`

- [ ] **Step 3: Write `presets.ts`** (mirror `particle-life-gpu/presets.ts` — `PresetGroup<Config>[]`)

```typescript
// presets.ts — the five collective states of the swarmalator model, as one independent
// axis. Each patch sets the two coupling knobs (+ resets shimmer to the pure model).
// Coordinates verified against O'Keeffe–Hong–Strogatz 2017, Fig. 2/5.
import type { PresetGroup } from '../../framework/types'
import type { SwarmalatorsConfig } from './schema'

export const swarmalatorsPresets: PresetGroup<SwarmalatorsConfig>[] = [
  {
    label: 'State',
    help: 'The five collective states of the model. Active phase wave keeps moving; the static states settle to a still image (add Shimmer to liven them).',
    options: [
      { label: 'Active phase wave', patch: { J: 1, K: -0.75, omegaSpread: 0 } },
      { label: 'Splintered phase wave', patch: { J: 1, K: -0.1, omegaSpread: 0 } },
      { label: 'Static phase wave', patch: { J: 1, K: 0, omegaSpread: 0 } },
      { label: 'Static sync', patch: { J: 0.1, K: 1, omegaSpread: 0 } },
      { label: 'Static async', patch: { J: 0.1, K: -1, omegaSpread: 0 } },
    ],
  },
]
```

> Check `PresetGroup`/`PresetOption` field names against `src/framework/types.ts` before finalizing (the reference is `particle-life-gpu/presets.ts`). If a group `help` field isn't supported, drop it.

- [ ] **Step 4: Run → PASS.** `npx vitest run src/diversions/swarmalators/presets.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/diversions/swarmalators/presets.ts src/diversions/swarmalators/presets.test.ts
git commit -m "feat(swarmalators): five canonical states as presets"
```

---

### Task 4: `gpu.ts` — WGSL compute + render (lead-inline)

**Files:**
- Create: `src/diversions/swarmalators/gpu.ts`

No unit test (needs a GPU). Verified via smoke sweep + Chrome. Mirror `particle-life-gpu/gpu.ts` structure exactly: same flag-bit constants, same `GpuResources` shape (minus matrix/species/colors buffers, plus phase/phaseVel/omega buffers), same `ALPHA_BLEND`/`ADDITIVE_BLEND`, `makeAccum`, `writeFade`, `resizeGPU`, `runFrame`, `disposeGPU`.

- [ ] **Step 1: Compute WGSL** — free-space, first-order, softened. Two entry points sharing an explicit bind-group layout (NOT `layout:'auto'` — the gotcha).

```wgsl
struct Params { n: u32, invN: f32, jj: f32, kk: f32, dt: f32, eps: f32, omegaSpread: f32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read>       omega:    array<f32>;
@group(0) @binding(2) var<storage, read_write> positions:array<vec2f>;
@group(0) @binding(3) var<storage, read_write> phases:   array<f32>;
@group(0) @binding(4) var<storage, read_write> vel:      array<vec2f>;
@group(0) @binding(5) var<storage, read_write> phaseVel: array<f32>;

const PI  = 3.14159265359;
const TAU = 6.28318530718;

@compute @workgroup_size(64)
fn forces(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.n) { return; }
  let pi = positions[i];
  let thi = phases[i];
  var f = vec2f(0.0, 0.0);
  var fth = 0.0;
  for (var j: u32 = 0u; j < params.n; j = j + 1u) {
    if (j == i) { continue; }
    let d = positions[j] - pi;
    let r = max(length(d), params.eps);           // softened: no NaN at coincidence
    let dth = phases[j] - thi;
    let a = (1.0 + params.jj * cos(dth)) / r - 1.0 / (r * r); // 1/r attract, 1/r² repel
    f = f + d * a;
    fth = fth + sin(dth) / r;
  }
  vel[i] = f * params.invN;
  phaseVel[i] = omega[i] * params.omegaSpread + params.kk * params.invN * fth;
}

@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.n) { return; }
  positions[i] = positions[i] + vel[i] * params.dt;   // NO wrap — free space
  var th = phases[i] + phaseVel[i] * params.dt;
  phases[i] = th - TAU * floor((th + PI) / TAU);       // wrap phase to [-PI,PI)
}
```

- [ ] **Step 2: Render WGSL** — instanced quads (verbatim vertex-pull from PL) but pass `phase` to the fragment and compute colour there. Include the three cyclic colormaps.

```wgsl
struct View { scale: f32, cx: f32, cy: f32, viewW: f32, viewH: f32, coreR: f32, haloR: f32, colorMap: u32 }
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> positions: array<vec2f>;
@group(0) @binding(2) var<storage, read> phases:    array<f32>;

const PI  = 3.14159265359;
const TAU = 6.28318530718;
const CORNERS = array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));

struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) hue: f32 }

fn buildVertex(vi: u32, ii: u32, radius: f32) -> VSOut {
  let corner = CORNERS[vi];
  let wp = positions[ii];
  // origin-centered world → screen: (world - camCenter) * scale, y down
  let sx = view.viewW * 0.5 + (wp.x - view.cx) * view.scale + corner.x * radius;
  let sy = view.viewH * 0.5 - (wp.y - view.cy) * view.scale + corner.y * radius;
  var out: VSOut;
  out.pos = vec4f(sx / view.viewW * 2.0 - 1.0, 1.0 - sy / view.viewH * 2.0, 0.0, 1.0);
  out.uv = corner;
  out.hue = phases[ii];
  return out;
}
@vertex fn vs_core(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut { return buildVertex(vi, ii, view.coreR); }
@vertex fn vs_halo(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut { return buildVertex(vi, ii, view.haloR); }

// --- phase → rgb (cyclic) ---
fn oklchToRgb(L: f32, C: f32, h: f32) -> vec3f {
  let a = C * cos(h); let b = C * sin(h);
  let l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  let m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  let s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  let l = l_*l_*l_; let m = m_*m_*m_; let s = s_*s_*s_;
  var rgb = vec3f(
     4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
    -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
    -0.0041960863*l - 0.7034186147*m + 1.7076147010*s);
  rgb = clamp(rgb, vec3f(0.0), vec3f(1.0));
  // linear → sRGB
  return select(1.055 * pow(rgb, vec3f(1.0/2.4)) - 0.055, rgb * 12.92, rgb <= vec3f(0.0031308));
}
fn sinebow(t: f32) -> vec3f {
  let x = t + 0.5;
  return vec3f(pow(sin(PI*x),2.0), pow(sin(PI*(x+1.0/3.0)),2.0), pow(sin(PI*(x+2.0/3.0)),2.0));
}
fn phaseColor(theta: f32, map: u32) -> vec3f {
  let h = theta + PI;              // [-PI,PI) → [0,TAU)
  let t = h / TAU;                 // [0,1)
  if (map == 1u) { return sinebow(t); }
  if (map == 2u) { return oklchToRgb(0.85, 0.07, h); } // Pastel: light, low chroma
  return oklchToRgb(0.72, 0.13, h);                     // Spectrum (default)
}

@fragment fn fs_core(in: VSOut) -> @location(0) vec4f {
  let d = length(in.uv);
  let a = 1.0 - smoothstep(0.72, 1.0, d);
  if (a <= 0.001) { discard; }
  return vec4f(phaseColor(in.hue, view.colorMap), a);
}
@fragment fn fs_halo(in: VSOut) -> @location(0) vec4f {
  let d = clamp(length(in.uv), 0.0, 1.0);
  let a = 0.5 * pow(1.0 - d, 2.2);
  return vec4f(phaseColor(in.hue, view.colorMap) * a, a);
}

// fullscreen trail-fade (verbatim from particle-life-gpu)
struct Fade { r: f32, g: f32, b: f32, a: f32 }
@group(0) @binding(0) var<uniform> fade: Fade;
const FS = array<vec2f,3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
@vertex fn vs_fullscreen(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f { return vec4f(FS[vi],0.0,1.0); }
@fragment fn fs_fade() -> @location(0) vec4f { return vec4f(fade.r, fade.g, fade.b, fade.a); }
```

- [ ] **Step 3: TypeScript scaffolding** — copy `particle-life-gpu/gpu.ts` and adapt:
  - `GpuResources`: drop `matrixBuf`/`speciesBuf`/`colorBuf`/`worldW`/`worldH`/`colors`; add `phaseBuf`, `phaseVelBuf`, `omegaBuf`. Keep `paramsBuf`, `viewBuf`, `fadeBuf`, `posBuf`, `velBuf`, `accum`, pipelines, binds, `bg`, `needsClear`, `dpr`, `count`.
  - `initGPU(device, ctx, format, cfg, size, dpr)`: `seedWorld(cfg.count, cfg.seed)`; create 6 storage buffers (pos, phase, vel, phaseVel, omega, + params/view/fade uniforms); `writeBuffer` pos/phase/omega (vel/phaseVel start zeroed — still allocate + optionally write zeros); `packParams(cfg)`, `packView(cfg, size, dpr, DEFAULT_CAMERA)`.
  - **Compute bind-group layout** (explicit): binding 0 uniform (params), 1 read-only-storage (omega), 2–5 storage (positions, phases, vel, phaseVel). Both `forces` and `integrate` share it.
  - **Render bind-group layout** (explicit): 0 uniform (view), 1 read-only-storage (positions), 2 read-only-storage (phases). All VERTEX-visible (phases read in vertex, passed to fragment via VSOut — matches PL where species is vertex-read).
  - `writeParams(res, cfg)` → `packParams`; `writeView(res, cfg, size, cam)` → `packView`; `writeFade(res, cfg)` verbatim (uses `parseBg`).
  - `runFrame`, `resizeGPU`, `makeAccum`, `disposeGPU`: verbatim from PL (dispose the 6 storage + 3 uniform buffers + accum; **never** `device.destroy()`).

Full `GpuResources` interface to create:

```typescript
export interface GpuResources {
  device: GPUDevice; ctx: GPUCanvasContext; format: GPUTextureFormat
  count: number; dpr: number
  paramsBuf: GPUBuffer; viewBuf: GPUBuffer; fadeBuf: GPUBuffer
  posBuf: GPUBuffer; phaseBuf: GPUBuffer; velBuf: GPUBuffer; phaseVelBuf: GPUBuffer; omegaBuf: GPUBuffer
  forcesPipe: GPUComputePipeline; integratePipe: GPUComputePipeline; computeBind: GPUBindGroup
  haloPipe: GPURenderPipeline; corePipe: GPURenderPipeline; fadePipe: GPURenderPipeline
  renderBind: GPUBindGroup; fadeBind: GPUBindGroup
  accum: GPUTexture; accumView: GPUTextureView; texW: number; texH: number; needsClear: boolean
  bg: { r: number; g: number; b: number }
}
```

`runFrame` compute loop (per step: forces pass then integrate pass, both `dispatchWorkgroups(ceil(count/64))`), then the trail-fade + halo + core render into `accum`, then `copyTextureToTexture` to swapchain — **identical to PL** (just no `worldW/H` args).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `swarmalators/`.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/swarmalators/gpu.ts
git commit -m "feat(swarmalators): WGSL compute (free-space first-order) + phase-colour render"
```

---

### Task 5: `index.ts` — lifecycle + camera + live-apply (lead-inline)

**Files:**
- Create: `src/diversions/swarmalators/index.ts`
- Test: `src/diversions/swarmalators/liveApply.test.ts`

- [ ] **Step 1: Write `index.ts`** — mirror `particle-life-gpu/index.ts`. Simplify the camera (no arena clamp — free space): zoom clamps to `[1, 16]`, pan is free (optionally clamp to `±VIEW_RADIUS*2` so you can't lose the swarm). `update()` routing:

```typescript
update(state, cfg, size): boolean {
  const prev = state.cfg
  if (cfg.count !== prev.count || cfg.seed !== prev.seed) return false // structural → re-setup
  state.cfg = cfg; state.size = size
  if (!state.res) return true
  if (cfg.J !== prev.J || cfg.K !== prev.K || cfg.omegaSpread !== prev.omegaSpread) writeParams(state.res, cfg)
  if (cfg.colorMap !== prev.colorMap || cfg.dotSize !== prev.dotSize) writeView(state.res, cfg, size, state.cam)
  if (cfg.background !== prev.background || cfg.trailFade !== prev.trailFade) writeFade(state.res, cfg)
  return true
},
```

`frame` = PL's verbatim (speed accumulator, `camDirty` → `writeView`, `runFrame`). `id: 'swarmalators'`, `title: 'Swarmalators'`, `kind: 'webgpu'`, `schema: swarmalatorsSchema`, `presets: swarmalatorsPresets`, **no `reconcile`**. Description:

> "Particles that swarm in space and sync in phase at once — colour is each one's inner rhythm. Tune two couplings to slide between a frozen rainbow ring, a shattering of colour clusters, and a slowly rotating living annulus. Scroll to zoom, drag to pan. A new world every seed."

Camera `attachCamera` (simplified from PL): keep `onWheel` (zoom toward cursor using the fixed `fit` scale — recompute `fit` from `worldRadius`/canvas, no `worldDims`), `onDown/onMove/onUp` (pan in world units = pixels/scale), `onDbl` reset. Drop `clampPan`'s arena math; instead `state.cam.panX = clamp(panX, -3, 3)` (world units).

- [ ] **Step 2: Write `liveApply.test.ts`** — mirror `particle-life-gpu/liveApply.test.ts`. Since `update()` reads `state.res` (null in jsdom), test the **routing decision** by calling `update` with `res: null` and asserting the structural-vs-live return value:

```typescript
import { describe, it, expect } from 'vitest'
import swarmalators from './index'
import { swarmalatorsSchema } from './schema'

const base = swarmalatorsSchema.parse({})
const mkState = (cfg = base) => ({ cfg: { ...cfg }, size: { width: 800, height: 600 }, res: null,
  ready: false, disposed: false, acc: 0, cam: { zoom: 1, panX: 0, panY: 0 }, camDirty: false, detach: null } as any)

describe('swarmalators update() routing', () => {
  it('count change is structural (returns false → re-setup)', () => {
    expect(swarmalators.update!(mkState(), { ...base, count: base.count + 500 }, { width: 800, height: 600 })).toBe(false)
  })
  it('seed change is structural', () => {
    expect(swarmalators.update!(mkState(), { ...base, seed: 99 }, { width: 800, height: 600 })).toBe(false)
  })
  it('J/K/colour changes are live (return true, no realloc)', () => {
    expect(swarmalators.update!(mkState(), { ...base, K: -0.1 }, { width: 800, height: 600 })).toBe(true)
    expect(swarmalators.update!(mkState(), { ...base, colorMap: 'Sinebow' }, { width: 800, height: 600 })).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests + typecheck**

Run: `npx vitest run src/diversions/swarmalators/ && npx tsc --noEmit`
Expected: all swarmalators tests PASS, no type errors.

- [ ] **Step 4: Run the full suite** (the registry glob now auto-includes the piece in framework sweeps — codec round-trip, control-from-schema, smoke).

Run: `npx vitest run`
Expected: all green (was 1651 before; +~12 new). If the `diversionSmoke` or `codecSweep` sweep fails, fix the schema/pack contract it flags.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/swarmalators/index.ts src/diversions/swarmalators/liveApply.test.ts
git commit -m "feat(swarmalators): lifecycle wiring, camera, live-apply routing"
```

---

### Task 6: Chrome verify (lead-inline, required)

**Files:** none (verification only). Uses chrome-devtools MCP.

- [ ] **Step 1: Start the dev server** (background): `npm run dev` — pinned to **port 5180**.
- [ ] **Step 2: Open** `http://localhost:5180/d/swarmalators/play?mute=1` in Chrome (chrome-devtools MCP, never the built-in preview).
- [ ] **Step 3: Verify each preset** via the config screen (`/d/swarmalators/config`):
  - **Static phase wave** `(1,0)` → a clean **rainbow ring/annulus**, colours ordered smoothly around it.
  - **Active phase wave** `(1,-0.75)` (default) → the annulus **visibly rotates/flows**, colours advancing — this is the hero state; confirm it never freezes.
  - **Splintered** `(1,-0.1)` → ring breaks into oscillating colour clusters.
  - **Static sync** `(0.1,1)` → a single-colour disk.
  - **Static async** `(0.1,-1)` → a disk of mixed colour, no spatial order.
- [ ] **Step 4: Assert health** via `evaluate_script` / console: no WGSL validation errors, no `Submit([Invalid CommandBuffer])` spam, no NaN (swarm stays on-screen — if particles vanish/explode, raise `EPS` to 0.02 or lower `DT` to 0.01 and note it). Confirm **60fps** at default count (check the fps HUD).
  - Push `count` to 16000 → if it drops below ~55fps, lower `schema.count.max` to the highest smooth value and record the ceiling (measured-in-Chrome, per the gotcha).
- [ ] **Step 5: Verify interaction + polish** — scroll zooms toward cursor, drag pans, double-click resets; slow `speed` reads as a meditative creep; `colorMap` swap + `trailFade` + `glow` all live-update. Compare Spectrum vs Sinebow — if the OKLCH ring looks dull or wrong, switch the default to Sinebow.
- [ ] **Step 6: Screenshot** the active phase wave + rainbow ring; hand the paths + the live URL to the user for manual inspection (user-verify-before-FF-merge).

No commit (verification). If tuning changed `DT`/`EPS`/`count.max`, commit that:

```bash
git add src/diversions/swarmalators/
git commit -m "fix(swarmalators): Chrome-verified stability + perf ceiling"
```

---

### Task 7: Docs

**Files:**
- Modify: `README.md` (the diversion gallery list, if it enumerates pieces)
- Modify: `CLAUDE.md` (only if a NEW gotcha surfaced — e.g. an OKLCH-in-WGSL or free-space-camera lesson; otherwise the existing WebGPU seam notes cover it)

- [ ] **Step 1:** Grep for where diversions are listed in `README.md` (`grep -n "Particle Life" README.md`); add a Swarmalators row/line in the same format.
- [ ] **Step 2:** If Chrome verify surfaced a reusable lesson, add one bullet to CLAUDE.md "Gotchas learned". If not, skip.
- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: list Swarmalators in the gallery"
```

---

### Task 8: Code review (required phase — fresh reviewer, no implementation bias)

- [ ] **Step 1:** Dispatch the `diversion-reviewer` agent against the branch diff (5 UX invariants, schema-as-source-of-truth, URL-codec keystone) AND the `perf-analyzer` agent (per-frame allocations, GL/GPU resource lifecycle, leaked buffers) — both read-only, in parallel.
- [ ] **Step 2:** Triage findings; fix confirmed issues (commit each logical fix). Re-verify in Chrome if any fix touches the sim/render.
- [ ] **Step 3:** Hand off to the user for manual inspection + FF-merge approval (user-verify gate). On approval: squash → FF-merge to `main` → delete both branch ends (per standing merge-cleanup authorization).

---

## Self-Review

**Spec coverage:** §1 model → Tasks 1,4. §2 architecture/buffers → Task 4. §3 WGSL + colormaps → Task 4. §4 numerics (DT/EPS/VIEW_RADIUS) → Task 1 constants + Task 6 verify. §5 schema/interaction → Tasks 2,5. §5 presets → Task 3. §6 live-apply → Task 5. §7 perf ceiling → Task 6. §8 testing → Tasks 1–3,5. §9 out-of-scope → not built (correct). ✔ All sections covered.

**Placeholder scan:** One INTENTIONAL, flagged placeholder — the `0x5w4c` RNG salt in Task 1 Step 3, explicitly corrected in Step 4 to `0x53776172` (this is a teaching flag, not a gap). `dt`/`eps`/`count.max` are real defaults with a verify-and-adjust step, not TBDs. No "add error handling" hand-waves. ✔

**Type consistency:** `seedWorld(count, seed)` → `{pos,phase,vel,phaseVel,omega}` used identically in Tasks 1 and 4. `packParams({count,J,K,omegaSpread})` / `packView({dotSize,colorMap},...)` signatures match schema fields and Task 4 calls. `GpuResources` buffer names (`phaseBuf`,`phaseVelBuf`,`omegaBuf`) consistent across Task 4. `writeParams`/`writeView`/`writeFade` names match between Tasks 4 and 5. `colorMapIndex`/`COLOR_MAPS`/`ColorMap` shared by pack ↔ schema. ✔

**Verify-in-Chrome constants:** `DT=0.02`, `EPS=0.01`, `count.max=16000` are starting values with an explicit Task-6 adjust-and-record step — the one genuinely empirical part of the build, correctly deferred to the GPU.
