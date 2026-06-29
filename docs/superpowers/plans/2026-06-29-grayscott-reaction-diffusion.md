# Gray-Scott Reaction-Diffusion (#35) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Gray-Scott reaction-diffusion diversion — two chemicals diffusing/reacting in ping-ponged float textures, growing coral/mitosis/maze/spots/worms Turing patterns that never settle.

**Architecture:** All-GPU WebGL2 on the proven Physarum FBO host. Two `RGBA32F` state textures hold `(U, V, _, _)`, ping-ponged through a sim shader (9-point Laplacian + Gray-Scott reaction) `simSpeed` sub-steps/frame; a display pass maps `V` through a 256-px gradient LUT. Pattern + Color are two independent **PresetGroup** axes (mirroring Physarum's Behavior + Color); `feed`/`kill` are advanced clamped sliders the Pattern presets patch. Sim grid capped to 640 on the long edge, decoupled from DPR.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4 + WebGL2 (`EXT_color_buffer_float`). Vitest co-located tests.

## Global Constraints

- **Black-box rule:** the diversion implements `{ id, title, description, kind:'webgl', schema, setup, frame, resize?, update?, teardown?, presets? }` — never touches React. Reference: `src/diversions/physarum/index.ts`.
- **Schema is the single source of truth** — one Zod field per knob, each `.default().meta({ section, ui, min, max, step, label, help })`. Drives form + URL codec + `Config` type.
- **`update?()` seam:** live params return `true` (keep evolving); structural params return `false` (teardown+setup). Mirror `physarum/index.ts:40`.
- **WebGL leak rule:** stash `gl` in state so `teardown(state)` (no ctx arg) can free GL resources via `disposeGL`.
- **Float capability:** `initGL` must `getExtension('EXT_color_buffer_float')` and throw a clear error if absent (the `DiversionErrorBoundary` renders it gracefully — this IS the graceful-fallout path).
- **Codec + preset coverage is automatic:** `src/framework/codecSweep.test.ts` and `presetSweep.test.ts` iterate every registered diversion — no per-diversion codec test needed; just register cleanly.
- **Palettes are 6-hex (opaque, no alpha slider)** — see `[[gotcha-colorlist-hex-alpha]]`. `colorList` field regex is `/^#[0-9a-fA-F]{6}$/`.
- **Git identity** already set in repo. Commit per task. Branch: `feature/grayscott` (already created).
- **Tuning literals (🎚️)** — `DU/DV/DT`, the five `feed`/`kill` pairs, `SIM_MAX_SIDE`, display contrast `VMAX` — are starting values to confirm at Chrome-verify. Do NOT re-tune them mid-implementation; land them as written, verify, then adjust with the user.

---

### Task 1: Schema

**Files:**
- Create: `src/diversions/grayscott/schema.ts`
- Test: `src/diversions/grayscott/schema.test.ts`

**Interfaces:**
- Produces: `grayScottSchema` (Zod object), `type GrayScottConfig = z.infer<typeof grayScottSchema>`. Fields: `simSpeed:number`, `feed:number`, `kill:number`, `stops:string[]`, `seed:number`.

- [ ] **Step 1: Write the failing test**

```ts
// src/diversions/grayscott/schema.test.ts
import { describe, it, expect } from 'vitest'
import { grayScottSchema } from './schema'

describe('grayScottSchema', () => {
  it('parses to defaults (coral pattern, Deep Coral palette)', () => {
    const cfg = grayScottSchema.parse({})
    expect(cfg.feed).toBeCloseTo(0.0545)
    expect(cfg.kill).toBeCloseTo(0.062)
    expect(cfg.simSpeed).toBe(12)
    expect(cfg.stops.length).toBeGreaterThanOrEqual(2)
  })
  it('every slider field carries min/max meta', () => {
    const shape = grayScottSchema.shape
    for (const key of ['simSpeed', 'feed', 'kill'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
  it('clamps feed/kill to the viable band (rejects dead-zone values)', () => {
    expect(() => grayScottSchema.parse({ feed: 0.5 })).toThrow()
    expect(() => grayScottSchema.parse({ kill: 0.2 })).toThrow()
    expect(grayScottSchema.parse({ feed: 0.014 }).feed).toBeCloseTo(0.014)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/grayscott/schema.test.ts`
Expected: FAIL — cannot resolve `./schema`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/diversions/grayscott/schema.ts
import { z } from 'zod'

// V-concentration → color ramp. Default: Deep Coral (deep water → cyan structures).
const DEEP_CORAL = ['#06121f', '#0a4f6e', '#58d8ff']

export const grayScottSchema = z.object({
  // ── Simulation ──
  simSpeed: z.number().int().min(1).max(24).default(12)
    .meta({ section: 'Simulation', ui: 'slider', min: 1, max: 24, step: 1, label: 'Sim speed',
            help: 'Reaction sub-steps computed per frame. Higher = faster-evolving '
                + 'patterns; lower = a calmer, slower bloom.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Simulation', ui: 'number', step: 1, label: 'Seed',
            help: 'Any integer. The same seed always starts the chemical field the same '
                + 'way. Change it to grow a different pattern. (Restarts the field.)' }),
  // ── Advanced ── raw feed/kill, clamped to the thin viable band.
  feed: z.number().min(0.01).max(0.09).default(0.0545)
    .meta({ section: 'Advanced', ui: 'slider', min: 0.01, max: 0.09, step: 0.0005, label: 'Feed (F)',
            help: 'Rate the U chemical is replenished. Set by the Pattern preset — most '
                + 'values away from a preset give a blank field, so nudge gently.' }),
  kill: z.number().min(0.045).max(0.07).default(0.062)
    .meta({ section: 'Advanced', ui: 'slider', min: 0.045, max: 0.07, step: 0.0005, label: 'Kill (k)',
            help: 'Rate the V chemical is removed. Coupled with Feed — viable patterns live '
                + 'on a thin curve, so small moves go a long way.' }),
  // ── Color ──
  stops: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(DEEP_CORAL)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Pattern colors',
            help: 'The V-concentration maps along these colors — the lowest is the empty '
                + 'background, the highest is the dense pattern core.' }),
})

