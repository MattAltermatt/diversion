# Metaballs Diversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `metaballs` WebGL diversion — gooey lava-lamp blobs that rise, merge, and split — to the gallery (#34).

**Architecture:** A fullscreen fragment shader sums N center fields (`field = Σ rᵢ²/dist²`) and draws a `smoothstep` isoline. The blob centers are a CPU-side simulation (`motion.ts`) stepped each frame with a vertical thermal model (warm rises, cools at the ceiling, sinks, reheats at the floor) + horizontal seeded noise. Merge/split is automatic from the field-sum, so the sim only produces center motion. The diversion auto-registers via `import.meta.glob` — no manual registration.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4 + WebGL2. Vitest co-located tests. Reference implementation: `src/diversions/plasma/` (the proven WebGL host path).

**Spec:** `docs/superpowers/specs/2026-06-26-metaballs-design.md`

---

## File Structure

All under `src/diversions/metaballs/` (the registry glob `../diversions/*/index.ts` picks up the folder automatically):

- `schema.ts` — Zod schema (single source of truth: form + URL codec + `MetaballsConfig` type).
- `schema.test.ts` — defaults parse, every field has `ui` meta, codec round-trip.
- `motion.ts` — `mulberry32` PRNG, `Blob` type, internal tuning constants, `seedBlobs()`, `stepBlobs()`. Pure CPU sim, no GL, no React.
- `motion.test.ts` — determinism (same seed → identical) + bounded-state (T, y stay in range over a long run).
- `metaballs.ts` — GL: `hexToRgb`, `VERT_SRC`, `FRAG_SRC`, `MetaballsGL` type, `initGL`, `render`, `disposeGL`. Mirrors `plasma.ts`.
- `metaballs.test.ts` — `hexToRgb` unit test (shader logic is GLSL → covered by Chrome verify).
- `index.ts` — the `Diversion` object wiring `setup`/`frame`/`update`/`teardown` + the CPU/GPU split.

---

## Task 1: Schema (single source of truth)

**Files:**
- Create: `src/diversions/metaballs/schema.ts`
- Test: `src/diversions/metaballs/schema.test.ts`

- [ ] **Step 1: Write the failing test**

`src/diversions/metaballs/schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { metaballsSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'

describe('metaballs schema', () => {
  it('parses to documented defaults', () => {
    const d = metaballsSchema.parse({})
    expect(d).toEqual({
      blobCount: 8,
      radiusMin: 0.06,
      radiusMax: 0.16,
      threshold: 1.0,
      edgeSoftness: 0.06,
      buoyancy: 0.4,
      viscosity: 0.6,
      glow: 0.3,
      speed: 0.6,
      seed: 1742,
      colorA: '#ff2e63',
      colorB: '#ffd56b',
      background: '#05060a',
    })
  })

  it('every field carries a ui meta', () => {
    for (const [, field] of Object.entries(metaballsSchema.shape)) {
      const meta = (field as { meta(): { ui?: string } }).meta()
      expect(meta.ui).toBeTruthy()
    }
  })

  it('round-trips a tweaked config through the URL codec, omitting defaults', () => {
    const cfg = { ...metaballsSchema.parse({}), blobCount: 12, colorB: '#00ffcc' }
    const sp = encodeConfig(metaballsSchema, cfg)
    expect(sp.get('blobCount')).toBe('12')
    expect(sp.has('speed')).toBe(false) // default omitted
    expect(decodeConfig(metaballsSchema, sp)).toEqual(cfg)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/metaballs/schema.test.ts`
Expected: FAIL — cannot resolve `./schema`.

- [ ] **Step 3: Write the schema**

`src/diversions/metaballs/schema.ts`:
```ts
import { z } from 'zod'

export const metaballsSchema = z.object({
  blobCount: z.number().int().min(3).max(16).default(8)
    .meta({ ui: 'slider', min: 3, max: 16, step: 1, label: 'Blob count',
            help: 'How many blobs. More = busier, more merges.' }),
  radiusMin: z.number().min(0.02).max(0.2).default(0.06)
    .meta({ ui: 'slider', min: 0.02, max: 0.2, step: 0.005, label: 'Radius min',
            help: 'Smallest blob size (fraction of the short screen dimension).' }),
  radiusMax: z.number().min(0.05).max(0.4).default(0.16)
    .meta({ ui: 'slider', min: 0.05, max: 0.4, step: 0.005, label: 'Radius max',
            help: 'Largest blob size (fraction of the short screen dimension).' }),
  threshold: z.number().min(0.5).max(3).default(1.0)
    .meta({ ui: 'slider', min: 0.5, max: 3, step: 0.05, label: 'Threshold',
            help: 'Blob fatness — lower = fatter, merges more readily.' }),
  edgeSoftness: z.number().min(0).max(0.3).default(0.06)
    .meta({ ui: 'slider', min: 0, max: 0.3, step: 0.01, label: 'Edge softness',
            help: 'Rim softness — higher = blurrier, more gooey edges.' }),
  buoyancy: z.number().min(0).max(1).default(0.4)
    .meta({ ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Buoyancy',
            help: 'Strength of the vertical rise/fall thermal cycle.' }),
  viscosity: z.number().min(0).max(1).default(0.6)
    .meta({ ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Viscosity',
            help: 'How slowly blobs move and merge. Higher = thicker, syrupy.' }),
  glow: z.number().min(0).max(1).default(0.3)
    .meta({ ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Glow',
            help: 'Soft halo around each blob. Bounded to avoid white-out.' }),
  speed: z.number().min(0).max(2).default(0.6)
    .meta({ ui: 'slider', min: 0, max: 2, step: 0.01, label: 'Speed',
            help: 'Overall pace of the motion. 0 = frozen.' }),
  seed: z.number().int().default(1742)
    .meta({ ui: 'number', step: 1, label: 'Seed',
            help: 'Any integer. The same seed always regenerates the same arrangement.' }),
  colorA: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff2e63')
    .meta({ ui: 'color', label: 'Rim color' }),
  colorB: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffd56b')
    .meta({ ui: 'color', label: 'Core color' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05060a')
    .meta({ ui: 'color', label: 'Background' }),
})

export type MetaballsConfig = z.infer<typeof metaballsSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/metaballs/schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/metaballs/schema.ts src/diversions/metaballs/schema.test.ts
git commit -m "Metaballs: schema (single source of truth)"
```

---

## Task 2: Motion simulation (the make-or-break model)

**Files:**
- Create: `src/diversions/metaballs/motion.ts`
- Test: `src/diversions/metaballs/motion.test.ts`

The vertical-thermal / horizontal-noise hybrid. `stepBlobs` mutates blobs in place and returns the next accumulated sim-time `t` (seconds, wrapped) so the caller can thread it back. Coordinate space matches the shader: the short screen axis is vertical and spans `[-1, 1]` (so vertical travel is aspect-independent); `+y` is up = the cold ceiling. `x` spans `[-aspect, aspect]`.

- [ ] **Step 1: Write the failing test**

`src/diversions/metaballs/motion.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { metaballsSchema } from './schema'
import { seedBlobs, stepBlobs } from './motion'

describe('metaballs motion', () => {
  it('seeds the configured number of blobs deterministically', () => {
    const cfg = metaballsSchema.parse({ seed: 7, blobCount: 5 })
    const a = seedBlobs(cfg, 1.6)
    const b = seedBlobs(cfg, 1.6)
    expect(a).toHaveLength(5)
    expect(a).toEqual(b) // same seed → identical blobs
  })

  it('is deterministic over a stepped run for a given seed', () => {
    const cfg = metaballsSchema.parse({ seed: 7 })
    const run = () => {
      const blobs = seedBlobs(cfg, 1.6)
      let t = 0
      for (let i = 0; i < 600; i++) t = stepBlobs(blobs, cfg, 16, t)
      return blobs.map((b) => [b.x, b.y, b.T])
    }
    expect(run()).toEqual(run())
  })

  it('keeps y and T bounded over a long run (float32-immortality)', () => {
    const cfg = metaballsSchema.parse({ seed: 3, speed: 2 })
    const blobs = seedBlobs(cfg, 1.6)
    let t = 0
    for (let i = 0; i < 20000; i++) {
      t = stepBlobs(blobs, cfg, 16, t)
      for (const b of blobs) {
        expect(Number.isFinite(b.y)).toBe(true)
        expect(b.y).toBeGreaterThanOrEqual(-1.001)
        expect(b.y).toBeLessThanOrEqual(1.001)
        expect(b.T).toBeGreaterThanOrEqual(-0.001)
        expect(b.T).toBeLessThanOrEqual(1.001)
      }
    }
  })

  it('freezes motion at speed 0', () => {
    const cfg = metaballsSchema.parse({ seed: 9, speed: 0 })
    const blobs = seedBlobs(cfg, 1.6)
    const before = blobs.map((b) => [b.x, b.y])
    let t = 0
    for (let i = 0; i < 100; i++) t = stepBlobs(blobs, cfg, 16, t)
    expect(blobs.map((b) => [b.x, b.y])).toEqual(before)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/metaballs/motion.test.ts`