export type GrayScottConfig = z.infer<typeof grayScottSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/grayscott/schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/grayscott/schema.ts src/diversions/grayscott/schema.test.ts
git commit -m "feat(grayscott): config schema (clamped feed/kill, pattern palette)"
```

---

### Task 2: Sim-grid sizing (`simDims`)

**Files:**
- Create: `src/diversions/grayscott/field.ts`
- Test: `src/diversions/grayscott/field.test.ts`

**Interfaces:**
- Produces: `simDims(w:number, h:number): { sw:number; sh:number }` — caps the long edge to `SIM_MAX_SIDE` (640), preserves aspect, min 1.

- [ ] **Step 1: Write the failing test**

```ts
// src/diversions/grayscott/field.test.ts
import { describe, it, expect } from 'vitest'
import { simDims } from './field'

describe('simDims', () => {
  it('caps the longest side to 640, preserving aspect', () => {
    const { sw, sh } = simDims(1920, 1080)
    expect(Math.max(sw, sh)).toBe(640)
    expect(sw / sh).toBeCloseTo(1920 / 1080, 2)
  })
  it('passes a small field through uncapped', () => {
    expect(simDims(500, 300)).toEqual({ sw: 500, sh: 300 })
  })
  it('caps a tall field by its height', () => {
    const { sw, sh } = simDims(400, 1280)
    expect(sh).toBe(640)
    expect(sw).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/grayscott/field.test.ts`
Expected: FAIL — cannot resolve `./field`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/diversions/grayscott/field.ts
import { mulberry32 } from '../../framework/rng'
import { sampleGradientRGBA } from '../../framework/gradient'

// Cap the sim field's longest side. Gray-Scott cost is O(texels × simSpeed); 640
// keeps the sub-step loop cheap on 4K/retina while giving fine pattern detail.
// Feature size scales with this, so it's a 🎚️ tunable (confirm at verify).
export const SIM_MAX_SIDE = 640

export function simDims(w: number, h: number): { sw: number; sh: number } {
  const longest = Math.max(w, h)
  const s = longest > SIM_MAX_SIDE ? SIM_MAX_SIDE / longest : 1
  return { sw: Math.max(1, Math.round(w * s)), sh: Math.max(1, Math.round(h * s)) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/grayscott/field.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/grayscott/field.ts src/diversions/grayscott/field.test.ts
git commit -m "feat(grayscott): aspect-preserving sim-grid cap (simDims)"
```

---

### Task 3: Seeded field init + gradient LUT

**Files:**
- Modify: `src/diversions/grayscott/field.ts`
- Test: `src/diversions/grayscott/field.test.ts` (extend)

**Interfaces:**
- Consumes: `mulberry32` (`framework/rng`), `sampleGradientRGBA` (`framework/gradient`).
- Produces: `seedField(seed:number, w:number, h:number): Float32Array` — length `w*h*4`, base `U=1,V=0` with toroidal V-patches; `buildLUT(stops:string[]): Uint8Array` — `256*4` RGBA bytes.

- [ ] **Step 1: Write the failing test (append to field.test.ts)**

```ts
import { seedField, buildLUT } from './field'

describe('seedField', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(seedField(1, 64, 64)).toEqual(seedField(1, 64, 64))
    expect(seedField(1, 64, 64)).not.toEqual(seedField(2, 64, 64))
  })
  it('base field is U=1,V=0 with a minority of seeded V patches', () => {
    const f = seedField(1, 64, 64)
    expect(f.length).toBe(64 * 64 * 4)
    let vPos = 0
    for (let i = 0; i < 64 * 64; i++) {
      const u = f[i * 4], v = f[i * 4 + 1]
      expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThanOrEqual(1)
      expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1)
      if (v > 0) vPos++
    }
    expect(vPos).toBeGreaterThan(0)
    expect(vPos).toBeLessThan(64 * 64) // not the whole field
  })
})

describe('buildLUT', () => {
  it('bakes a 256×RGBA byte ramp, opaque, dark→bright', () => {
    const lut = buildLUT(['#000000', '#ffffff'])
    expect(lut.length).toBe(256 * 4)
    expect(lut[3]).toBe(255)                 // alpha opaque
    expect(lut[0]).toBeLessThan(lut[255 * 4]) // R climbs dark→bright
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/diversions/grayscott/field.test.ts`
Expected: FAIL — `seedField`/`buildLUT` not exported.

- [ ] **Step 3: Implement (append to field.ts)**

```ts
/** Deterministic seeded initial field, sized to the sim grid. Base U=1,V=0
 *  ("empty"); scatter a few small V=0.25,U=0.5 square patches (toroidal wrap, to
 *  match REPEAT-sampled state) to kick the reaction. Returns RGBA32F data
 *  (U,V,0,1) per texel. */
export function seedField(seed: number, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h * 4)
  for (let i = 0; i < w * h; i++) { out[i * 4] = 1; out[i * 4 + 3] = 1 }
  const rng = mulberry32(seed)
  const patches = 20
  const r = Math.max(3, Math.round(Math.min(w, h) / 40))
  for (let p = 0; p < patches; p++) {
    const cx = Math.floor(rng() * w), cy = Math.floor(rng() * h)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = (((cx + dx) % w) + w) % w
        const y = (((cy + dy) % h) + h) % h
        const idx = (y * w + x) * 4
        out[idx] = 0.5; out[idx + 1] = 0.25
      }
  }
  return out
}

/** Bake the V→color gradient into a 256×RGBA byte LUT (uploaded as 256×1 tex). */
export function buildLUT(stops: string[]): Uint8Array {
  const s8 = stops.map((s) => (s.length === 7 ? s + 'ff' : s)) // widen #rrggbb
  const lut = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    const c = sampleGradientRGBA(s8, i / 255)
    lut[i * 4 + 0] = Math.round(c.r)
    lut[i * 4 + 1] = Math.round(c.g)
    lut[i * 4 + 2] = Math.round(c.b)
    lut[i * 4 + 3] = 255
  }
  return lut
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/diversions/grayscott/field.test.ts`
Expected: PASS (5 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/grayscott/field.ts src/diversions/grayscott/field.test.ts
git commit -m "feat(grayscott): seeded field init + gradient LUT"
```

---

### Task 4: Preset groups (Pattern + Color)

**Files:**
- Create: `src/diversions/grayscott/presets.ts`
- Test: `src/diversions/grayscott/presets.test.ts`

**Interfaces:**
- Consumes: `GrayScottConfig` (schema).
- Produces: `patternPresets: { name:string; patch: Pick<GrayScottConfig,'feed'|'kill'> }[]` (5 entries), `colorPresets: { name:string; patch: Pick<GrayScottConfig,'stops'> }[]` (4 entries).

- [ ] **Step 1: Write the failing test**

```ts
// src/diversions/grayscott/presets.test.ts
import { describe, it, expect } from 'vitest'
import { patternPresets, colorPresets } from './presets'
import { grayScottSchema } from './schema'

describe('grayscott presets', () => {
  it('has the five named patterns and four palettes', () => {
    expect(patternPresets.map((p) => p.name)).toEqual(['Coral', 'Mitosis', 'Maze', 'Spots', 'Worms'])
    expect(colorPresets.map((p) => p.name)).toEqual(['Deep Coral', 'Ink Bloom', 'Magma', 'Bone'])
  })
  it('every pattern patch parses inside the schema feed/kill bands', () => {
    for (const p of patternPresets) {
      expect(() => grayScottSchema.parse({ feed: p.patch.feed, kill: p.patch.kill })).not.toThrow()
    }
  })
  it('every palette patch is valid 6-hex and parses', () => {
    for (const p of colorPresets) {
      expect(() => grayScottSchema.parse({ stops: p.patch.stops })).not.toThrow()
      for (const s of p.patch.stops) expect(s).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/diversions/grayscott/presets.test.ts`
Expected: FAIL — cannot resolve `./presets`.

- [ ] **Step 3: Implement**

```ts
// src/diversions/grayscott/presets.ts
import type { GrayScottConfig } from './schema'

// Each pattern is a known-good feed/kill pair from Pearson's classification of
// the Gray-Scott manifold (🎚️ starting points, confirm at verify). Diffusion
// (DU/DV) is shared and lives in gl.ts — these two knobs ARE the visual character.
export const patternPresets: { name: string; patch: Pick<GrayScottConfig, 'feed' | 'kill'> }[] = [
  { name: 'Coral',   patch: { feed: 0.0545, kill: 0.0620 } }, // iconic labyrinth
  { name: 'Mitosis', patch: { feed: 0.0367, kill: 0.0649 } }, // cells endlessly divide
  { name: 'Maze',    patch: { feed: 0.0290, kill: 0.0570 } }, // winding corridors
  { name: 'Spots',   patch: { feed: 0.0140, kill: 0.0540 } }, // moving spots / gliders
  { name: 'Worms',   patch: { feed: 0.0260, kill: 0.0510 } }, // worms / fingerprints
]

// V-concentration → color ramps, dark background (empty) → bright core (dense V).
// 6-hex = opaque (no alpha slider). High contrast (UX invariant #5).
export const colorPresets: { name: string; patch: Pick<GrayScottConfig, 'stops'> }[] = [
  { name: 'Deep Coral', patch: { stops: ['#06121f', '#0a4f6e', '#58d8ff'] } },
  { name: 'Ink Bloom',  patch: { stops: ['#f5f1e6', '#6b5b4a', '#14110d'] } },
  { name: 'Magma',      patch: { stops: ['#0a0500', '#b23a00', '#ffd27f'] } },
  { name: 'Bone',       patch: { stops: ['#0c0c10', '#5a5a66', '#f0f0f5'] } },
]
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/diversions/grayscott/presets.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/grayscott/presets.ts src/diversions/grayscott/presets.test.ts
git commit -m "feat(grayscott): Pattern + Color preset groups"
```

---

### Task 5: WebGL host (shaders + init/step/render/dispose)

**Files:**
- Create: `src/diversions/grayscott/gl.ts`

**Interfaces:**
- Consumes: `simDims`, `seedField`, `buildLUT` (`./field`), `GrayScottConfig` (`./schema`).
- Produces: `type GrayScottGL`, `initGL(gl, cfg, w, h): GrayScottGL`, `step(gl, res, cfg): void`, `render(gl, res, cfg): void`, `uploadLUT(gl, res, stops): void`, `disposeGL(gl, res): void`.

> No unit test — this is pure WebGL2 (no GL context in jsdom). It's exercised by the registry/contract/codec/preset sweeps once Task 6 registers the diversion, and verified visually in Chrome (Task 7). Mirror `physarum/gl.ts` exactly for compile/link/makeTex/fbo/dispose helpers.

- [ ] **Step 1: Implement the shaders + host**

```ts
// src/diversions/grayscott/gl.ts
import { simDims, seedField, buildLUT } from './field'
import type { GrayScottConfig } from './schema'

// Gray-Scott constants (Karl Sims regime — pairs with the feed/kill preset table).
// 🎚️ confirm at verify. 9-point Laplacian: ortho 0.2, diag 0.05, center -1.
const DU = 1.0, DV = 0.5, DT = 1.0
// V rarely exceeds ~0.4; normalize by this before the LUT lookup for contrast.
const VMAX = 0.4

const TRI_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// SIM: one update step of the Gray-Scott reaction-diffusion system.
const SIM_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_state;   // RGBA32F (U,V,_,_)
uniform vec2  u_texel;       // 1/simSize
uniform float u_feed;
uniform float u_kill;
out vec4 fragColor;
vec2 lap(vec2 uv) {
  vec2 s = vec2(0.0);
  s += texture(u_state, uv + vec2(-1.0, 0.0) * u_texel).xy * 0.2;
  s += texture(u_state, uv + vec2( 1.0, 0.0) * u_texel).xy * 0.2;
  s += texture(u_state, uv + vec2( 0.0,-1.0) * u_texel).xy * 0.2;
  s += texture(u_state, uv + vec2( 0.0, 1.0) * u_texel).xy * 0.2;
  s += texture(u_state, uv + vec2(-1.0,-1.0) * u_texel).xy * 0.05;
  s += texture(u_state, uv + vec2( 1.0,-1.0) * u_texel).xy * 0.05;
  s += texture(u_state, uv + vec2(-1.0, 1.0) * u_texel).xy * 0.05;
  s += texture(u_state, uv + vec2( 1.0, 1.0) * u_texel).xy * 0.05;
  s += texture(u_state, uv).xy * -1.0;
  return s;
}
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  vec2 st = texture(u_state, uv).xy;
  float u = st.x, v = st.y;
  vec2 l = lap(uv);
  float reaction = u * v * v;
  float du = ${DU} * l.x - reaction + u_feed * (1.0 - u);
  float dv = ${DV} * l.y + reaction - (u_kill + u_feed) * v;
  float nu = clamp(u + du * ${DT}, 0.0, 1.0);
  float nv = clamp(v + dv * ${DT}, 0.0, 1.0);
  fragColor = vec4(nu, nv, 0.0, 1.0);
}`

// DISPLAY: sample V in normalized UV (stretches sim field to fill canvas),
// normalize, index the gradient LUT, opaque to screen.
const DISPLAY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform sampler2D u_lut;
uniform vec2  u_texel;   // 1/screenSize
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  float v = texture(u_state, uv).y;
  float t = clamp(v / ${VMAX}, 0.0, 1.0);
  vec3 col = texture(u_lut, vec2(t, 0.5)).rgb;
  fragColor = vec4(col, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src); gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh)
    throw new Error(`Gray-Scott shader compile failed: ${log}`)
  }
  return sh
}

function link(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc)
  let fs: WebGLShader
  try { fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc) }
  catch (e) { gl.deleteShader(vs); throw e }
  const prog = gl.createProgram()!
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
  gl.deleteShader(vs); gl.deleteShader(fs)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog); gl.deleteProgram(prog)
    throw new Error(`Gray-Scott program link failed: ${log}`)
  }
  return prog
}

function makeTex(
  gl: WebGL2RenderingContext, w: number, h: number,
  internal: number, format: number, type: number,
  filter: number, wrap: number, data: ArrayBufferView | null,
): WebGLTexture {
  const t = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap)
  return t
}

function fboFor(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const fb = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  return fb
}

export type GrayScottGL = {
  simProg: WebGLProgram
  displayProg: WebGLProgram
  vao: WebGLVertexArrayObject
  stateTex: [WebGLTexture, WebGLTexture]   // ping-pong (U,V)
  stateFbo: [WebGLFramebuffer, WebGLFramebuffer]
  lutTex: WebGLTexture
  simW: number
  simH: number
  cur: number                              // current ping-pong index
  locs: { sim: Record<string, WebGLUniformLocation | null>; display: Record<string, WebGLUniformLocation | null> }
}

export function initGL(gl: WebGL2RenderingContext, cfg: GrayScottConfig, w: number, h: number): GrayScottGL {
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('Gray-Scott requires float render targets (EXT_color_buffer_float)')
  }
  const simProg = link(gl, TRI_VERT, SIM_FRAG)
  const displayProg = link(gl, TRI_VERT, DISPLAY_FRAG)
  const vao = gl.createVertexArray()!

  const { sw: simW, sh: simH } = simDims(w, h)
  const seed = seedField(cfg.seed, simW, simH)
  // REPEAT wrap → patterns tile seamlessly (toroidal), matching seedField's
  // toroidal patches; LINEAR so the display pass stretches the field smoothly
  // (neighbor taps land on texel centers, so the sim reads stay exact).
  const stateTex: [WebGLTexture, WebGLTexture] = [
    makeTex(gl, simW, simH, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.LINEAR, gl.REPEAT, seed),
    makeTex(gl, simW, simH, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.LINEAR, gl.REPEAT, null),
  ]
  const stateFbo: [WebGLFramebuffer, WebGLFramebuffer] = [fboFor(gl, stateTex[0]), fboFor(gl, stateTex[1])]
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  const lutTex = makeTex(gl, 256, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, gl.CLAMP_TO_EDGE, buildLUT(cfg.stops))

  const u = (p: WebGLProgram, names: string[]) =>
    Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]))
  const locs = {
    sim: u(simProg, ['u_state', 'u_texel', 'u_feed', 'u_kill']),
    display: u(displayProg, ['u_state', 'u_lut', 'u_texel']),
  }
  return { simProg, displayProg, vao, stateTex, stateFbo, lutTex, simW, simH, cur: 0, locs }
}

export function uploadLUT(gl: WebGL2RenderingContext, res: GrayScottGL, stops: string[]): void {
  gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLUT(stops))
}

export function disposeGL(gl: WebGL2RenderingContext, res: GrayScottGL): void {
  for (const p of [res.simProg, res.displayProg]) gl.deleteProgram(p)
  gl.deleteVertexArray(res.vao)
  for (const t of [...res.stateTex, res.lutTex]) gl.deleteTexture(t)
  for (const f of res.stateFbo) gl.deleteFramebuffer(f)
}

function fullscreen(gl: WebGL2RenderingContext, res: GrayScottGL) {
  gl.bindVertexArray(res.vao)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

/** One reaction-diffusion step: render src→dst over the state field. */
export function step(gl: WebGL2RenderingContext, res: GrayScottGL, cfg: GrayScottConfig): void {
  const src = res.cur, dst = src ^ 1
  gl.disable(gl.BLEND)
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.stateFbo[dst])
  gl.viewport(0, 0, res.simW, res.simH)
  gl.useProgram(res.simProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.stateTex[src])
  gl.uniform1i(res.locs.sim.u_state, 0)
  gl.uniform2f(res.locs.sim.u_texel, 1 / res.simW, 1 / res.simH)
  gl.uniform1f(res.locs.sim.u_feed, cfg.feed)
  gl.uniform1f(res.locs.sim.u_kill, cfg.kill)
  fullscreen(gl, res)
  res.cur = dst
}

/** Advance cfg.simSpeed steps, then display the current field to the screen. */
export function render(gl: WebGL2RenderingContext, res: GrayScottGL, cfg: GrayScottConfig): void {
  for (let i = 0; i < cfg.simSpeed; i++) step(gl, res, cfg)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.useProgram(res.displayProg)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.stateTex[res.cur])
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, res.lutTex)
  gl.uniform1i(res.locs.display.u_state, 0)
  gl.uniform1i(res.locs.display.u_lut, 1)
  gl.uniform2f(res.locs.display.u_texel, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight)
  fullscreen(gl, res)
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors in `grayscott/gl.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/diversions/grayscott/gl.ts
git commit -m "feat(grayscott): WebGL2 reaction-diffusion host (sim + display passes)"
```

---

### Task 6: Diversion contract (wire it up + register)

**Files:**
- Create: `src/diversions/grayscott/index.ts`
- Test: `src/diversions/grayscott/index.test.ts`

**Interfaces:**
- Consumes: `defineDiversion`, `PresetGroup`, `Size` (`framework/types`); `grayScottSchema`, `GrayScottConfig`; `initGL/render/uploadLUT/disposeGL`; `patternPresets`, `colorPresets`.
- Produces: default-exported diversion `{ id:'grayscott', kind:'webgl', ... }`. Auto-registered by `import.meta.glob('../diversions/*/index.ts')`.

- [ ] **Step 1: Write the failing test**

```ts
// src/diversions/grayscott/index.test.ts
import { describe, it, expect } from 'vitest'
import grayscott from './index'

describe('grayscott diversion', () => {
  it('declares the webgl contract + two preset axes', () => {
    expect(grayscott.id).toBe('grayscott')
    expect(grayscott.kind).toBe('webgl')
    expect(typeof grayscott.setup).toBe('function')
    expect(typeof grayscott.frame).toBe('function')
    expect(grayscott.presets?.map((g) => g.label)).toEqual(['Pattern', 'Color'])
  })
  it('update() reseeds only on seed change, morphs otherwise', () => {
    const cfg = grayScottBase()
    const state = { gl: {} as any, res: null as any, cfg }
    // seed change → structural → false (caller will teardown+setup)
    expect(grayscott.update?.(state as any, { ...cfg, seed: cfg.seed + 1 }, { width: 8, height: 8 })).toBe(false)
    // feed/kill (pattern morph) → live → true
    expect(grayscott.update?.(state as any, { ...cfg, feed: 0.03 }, { width: 8, height: 8 })).toBe(true)
  })
})

function grayScottBase() {
  // schema defaults without importing zod parse noise
  return { simSpeed: 12, seed: 1, feed: 0.0545, kill: 0.062, stops: ['#06121f', '#0a4f6e', '#58d8ff'] }
}
```

> Note: the `update()` test for `stops` change calls `uploadLUT`, which needs a GL context — so it is intentionally NOT covered here (Chrome-verified). The two cases above touch no GL.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/diversions/grayscott/index.test.ts`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Implement**

```ts
// src/diversions/grayscott/index.ts
import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { grayScottSchema, type GrayScottConfig } from './schema'
import { initGL, render, uploadLUT, disposeGL, type GrayScottGL } from './gl'
import { patternPresets, colorPresets } from './presets'

type GrayScottState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: GrayScottGL
  cfg: GrayScottConfig
}

// Two independent preset axes (like Physarum). Pattern patches feed/kill; Color
// patches the V→color ramp. simSpeed/seed stay user-controlled, outside both.
const presets: PresetGroup<GrayScottConfig>[] = [
  { label: 'Pattern', options: patternPresets.map((p) => ({ name: p.name, patch: p.patch })) },
  { label: 'Color', options: colorPresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

const grayscott = defineDiversion<typeof grayScottSchema, GrayScottState, 'webgl'>({
  id: 'grayscott',
  title: 'Gray-Scott',
  description: 'Two chemicals react and diffuse into coral, mitosis, and maze patterns that never settle.',
  kind: 'webgl',
  schema: grayScottSchema,

  setup(gl, cfg, size: Size) {
    return { gl, res: initGL(gl, cfg, size.width, size.height), cfg }
  },

  frame(state, gl, _t, _dt) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    render(gl, state.res, state.cfg)
  },

  // resize is a no-op: the display pass samples the field in normalized UV and
  // always fills the screen, so the pattern survives window/fullscreen resizes
  // without reallocation or reseed (the sim field keeps its setup-time size).

  update(state, cfg) {
    // Reseeding needs a fresh field → fall back to teardown + setup.
    if (cfg.seed !== state.cfg.seed) return false
    // Pattern switches + feed/kill drags morph the existing field live; the LUT
    // is swapped in place on a color change. All are non-structural.
    if (cfg.stops.join() !== state.cfg.stops.join()) uploadLUT(state.gl, state.res, cfg.stops)
    state.cfg = cfg
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },

  presets,
})

export default grayscott
```

- [ ] **Step 4: Run the new test + the framework sweeps (codec/preset/registry auto-cover it)**

Run: `npx vitest run src/diversions/grayscott/ src/framework/codecSweep.test.ts src/framework/presetSweep.test.ts src/framework/registry.test.ts`
Expected: PASS — grayscott appears in the registry; codec round-trips its schema; preset sweep validates both groups.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/grayscott/index.ts src/diversions/grayscott/index.test.ts
git commit -m "feat(grayscott): diversion contract + auto-registration (#35)"
```

---

### Task 7: Full gate, README count, Chrome verify

**Files:**
- Modify: `README.md` (diversion count + list entry)

- [ ] **Step 1: Run the full gate**

Run: `npx vitest run` then `npx tsc --noEmit` then `npm run lint` then `npm run build`
Expected: all green. If the build flags an unused import or the lint trips, fix inline.

- [ ] **Step 2: Bump the README diversion count + add the entry**

Find the current count (grep for the number-word, e.g. "Thirteen"/"thirteen"/"13") and the diversion list in `README.md`; increment it and add a Gray-Scott line matching the existing format. Run `git grep -n -iE 'thirteen|13 diversions|13 generative' README.md` to locate.

- [ ] **Step 3: Chrome verify (chrome-devtools MCP — NOT a built-in preview)**

Start the dev server (port 5180), then drive Chrome to `http://localhost:5180/diversion/d/grayscott?mute=1` (config) and the play route. Verify:
- field blooms from the seed patches into a live coral pattern within a few seconds (not a flat gray screen — if gray, `feed`/`kill`/`VMAX` need a 🎚️ pass with the user);
- the **Pattern** picker switches Coral→Mitosis→Maze→Spots→Worms and the field visibly morphs;
- the **Color** picker swaps Deep Coral / Ink Bloom / Magma / Bone live (no restart);
- `feed`/`kill` sliders in the **Advanced** section nudge the pattern without wiping it;
- changing **Seed** restarts the field cleanly;
- resize / fullscreen stretches without crashing;
- pause/fps/share-link chrome all work (free from the framework).

- [ ] **Step 4: Commit the README**

```bash
git add README.md
git commit -m "docs: add Gray-Scott to the diversion gallery (#35)"
```

---

## Self-Review

**Spec coverage:**
- Reaction model + 9-point Laplacian → Task 5 `SIM_FRAG`. ✅
- WebGL2 ping-pong FBO host, `RGBA32F` (full-float, precision) → Task 5. ✅ (spec's `RG32F` widened to `RGBA32F` for guaranteed renderability — matches Physarum; noted.)
- `EXT_color_buffer_float` capability gate + graceful (ErrorBoundary) → Task 5 `initGL`. ✅
- Sim grid capped to 640 long-edge, DPR-decoupled → Task 2 `simDims`. ✅
- Schema: enum-as-PresetGroup `Pattern` (primary), `simSpeed`, advanced clamped `feed`/`kill`, `stops` gradient, `seed` → Tasks 1, 4. ✅
- `update?()` seam → Task 6. ✅ **Refinement:** pattern-switch + feed/kill **morph live (true)**; only `seed` reseeds (false). The spec's "pattern→reseed" is superseded because pattern is realized as a PresetGroup patching feed/kill (Physarum precedent), which `update()` cannot distinguish from a manual feed/kill drag — and live morph is the better screensaver behavior. **Flag to user.**
- **Refinement:** resize is a **no-op** (UV display stretch), superseding the spec's "destructive resize" — Physarum-proven, no restart. **Flag to user.**
- Curated gradient palettes (Deep Coral / Ink Bloom / Magma / Bone) → Task 4. ✅
- Tests: codec round-trip + resilience → **auto** via `codecSweep`; preset patches → Task 4 + `presetSweep`; capability path → throw in `initGL`; determinism → Task 3 `seedField`/`buildLUT`. ✅

**Placeholder scan:** none — every step has complete code or an exact command.

**Type consistency:** `GrayScottConfig` fields (`simSpeed`/`feed`/`kill`/`stops`/`seed`) consistent across schema, presets (`Pick`), gl (`cfg.feed/kill/simSpeed/stops`), index. `GrayScottGL` shape consistent between `initGL` return and `step`/`render`/`disposeGL` consumers. Function names (`initGL`/`step`/`render`/`uploadLUT`/`disposeGL`/`simDims`/`seedField`/`buildLUT`) match across tasks. ✅

## Out of scope → backlog
- User-facing **"Detail"** resolution enum (Coarse/Medium/Fine).
- Raw `F`/`k` free-roam beyond the clamped bands.
- Additional patterns (u-skate world, solitons); fractional `simSpeed` for ultra-calm drift.