Expected: FAIL — cannot resolve `./motion`.

- [ ] **Step 3: Write the motion module**

`src/diversions/metaballs/motion.ts`:
```ts
import type { MetaballsConfig } from './schema'

/** Seeded PRNG → () => float in [0, 1). Deterministic for a given seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Blob = {
  x: number // current horizontal position, [-aspect, aspect]
  x0: number // horizontal rest position (noise oscillates around it)
  y: number // vertical position, [-1, 1] (+y = up = cold ceiling)
  vy: number // vertical velocity
  T: number // temperature in [0, 1] — drives buoyancy
  radius: number // in the shader's uv units
  kCool: number // per-blob cooling rate — the anti-synchronization key
  xPhase: number // horizontal-noise phase offset
}

// Internal tuning constants (not exposed as sliders — dialed in during verify).
const T_HOT = 1 // ambient at the floor (y = -1)
const T_COLD = 0 // ambient at the ceiling (y = +1)
const T_NEUTRAL = 0.5 // temperature at which buoyancy is zero
const VISC_K = 6 // damping scale: vy *= exp(-VISC_K * viscosity * dt)
const KCOOL_MIN = 0.3
const KCOOL_MAX = 0.9
const NOISE_AMP = 0.12 // horizontal drift amplitude (uv units)
const WALL = 0.92 // soft |y| limit; blobs settle into the wall band
const WALL_BOUNCE = 0.4 // fraction of vy retained on a wall hit (absorptive)

export function seedBlobs(cfg: MetaballsConfig, aspect: number): Blob[] {
  const rnd = mulberry32(cfg.seed)
  const blobs: Blob[] = []
  for (let i = 0; i < cfg.blobCount; i++) {
    const x0 = (rnd() * 2 - 1) * aspect * 0.85
    blobs.push({
      x: x0,
      x0,
      y: rnd() * 2 - 1,
      vy: 0,
      T: rnd(), // random initial temperature so blobs launch out of phase
      radius: cfg.radiusMin + rnd() * (cfg.radiusMax - cfg.radiusMin),
      kCool: KCOOL_MIN + rnd() * (KCOOL_MAX - KCOOL_MIN),
      xPhase: rnd() * Math.PI * 2,
    })
  }
  return blobs
}

/** Step the sim by `dtMs` (clamped, speed-scaled). `t` is accumulated sim
 *  seconds; returns the next value (wrapped to stay float32-precise). */
export function stepBlobs(
  blobs: Blob[],
  cfg: MetaballsConfig,
  dtMs: number,
  t: number,
): number {
  const sdt = (Math.min(dtMs, 33) / 1000) * cfg.speed // clamp tab-stall spikes
  const nt = (t + sdt) % 1e4
  for (const b of blobs) {
    // --- vertical: thermal buoyancy ---
    const yNorm = (b.y + 1) / 2 // 0 at floor, 1 at ceiling
    const tEnv = T_HOT + (T_COLD - T_HOT) * yNorm // hot floor → cold ceiling
    b.T += b.kCool * (tEnv - b.T) * sdt
    b.vy += cfg.buoyancy * (b.T - T_NEUTRAL) * sdt
    b.vy *= Math.exp(-VISC_K * cfg.viscosity * sdt) // contraction → stable
    b.y += b.vy * sdt
    if (b.y > WALL) {
      b.y = WALL
      b.vy = -Math.abs(b.vy) * WALL_BOUNCE
    } else if (b.y < -WALL) {
      b.y = -WALL
      b.vy = Math.abs(b.vy) * WALL_BOUNCE
    }
    // --- horizontal: two incommensurate sines (never exactly repeats) ---
    b.x =
      b.x0 +
      NOISE_AMP *
        (Math.sin(nt * 0.37 + b.xPhase) + 0.5 * Math.sin(nt * 0.91 + b.xPhase * 1.7))
  }
  return nt
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/metaballs/motion.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/metaballs/motion.ts src/diversions/metaballs/motion.test.ts
git commit -m "Metaballs: vertical-thermal/horizontal-noise CPU motion sim"
```

---

## Task 3: GL render module

**Files:**
- Create: `src/diversions/metaballs/metaballs.ts`
- Test: `src/diversions/metaballs/metaballs.test.ts`

Mirrors `src/diversions/plasma/plasma.ts`. Shader logic (the field sum + isoline) is GLSL → not unit-testable; only `hexToRgb` is tested here, the rest is exercised by the Chrome verify.

- [ ] **Step 1: Write the failing test**

`src/diversions/metaballs/metaballs.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { hexToRgb } from './metaballs'

describe('hexToRgb', () => {
  it('converts #rrggbb to 0..1 floats', () => {
    expect(hexToRgb('#ff0000')).toEqual([1, 0, 0])
    expect(hexToRgb('#000000')).toEqual([0, 0, 0])
    const [r, g, b] = hexToRgb('#8040c0')
    expect(r).toBeCloseTo(0.502, 2)
    expect(g).toBeCloseTo(0.251, 2)
    expect(b).toBeCloseTo(0.753, 2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/metaballs/metaballs.test.ts`
Expected: FAIL — cannot resolve `./metaballs`.

- [ ] **Step 3: Write the GL module**

`src/diversions/metaballs/metaballs.ts`:
```ts
import type { MetaballsConfig } from './schema'
import type { Blob } from './motion'

export const MAX_BLOBS = 16

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// Fullscreen triangle generated from gl_VertexID — no attribute buffers needed.
export const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

export const FRAG_SRC = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform vec3  u_blobs[16]; // xy = center, z = radius
uniform int   u_count;
uniform float u_threshold;
uniform float u_edge;
uniform float u_glow;
uniform vec3  u_colorA;    // rim / cooler (field-low)
uniform vec3  u_colorB;    // core / hotter (field-high)
uniform vec3  u_bg;
out vec4 fragColor;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);
  float field = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= u_count) break;
    vec2 d = uv - u_blobs[i].xy;
    float r = u_blobs[i].z;
    field += (r * r) / max(dot(d, d), 1e-4);
  }
  float iso  = smoothstep(u_threshold - u_edge, u_threshold + u_edge, field);
  float core = smoothstep(u_threshold, u_threshold * 2.0, field);
  vec3 blob  = mix(u_colorA, u_colorB, core);
  vec3 col   = mix(u_bg, blob, iso);
  // bounded sub-threshold glow halo
  float halo = smoothstep(u_threshold - u_edge - 0.6, u_threshold - u_edge, field) * (1.0 - iso);
  col += u_colorA * (u_glow * 0.6) * halo;
  fragColor = vec4(col, 1.0);
}`

export type MetaballsGL = {
  program: WebGLProgram
  vao: WebGLVertexArrayObject
  locs: Record<string, WebGLUniformLocation | null>
  blobData: Float32Array // reused upload buffer (MAX_BLOBS * 3)
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`Metaballs shader compile failed: ${log}`)
  }
  return sh
}

export function initGL(gl: WebGL2RenderingContext): MetaballsGL {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
  const program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Metaballs program link failed: ${gl.getProgramInfoLog(program)}`)
  }
  const vao = gl.createVertexArray()!
  const name = (n: string) => gl.getUniformLocation(program, n)
  return {
    program,
    vao,
    locs: {
      res: name('u_res'), blobs: name('u_blobs'), count: name('u_count'),
      threshold: name('u_threshold'), edge: name('u_edge'), glow: name('u_glow'),
      colorA: name('u_colorA'), colorB: name('u_colorB'), bg: name('u_bg'),
    },
    blobData: new Float32Array(MAX_BLOBS * 3),
  }
}

export function render(
  gl: WebGL2RenderingContext, s: MetaballsGL, cfg: MetaballsConfig, blobs: Blob[],
): void {
  gl.useProgram(s.program)
  gl.bindVertexArray(s.vao)
  const n = Math.min(blobs.length, MAX_BLOBS)
  for (let i = 0; i < n; i++) {
    s.blobData[i * 3] = blobs[i].x
    s.blobData[i * 3 + 1] = blobs[i].y
    s.blobData[i * 3 + 2] = blobs[i].radius
  }
  gl.uniform2f(s.locs.res, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.uniform3fv(s.locs.blobs, s.blobData)
  gl.uniform1i(s.locs.count, n)
  gl.uniform1f(s.locs.threshold, cfg.threshold)
  gl.uniform1f(s.locs.edge, cfg.edgeSoftness)
  gl.uniform1f(s.locs.glow, cfg.glow)
  const a = hexToRgb(cfg.colorA)
  const b = hexToRgb(cfg.colorB)
  const bg = hexToRgb(cfg.background)
  gl.uniform3f(s.locs.colorA, a[0], a[1], a[2])
  gl.uniform3f(s.locs.colorB, b[0], b[1], b[2])
  gl.uniform3f(s.locs.bg, bg[0], bg[1], bg[2])
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export function disposeGL(gl: WebGL2RenderingContext, s: MetaballsGL): void {
  gl.deleteProgram(s.program)
  gl.deleteVertexArray(s.vao)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/metaballs/metaballs.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/metaballs/metaballs.ts src/diversions/metaballs/metaballs.test.ts
git commit -m "Metaballs: WebGL field-sum shader + render module"
```

---

## Task 4: Diversion wiring (`index.ts`)

**Files:**
- Create: `src/diversions/metaballs/index.ts`

Wires the `Diversion` contract. The CPU/GPU split lives in `update`: structural params (blobCount, seed, radius range) re-seed via a full `setup` (return `false`); all visual + motion params are read live each frame (return `true`). Stash `gl` in state so `teardown` can free GL resources (the host's `teardown` gets no context — see CLAUDE.md WebGL gotcha).

- [ ] **Step 1: Write `index.ts`**

`src/diversions/metaballs/index.ts`:
```ts
import type { Diversion, Size } from '../../framework/types'
import { metaballsSchema, type MetaballsConfig } from './schema'
import { seedBlobs, stepBlobs, type Blob } from './motion'
import { initGL, render, disposeGL, type MetaballsGL } from './metaballs'

type MetaballsState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: MetaballsGL
  cfg: MetaballsConfig
  blobs: Blob[]
  t: number
}

const metaballs: Diversion<MetaballsConfig, MetaballsState, 'webgl'> = {
  id: 'metaballs',
  title: 'Metaballs',
  description: 'Gooey blobs that rise, merge, and split — a lava lamp.',
  kind: 'webgl',
  schema: metaballsSchema,

  setup(gl, cfg, size: Size) {
    const aspect = size.width / size.height
    return { gl, res: initGL(gl), cfg, blobs: seedBlobs(cfg, aspect), t: 0 }
  },

  frame(state, gl, _t, dt) {
    // Viewport must track the live backing store; resize()/teardown() get no gl.
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    state.t = stepBlobs(state.blobs, state.cfg, dt, state.t)
    render(gl, state.res, state.cfg, state.blobs)
  },

  update(state, cfg) {
    // Structural params change the seeded blob set → fall back to full setup.
    if (
      cfg.blobCount !== state.cfg.blobCount ||
      cfg.seed !== state.cfg.seed ||
      cfg.radiusMin !== state.cfg.radiusMin ||
      cfg.radiusMax !== state.cfg.radiusMax
    ) {
      return false
    }
    state.cfg = cfg // visual + motion params are read live each frame
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res) // free program + VAO on diversion switch
  },
}

export default metaballs
```

- [ ] **Step 2: Verify the full suite + typecheck + build pass**

Run: `npx vitest run`
Expected: PASS — all existing tests plus the 3 new metaballs test files (8 new tests).

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (the registry glob now includes metaballs).

- [ ] **Step 3: Commit**

```bash
git add src/diversions/metaballs/index.ts
git commit -m "Metaballs: wire Diversion contract (auto-registers via glob)"
```

---

## Task 5: Chrome verification (the MUST gate)

**Files:** none (verification only). Use the chrome-devtools MCP, never a built-in preview.

- [ ] **Step 1: Start the dev server (background)**

Run (background): `npm run dev`
The server is pinned to port **5180** (`vite.config.ts`).

- [ ] **Step 2: Open the diversion**

Navigate Chrome to: `http://localhost:5180/#/d/metaballs/play?mute=1`
(Dev uses hash routing; confirm the gallery lists "Metaballs" first if unsure.)

- [ ] **Step 3: The `speed=2` multi-minute soak**

Set `speed` to 2 via the config screen (or append the URL param). Watch for **2–3 minutes** and confirm ALL of:
- Blobs **sometimes merge and sometimes separate** — neither one giant blob nor always-separate dots.
- The motion reads as **buoyant + viscous lava** (slow rise, linger/merge near the top, sink, reheat/split near the bottom) — **NOT** random bouncing molecules.
- **No degenerate steady state** — no synchronized-elevator (all blobs rising/falling in lockstep) and no permanent ceiling-pool.

If any fail, the internal constants in `motion.ts` (`T_*`, `KCOOL_*`, `VISC_K`, `NOISE_AMP`, `WALL*`) need tuning — adjust, re-verify. These are internal mechanism constants, not the schema's exposed gameplay values.

- [ ] **Step 4: Slider live-apply**

Drag `threshold`, `glow`, `viscosity`, `buoyancy`, and the colors — confirm they apply live with no re-setup flash. Change `blobCount` and `seed` — confirm a clean re-seed (new arrangement, no crash).

- [ ] **Step 5: URL round-trip + teardown**

- Tweak a few params, copy the URL, reload — confirm the config restores.
- Navigate back to the gallery and into another diversion and back — confirm no console errors and no GL-resource warning (the stash-gl teardown path).

- [ ] **Step 6: Capture a screenshot for the record**

Save a screenshot to the scratchpad and note the path for the user to `open` (the CLI does not render inline images).

---

## Task 6: Code review (required phase)

**Files:** none (review only).

- [ ] **Step 1: Dispatch the project reviewer**

Dispatch the `diversion-reviewer` agent (fresh, no implementation bias) against the metaballs diff. It checks the 5 UX invariants, schema-as-single-source-of-truth, the URL-codec keystone, and the WebGL teardown/viewport gotchas.

- [ ] **Step 2: Triage + fix**

Address any high-confidence findings. Re-run `npx vitest run` after fixes. Use the receiving-code-review skill to evaluate each point rather than blindly applying.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "Metaballs: address code-review findings"
```

---

## Task 7: Docs + close-out

**Files:**
- Modify: `README.md` (diversion list / gallery description, if it enumerates diversions)

- [ ] **Step 1: Update README**

If `README.md` lists the diversions, add Metaballs alongside Flow Field and Plasma with a one-line description. (Grep `README.md` for "Plasma" to find the spot; if diversions aren't enumerated there, skip.)

- [ ] **Step 2: Final verification gate**

Run: `npx vitest run` → all pass.
Run: `npx tsc --noEmit` → clean.
Run: `npm run build` → succeeds.

- [ ] **Step 3: Commit docs**

```bash
git add README.md
git commit -m "docs: add Metaballs to the diversion list"
```

- [ ] **Step 4: Hand off for user-verify before FF-merge**

Surface the live URL (`http://localhost:5180/#/d/metaballs/play?mute=1`) and the soak observations. Wait for explicit user approval before squashing + FF-merging `feature/metaballs-diversion` into `main` and closing #34.

---

## Self-Review

**Spec coverage:**
- WebGL kind + field-sum shader → Task 3. ✓
- CPU thermal+noise motion model (all MUST behaviors) → Task 2 + verify Task 5. ✓
- Schema (all issue fields + help) → Task 1. ✓
- 2-stop gradient + background color → Task 3 shader + Task 1 schema. ✓
- CPU/GPU split via `update?()` → Task 4. ✓
- Determinism + bounded-state tests → Task 2. ✓
- `speed=2` soak verify → Task 5 Step 3. ✓
- GL teardown / per-frame viewport gotchas → Task 4 (`frame` viewport, `teardown` disposeGL). ✓
- Code review (project rule) → Task 6. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; exact commands with expected output. ✓

**Type consistency:** `MetaballsConfig` (Task 1) used in Tasks 2/3/4. `Blob` (Task 2) used in Tasks 3/4. `MetaballsGL` (Task 3) used in Task 4. `seedBlobs`/`stepBlobs` signatures match across Tasks 2/4. `hexToRgb`/`initGL`/`render`/`disposeGL` match across Tasks 3/4. `metaballsSchema` default-seed `1742` consistent between schema (Task 1) and tests. ✓
