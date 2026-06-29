# Logarithmic Circles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `logarithmic-circles` WebGL diversion — an endless zoom through rings of black-and-white (or color) circles, a faithful port of mrange's CC0 Shadertoy "B/W logarithmic circles II" (xscreensaver `logarithmiccircles`, #116).

**Architecture:** A `kind: 'webgl'` diversion following the Plasma reference exactly: a fullscreen-triangle fragment shader does all the drawing; every tunable is a uniform, so `update` is always a live uniform swap (never a structural re-setup). Zoom and rotation phases accumulate on the CPU (like Plasma's `phase`) so live speed edits never jump the animation. The Zod schema is the single source of truth (form + URL codec + Config type). Registry auto-discovers the folder — no manual registration.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4, WebGL2 / GLSL ES 3.00, Vitest.

---

## File Structure

```text
src/diversions/logarithmic-circles/
  schema.ts                 Zod schema (Pattern / Motion / Color sections)
  shader.ts                 VERT_SRC, FRAG_SRC, initGL/render/disposeGL, pure helpers
  presets.ts                Look + Motion preset axes
  index.ts                  defineDiversion contract (kind 'webgl')
  schema.test.ts            schema defaults sanity
  shader.test.ts            advancePhase, tintsToVec3, initGL leak-free error paths
  index.test.ts             Diversion contract conformance
```

- **`schema.ts`** owns all config + UI metadata.
- **`shader.ts`** owns the GLSL and the GL lifecycle, plus the two CPU-side pure helpers (`advancePhase`, `tintsToVec3`) that ARE unit-testable. GLSL itself is verified in Chrome.
- **`presets.ts`** is declared data only.
- **`index.ts`** wires them into the framework contract.

Reference files to read first: `src/diversions/plasma/plasma.ts`, `src/diversions/plasma/index.ts`, `src/diversions/plasma/plasma.test.ts`, `src/diversions/moire/presets.ts`, `src/framework/color.ts` (`hexToRgb`, `parseHex8`), `src/framework/types.ts` (`defineDiversion`, `PresetGroup`, `PresetOption`).

---

## Task 1: Schema

**Files:**
- Create: `src/diversions/logarithmic-circles/schema.ts`
- Test: `src/diversions/logarithmic-circles/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/diversions/logarithmic-circles/schema.test.ts
import { describe, it, expect } from 'vitest'
import { logCirclesSchema } from './schema'

describe('logCirclesSchema defaults', () => {
  it('parses to the faithful calm defaults', () => {
    const cfg = logCirclesSchema.parse({})
    expect(cfg.ringGrowth).toBeCloseTo(4.1)
    expect(cfg.circlesPerRing).toBe(8)
    expect(cfg.circleSize).toBeCloseTo(0.32)
    expect(cfg.layers).toBe(2)
    expect(cfg.zoomSpeed).toBeCloseTo(0.35)
    expect(cfg.direction).toBe('out')
    expect(cfg.rotateSpeed).toBeCloseTo(0.15)
    expect(cfg.color.mode).toBe('mono')
    expect(cfg.color.background).toBe('#000000')
    expect(cfg.color.fg).toBe('#ffffff')
    expect(cfg.color.scanlines).toBeCloseTo(0.1)
    expect(cfg.color.centerDots).toBe(true)
    expect(cfg.color.tints.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/logarithmic-circles/schema.test.ts`
Expected: FAIL — cannot find module `./schema`.

- [ ] **Step 3: Write the schema**

```ts
// src/diversions/logarithmic-circles/schema.ts
import { z } from 'zod'

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const hex8 = z.string().regex(/^#[0-9a-fA-F]{8}$/)

export const logCirclesSchema = z.object({
  ringGrowth: z.number().min(2).max(8).default(4.1)
    .meta({ section: 'Pattern', ui: 'slider', min: 2, max: 8, step: 0.1, label: 'Ring growth',
            help: 'Size ratio between one ring of circles and the next. Low = many small rings; high = dramatic size jumps.' }),
  circlesPerRing: z.number().int().min(3).max(16).default(8)
    .meta({ section: 'Pattern', ui: 'slider', min: 3, max: 16, step: 1, label: 'Circles per ring',
            help: 'How many circles are spaced around each ring.' }),
  circleSize: z.number().min(0.1).max(0.48).default(0.32)
    .meta({ section: 'Pattern', ui: 'slider', min: 0.1, max: 0.48, step: 0.01, label: 'Circle size',
            help: 'Disc radius as a fraction of the gap between rings. High = circles touch and merge.' }),
  layers: z.number().int().min(1).max(2).default(2)
    .meta({ section: 'Pattern', ui: 'slider', min: 1, max: 2, step: 1, label: 'Layers',
            help: 'Interleaved copies that fill the gaps. 2 = the dense packed look; 1 = sparse.' }),

  zoomSpeed: z.number().min(0).max(1.5).default(0.35)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1.5, step: 0.01, label: 'Zoom speed',
            help: 'How fast the field zooms. 0 = frozen. Calm by default.' }),
  direction: z.enum(['in', 'out']).default('out')
    .meta({ section: 'Motion', ui: 'segmented', options: ['in', 'out'], label: 'Direction',
            help: 'Circles emerge at the center and grow outward (out), or fall inward (in).' }),
  rotateSpeed: z.number().min(0).max(1).default(0.15)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Rotate speed',
            help: 'Slow global spin, independent of zoom. 0 = no rotation.' }),

  color: z.object({
    mode: z.enum(['mono', 'color']).default('mono')
      .meta({ ui: 'segmented', options: ['mono', 'color'], label: 'Mode',
              help: 'Mono: faithful black & white. Color: circles cycle a gallery palette.' }),
    background: hex6.default('#000000')
      .meta({ ui: 'color', label: 'Background', help: 'The ground colour, painted every frame.' }),
    fg: hex6.default('#ffffff')
      .meta({ ui: 'color', label: 'Circle colour', showWhen: { field: 'mode', equals: 'mono' },
              help: 'The two-tone circle colour; circles flip between this and the background in a spiral.' }),
    tints: z.array(hex8).min(1).max(8)
      .default(['#37d6ffff', '#8a7bffff', '#ff5fa2ff', '#5effc4ff', '#ffd166ff'])
      .meta({ ui: 'colorList', label: 'Palette', min: 1, max: 8,
              showWhen: { field: 'mode', equals: 'color' },
              help: 'Circles cycle these by ring and cell. (Alpha is ignored.)' }),
    scanlines: z.number().min(0).max(0.3).default(0.1)
      .meta({ ui: 'slider', min: 0, max: 0.3, step: 0.01, label: 'Scanlines',
              help: 'Faint horizontal line texture in the gaps. 0 = clean.' }),
    centerDots: z.boolean().default(true)
      .meta({ ui: 'toggle', label: 'Center dots',
              help: 'The small dot that pulses in the middle of each circle.' }),
  }).default({
    mode: 'mono', background: '#000000', fg: '#ffffff',
    tints: ['#37d6ffff', '#8a7bffff', '#ff5fa2ff', '#5effc4ff', '#ffd166ff'],
    scanlines: 0.1, centerDots: true,
  }).meta({ section: 'Color', ui: 'group', label: 'Color' }),
})

export type LogCirclesConfig = z.infer<typeof logCirclesSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/logarithmic-circles/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/logarithmic-circles/schema.ts src/diversions/logarithmic-circles/schema.test.ts
git commit -m "logcircles: config schema"
```

---

## Task 2: Pure helpers (phase + tints)

**Files:**
- Create: `src/diversions/logarithmic-circles/shader.ts` (helpers first; GL added in Task 3)
- Test: `src/diversions/logarithmic-circles/shader.test.ts`

These are the CPU-side seams around the GLSL. `advancePhase` accumulates and wraps the zoom/rotation clocks; `tintsToVec3` flattens the palette into the `Float32Array` a `vec3[8]` uniform wants.

- [ ] **Step 1: Write the failing test**

```ts
// src/diversions/logarithmic-circles/shader.test.ts
import { describe, it, expect } from 'vitest'
import { advancePhase, tintsToVec3 } from './shader'

describe('advancePhase', () => {
  it('accumulates speed * dt(seconds)', () => {
    // dt is milliseconds; 1000ms at speed 0.5 advances 0.5
    expect(advancePhase(0, 0.5, 1000)).toBeCloseTo(0.5)
    expect(advancePhase(2, 1, 250)).toBeCloseTo(2.25)
  })
  it('is deterministic', () => {
    expect(advancePhase(1.234, 0.3, 16.7)).toBe(advancePhase(1.234, 0.3, 16.7))
  })
  it('wraps to keep float32 precision over long runs', () => {
    // wrap modulus is 1e4; just below it stays, just over wraps near 0
    expect(advancePhase(9999.9, 1, 1000)).toBeCloseTo(0.9, 5) // 10000.9 % 1e4
    expect(advancePhase(0, 1, 1000)).toBeCloseTo(1)
  })
})

describe('tintsToVec3', () => {
  it('flattens up to 8 hex8 colours into a length-24 Float32Array (0..1)', () => {
    const out = tintsToVec3(['#ff0000ff', '#00ff00ff'])
    expect(out.length).toBe(24)
    expect(out[0]).toBeCloseTo(1) // r of #ff0000
    expect(out[1]).toBeCloseTo(0)
    expect(out[2]).toBeCloseTo(0)
    expect(out[3]).toBeCloseTo(0) // r of #00ff00
    expect(out[4]).toBeCloseTo(1)
    // unused slots are zero
    expect(out[6]).toBe(0)
  })
  it('ignores alpha and clamps the list to 8', () => {
    const many = Array.from({ length: 12 }, () => '#808080ff')
    const out = tintsToVec3(many)
    expect(out.length).toBe(24) // only first 8 used
    expect(out[0]).toBeCloseTo(0.502, 2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/logarithmic-circles/shader.test.ts`
Expected: FAIL — cannot find module `./shader`.

- [ ] **Step 3: Write the helpers**

```ts
// src/diversions/logarithmic-circles/shader.ts
import { parseHex8 } from '../../framework/color'

/** Max palette slots, matched by the `u_tints[8]` uniform in the shader. */
export const MAX_TINTS = 8

/** Wrap modulus for the accumulated phase clocks. Keeps the float32 uniforms
 *  precise over multi-hour runs; the wrap causes one imperceptible jump roughly
 *  every few hours (same trade-off as Plasma's u_time). */
const PHASE_WRAP = 1e4

/** Advance a phase clock by speed (units/sec) over dt milliseconds, wrapped. */
export function advancePhase(phase: number, speed: number, dtMs: number): number {
  return (phase + speed * (dtMs / 1000)) % PHASE_WRAP
}

/** Flatten up to MAX_TINTS hex8 colours into a length-(MAX_TINTS*3) Float32Array
 *  of 0..1 RGB (alpha dropped), zero-padding unused slots — the form a
 *  `uniform vec3 u_tints[8]` expects via gl.uniform3fv. */
export function tintsToVec3(tints: string[]): Float32Array {
  const out = new Float32Array(MAX_TINTS * 3)
  const n = Math.min(tints.length, MAX_TINTS)
  for (let i = 0; i < n; i++) {
    const c = parseHex8(tints[i])
    out[i * 3] = c.r / 255
    out[i * 3 + 1] = c.g / 255
    out[i * 3 + 2] = c.b / 255
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/logarithmic-circles/shader.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/logarithmic-circles/shader.ts src/diversions/logarithmic-circles/shader.test.ts
git commit -m "logcircles: phase + tint CPU helpers"
```

---

## Task 3: Shader + GL lifecycle

**Files:**
- Modify: `src/diversions/logarithmic-circles/shader.ts` (append GLSL + initGL/render/disposeGL)
- Test: `src/diversions/logarithmic-circles/shader.test.ts` (append leak-probe tests)

The fragment shader is mrange's algorithm, generalized so `ringGrowth`, `circlesPerRing`, `circleSize`, `layers`, the colour mode, and the dot toggle are all uniforms. `u_zoom` drives zoom **and** the B/W flip (they must stay synced to the zoom step); `u_rot` drives rotation only (decoupled). Mono mode with fg=#fff / bg=#000 reduces exactly to the original (minus the original's global `sqrt` gamma, dropped so `scanlines` reads as a literal intensity).

- [ ] **Step 1: Append the GLSL + GL functions to `shader.ts`**

```ts
// --- appended to src/diversions/logarithmic-circles/shader.ts ---
import { hexToRgb } from '../../framework/color'
import type { LogCirclesConfig } from './schema'

// Fullscreen triangle from gl_VertexID — no attribute buffers (matches Plasma).
export const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

export const FRAG_SRC = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform float u_zoom;        // zoom phase (drives zoom + colour flip)
uniform float u_rot;         // rotation phase (decoupled)
uniform float u_growth;      // ring size ratio
uniform float u_circleSize;  // disc radius as fraction of ring width
uniform int   u_circles;     // circles per ring
uniform int   u_layers;      // 1..2 interleaved copies
uniform float u_scanlines;   // 0..0.3
uniform int   u_dots;        // 0/1 center dot
uniform int   u_mode;        // 0 mono, 1 color
uniform vec3  u_bg;
uniform vec3  u_fg;
uniform vec3  u_tints[8];
uniform int   u_tintCount;
out vec4 fragColor;

#define PI 3.141592654
#define TAU (2.0*PI)
mat2 rot(float a){ return mat2(cos(a), sin(a), -sin(a), cos(a)); }

float expBy(){ return log2(u_growth); }
float fwd(float l){ return exp2(expBy()*l); }
float rev(float l){ return log2(l)/expBy(); }

float modPolar(inout vec2 p, float reps){
  float angle = TAU/reps;
  float a = atan(p.y, p.x) + angle*0.5;
  float r = length(p);
  float c = floor(a/angle);
  a = mod(a, angle) - angle*0.5;
  p = vec2(cos(a), sin(a))*r;
  if (abs(c) >= reps*0.5) c = abs(c);
  return c;
}

vec3 tintAt(float idx){
  int i = int(mod(idx, float(max(u_tintCount, 1))));
  return u_tints[i];
}

void main(){
  vec2 q = gl_FragCoord.xy / u_res;
  vec2 p = -1.0 + 2.0*q;
  p.x *= u_res.x / u_res.y;

  float aa = 4.0 / u_res.y;
  vec3 col = u_bg + vec3(u_scanlines * smoothstep(-sqrt(0.5), sqrt(0.5), sin(0.5*TAU*p.y/aa)));

  float reps = float(u_circles);
  mat2 rot0 = rot(-u_rot);
  for (int i = 0; i < 2; ++i){
    if (i >= u_layers) break;
    float fi = float(i);
    float ltm = u_zoom + 0.5*fi;                 // half zoom-step offset per layer
    mat2 rot1 = rot(fi * PI / reps);             // half-cell angular offset per layer
    float mtm = fract(ltm);
    float ntm = floor(ltm);
    float zz = fwd(mtm);

    vec2 p0 = p; p0 *= rot0; p0 *= rot1; p0 /= zz;
    float l0 = length(p0);
    float n0 = ceil(rev(l0));
    float r0 = fwd(n0);
    float r1 = fwd(n0 - 1.0);
    float r = (r0 + r1) * 0.5;
    float w = r0 - r1;
    n0 -= ntm;

    vec2 p1 = p0;
    float n1 = modPolar(p1, reps);
    p1.x -= r;

    float a = fract(0.5*ltm + n1/reps);
    float d1 = length(p1) - u_circleSize*w;
    float dotScale = (u_dots == 1) ? smoothstep(0.0, 0.45, mod(a, 0.5)) : 1.0;
    float d2 = length(p1) - u_circleSize*w*dotScale;
    d1 *= zz; d2 *= zz;

    vec3 c0 = (u_mode == 1) ? tintAt(n0 + n1) : u_fg;  // primary tone
    vec3 c1 = u_bg;                                    // opposite tone
    vec3 inner = (a < 0.5) ? c0 : c1;
    vec3 outer = (a < 0.5) ? c1 : c0;
    vec3 ccol = mix(outer, inner, smoothstep(0.0, -aa, d2));
    col = mix(col, ccol, smoothstep(0.0, -aa, d1));
  }
  fragColor = vec4(col, 1.0);
}`

export type LogCirclesGL = {
  program: WebGLProgram
  vao: WebGLVertexArrayObject
  locs: Record<string, WebGLUniformLocation | null>
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`LogCircles shader compile failed: ${log}`)
  }
  return sh
}

export function initGL(gl: WebGL2RenderingContext): LogCirclesGL {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC)
  let fs: WebGLShader
  try {
    fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
  } catch (e) {
    gl.deleteShader(vs)
    throw e
  }
  const program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`LogCircles program link failed: ${log}`)
  }
  const vao = gl.createVertexArray()!
  const name = (n: string) => gl.getUniformLocation(program, n)
  return {
    program, vao,
    locs: {
      res: name('u_res'), zoom: name('u_zoom'), rot: name('u_rot'),
      growth: name('u_growth'), circleSize: name('u_circleSize'),
      circles: name('u_circles'), layers: name('u_layers'),
      scanlines: name('u_scanlines'), dots: name('u_dots'), mode: name('u_mode'),
      bg: name('u_bg'), fg: name('u_fg'), tints: name('u_tints'), tintCount: name('u_tintCount'),
    },
  }
}

export function render(
  gl: WebGL2RenderingContext, s: LogCirclesGL, cfg: LogCirclesConfig,
  zoomPhase: number, rotPhase: number,
): void {
  // No gl.clear(): the fullscreen triangle writes every pixel with alpha 1.0.
  gl.useProgram(s.program)
  gl.bindVertexArray(s.vao)
  gl.uniform2f(s.locs.res, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.uniform1f(s.locs.zoom, zoomPhase)
  gl.uniform1f(s.locs.rot, rotPhase)
  gl.uniform1f(s.locs.growth, cfg.ringGrowth)
  gl.uniform1f(s.locs.circleSize, cfg.circleSize)
  gl.uniform1i(s.locs.circles, cfg.circlesPerRing)
  gl.uniform1i(s.locs.layers, cfg.layers)
  gl.uniform1f(s.locs.scanlines, cfg.color.scanlines)
  gl.uniform1i(s.locs.dots, cfg.color.centerDots ? 1 : 0)
  gl.uniform1i(s.locs.mode, cfg.color.mode === 'color' ? 1 : 0)
  const bg = hexToRgb(cfg.color.background)
  const fg = hexToRgb(cfg.color.fg)
  gl.uniform3f(s.locs.bg, bg[0], bg[1], bg[2])
  gl.uniform3f(s.locs.fg, fg[0], fg[1], fg[2])
  gl.uniform3fv(s.locs.tints, tintsToVec3(cfg.color.tints))
  gl.uniform1i(s.locs.tintCount, Math.min(cfg.color.tints.length, MAX_TINTS))
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export function disposeGL(gl: WebGL2RenderingContext, s: LogCirclesGL): void {
  gl.deleteProgram(s.program)
  gl.deleteVertexArray(s.vao)
}
```

- [ ] **Step 2: Append leak-probe tests** (mirrors Plasma's `initGL` leak tests — required anti-regression for GL diversions, #124)

```ts
// --- appended to src/diversions/logarithmic-circles/shader.test.ts ---
import { initGL } from './shader'

type Sh = { kind: 'shader'; type: number }
type Prog = { kind: 'program' }

function leakProbeGL(opts: { fsCompiles: boolean; programLinks: boolean }) {
  const deletedShaders: Sh[] = []
  const deletedPrograms: Prog[] = []
  const VERTEX_SHADER = 0x8b31
  const FRAGMENT_SHADER = 0x8b30
  const gl = {
    VERTEX_SHADER, FRAGMENT_SHADER, COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82,
    createShader: (type: number): Sh => ({ kind: 'shader', type }),
    shaderSource: () => {}, compileShader: () => {},
    getShaderParameter: (sh: Sh) => (sh.type === VERTEX_SHADER ? true : opts.fsCompiles),
    getShaderInfoLog: () => 'compile log',
    deleteShader: (sh: Sh) => deletedShaders.push(sh),
    createProgram: (): Prog => ({ kind: 'program' }),
    attachShader: () => {}, linkProgram: () => {},
    getProgramParameter: () => opts.programLinks,
    getProgramInfoLog: () => 'link log',
    deleteProgram: (p: Prog) => deletedPrograms.push(p),
    createVertexArray: () => ({ kind: 'vao' }),
    getUniformLocation: () => ({ kind: 'loc' }),
  } as unknown as WebGL2RenderingContext
  return { gl, deletedShaders, deletedPrograms, VERTEX_SHADER }
}

describe('initGL leak-free error paths', () => {
  it('deletes the vertex shader when the fragment shader fails to compile', () => {
    const p = leakProbeGL({ fsCompiles: false, programLinks: true })
    expect(() => initGL(p.gl)).toThrow(/compile failed/)
    expect(p.deletedShaders.some((s) => s.type === p.VERTEX_SHADER)).toBe(true)
  })
  it('deletes the program when linking fails', () => {
    const p = leakProbeGL({ fsCompiles: true, programLinks: false })
    expect(() => initGL(p.gl)).toThrow(/link failed/)
    expect(p.deletedPrograms.length).toBe(1)
  })
  it('deletes both shaders on a successful build', () => {
    const p = leakProbeGL({ fsCompiles: true, programLinks: true })
    expect(() => initGL(p.gl)).not.toThrow()
    expect(p.deletedShaders.length).toBe(2)
  })
})
```

- [ ] **Step 3: Run the shader tests**

Run: `npx vitest run src/diversions/logarithmic-circles/shader.test.ts`
Expected: PASS (helpers + leak probes).

- [ ] **Step 4: Commit**

```bash
git add src/diversions/logarithmic-circles/shader.ts src/diversions/logarithmic-circles/shader.test.ts
git commit -m "logcircles: parameterized fragment shader + GL lifecycle"
```

---

## Task 4: Presets

**Files:**
- Create: `src/diversions/logarithmic-circles/presets.ts`

Two independent axes. Each **Look** option patches the whole `color` group (nested group → must be supplied complete; framework spreads at top level). Each **Motion** option patches the top-level motion fields. All options in a group share the SAME key set so `matchPresets` flips to "Custom" on any drift.

- [ ] **Step 1: Write presets**

```ts
// src/diversions/logarithmic-circles/presets.ts
import type { PresetOption } from '../../framework/types'
import type { LogCirclesConfig } from './schema'

const PALETTE = ['#37d6ffff', '#8a7bffff', '#ff5fa2ff', '#5effc4ff', '#ffd166ff']

export const lookPresets: PresetOption<LogCirclesConfig>[] = [
  {
    name: 'Faithful B/W',
    patch: {
      color: { mode: 'mono', background: '#000000', fg: '#ffffff', tints: PALETTE, scanlines: 0.1, centerDots: true },
    },
  },
  {
    name: 'Neon',
    patch: {
      color: { mode: 'color', background: '#05060a', fg: '#ffffff',
        tints: ['#37d6ffff', '#8a7bffff', '#ff5fa2ff', '#5effc4ff'], scanlines: 0.06, centerDots: true },
    },
  },
  {
    name: 'Pastel',
    patch: {
      color: { mode: 'color', background: '#10131c', fg: '#ffffff',
        tints: ['#b8e3ffff', '#d7c8ffff', '#ffd0e2ff', '#c8ffe6ff', '#fff0c4ff'], scanlines: 0.05, centerDots: false },
    },
  },
  {
    name: 'Sunset',
    patch: {
      color: { mode: 'color', background: '#1a0a14', fg: '#ffffff',
        tints: ['#ff7a59ff', '#ffb15eff', '#ffd166ff', '#ff5fa2ff'], scanlines: 0.08, centerDots: true },
    },
  },
]

export const motionPresets: PresetOption<LogCirclesConfig>[] = [
  { name: 'Calm',     patch: { zoomSpeed: 0.25, rotateSpeed: 0.1,  direction: 'out' } },
  { name: 'Hypnotic', patch: { zoomSpeed: 0.45, rotateSpeed: 0.0,  direction: 'in' } },
  { name: 'Vortex',   patch: { zoomSpeed: 0.5,  rotateSpeed: 0.35, direction: 'out' } },
]
```

- [ ] **Step 2: Commit**

```bash
git add src/diversions/logarithmic-circles/presets.ts
git commit -m "logcircles: Look + Motion presets"
```

---

## Task 5: Diversion contract (index.ts) + conformance test

**Files:**
- Create: `src/diversions/logarithmic-circles/index.ts`
- Test: `src/diversions/logarithmic-circles/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/diversions/logarithmic-circles/index.test.ts
import { describe, it, expect } from 'vitest'
import logCircles from './index'

describe('logarithmic-circles diversion contract', () => {
  it('exposes the framework contract', () => {
    expect(logCircles.id).toBe('logarithmic-circles')
    expect(logCircles.kind).toBe('webgl')
    expect(typeof logCircles.setup).toBe('function')
    expect(typeof logCircles.frame).toBe('function')
    expect(typeof logCircles.teardown).toBe('function')
    expect(logCircles.schema).toBeDefined()
  })
  it('declares Look and Motion preset groups', () => {
    const labels = (logCircles.presets ?? []).map((g) => g.label)
    expect(labels).toContain('Look')
    expect(labels).toContain('Motion')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/logarithmic-circles/index.test.ts`
Expected: FAIL — cannot find module `./index`.

- [ ] **Step 3: Write index.ts**

```ts
// src/diversions/logarithmic-circles/index.ts
// Logarithmic Circles — an endless zoom through rings of black-and-white (or
// color) circles. Faithful WebGL port of mrange's CC0 Shadertoy "B/W logarithmic
// circles II" (xscreensaver `logarithmiccircles`). Credit: mrange + jwz/xscreensaver.
import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { logCirclesSchema, type LogCirclesConfig } from './schema'
import { initGL, render, disposeGL, advancePhase, type LogCirclesGL } from './shader'
import { lookPresets, motionPresets } from './presets'

type LogCirclesState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: LogCirclesGL
  cfg: LogCirclesConfig
  zoomPhase: number
  rotPhase: number
}

const presets: PresetGroup<LogCirclesConfig>[] = [
  { label: 'Look', options: lookPresets },
  { label: 'Motion', options: motionPresets },
]

const logCircles = defineDiversion<typeof logCirclesSchema, LogCirclesState, 'webgl'>({
  id: 'logarithmic-circles',
  title: 'Logarithmic Circles',
  description: 'An endless zoom through rings of black-and-white circles — '
    + 'log-spaced, self-similar, hypnotic. Faithful op-art with a gallery color mode.',
  kind: 'webgl',
  schema: logCirclesSchema,
  presets,

  setup(gl, cfg, _size: Size) {
    return { gl, res: initGL(gl), cfg, zoomPhase: 0, rotPhase: 0 }
  },

  frame(state, gl, _t, dt) {
    // Viewport must track the live backing store; resize()/teardown() get no ctx.
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    const dir = state.cfg.direction === 'in' ? -1 : 1
    state.zoomPhase = advancePhase(state.zoomPhase, dir * state.cfg.zoomSpeed, dt)
    state.rotPhase = advancePhase(state.rotPhase, state.cfg.rotateSpeed, dt)
    render(gl, state.res, state.cfg, state.zoomPhase, state.rotPhase)
  },

  update(state, cfg) {
    state.cfg = cfg
    return true // every param is a uniform — always live, never re-setup
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },
})

export default logCircles
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/logarithmic-circles/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full diversion test folder + typecheck**

Run: `npx vitest run src/diversions/logarithmic-circles/` then `npm run build`
Expected: all PASS; build/typecheck clean. (`advancePhase`'s `dir * zoomSpeed` can be negative — `% 1e4` of a negative stays in range; `fract`/`floor` in GLSL handle negative `ltm` correctly.)

- [ ] **Step 6: Commit**

```bash
git add src/diversions/logarithmic-circles/index.ts src/diversions/logarithmic-circles/index.test.ts
git commit -m "logcircles: diversion contract + presets wiring"
```

---

## Task 6: Docs + full suite

**Files:**
- Modify: `README.md` (diversion list/count — match the existing format for the other diversions)

- [ ] **Step 1: Update README**

Find the diversion list/gallery section in `README.md` and add a `Logarithmic Circles` entry in the same style as the existing ones (e.g. Moire, Plasma). Update any "N diversions" count.

- [ ] **Step 2: Run the FULL suite + build**

Run: `npx vitest run` then `npm run build`
Expected: all green (existing 1052 + the new ~12), build clean. The framework's `urlCodec`/`urlKeys` tests must still pass — they now exercise this schema's flat leaf keys generically. If `urlKeys` fails on a duplicate leaf name (e.g. `background`/`mode`/`scanlines` collide with another diversion's leaf), that is expected to fall back to the dotted path; read the test message and confirm it's the documented fallback, not a regression.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "logcircles: README entry"
```

---

## Task 7: Chrome verification (manual, lead-inline)

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server** (background) on the pinned port and hand the URL.

Run: `npm run dev` (pinned to `:5180`).
URL: `http://localhost:5180/d/logarithmic-circles/play?mute=1`

- [ ] **Step 2: Verify in Chrome** (chrome-devtools MCP), checking:
  - Faithful B/W look matches the jwz reference (packed circles spiralling into a focus, scanline ground, center dots).
  - Zoom is **seamless** — no flash/jump at the ring-step wrap.
  - Rotation is smooth and **decoupled** (set zoomSpeed 0 → still rotates; rotateSpeed 0 → pure zoom).
  - `direction` in/out reverses the flow.
  - Color mode reads well; Look + Motion presets all apply through the form.
  - Editing controls live-updates with **no teardown flash** (update returns true).
  - Pause freezes a static frame; fullscreen + fps overlay work (framework chrome).

- [ ] **Step 3:** If all good, leave for user manual inspection before FF-merge.

---

## Task 8: Code review (required pre-merge phase)

- [ ] Dispatch the `diversion-reviewer` agent (fresh, no implementation bias) against the branch diff: check the 5 UX invariants, schema-as-single-source-of-truth, the URL-codec keystone, and GL-resource disposal. Address any blocking findings, then re-verify.

---

## Self-Review Notes (author)

- **Spec coverage:** identity/algorithm → Task 3 shader; schema → Task 1; wiring/phases → Task 5; presets → Task 4; tests → Tasks 1–3, 5; verification → Task 7; review → Task 8. All spec sections mapped.
- **Type consistency:** `LogCirclesConfig`, `LogCirclesGL`, `advancePhase`, `tintsToVec3`, `initGL`/`render`/`disposeGL`, `logCirclesSchema` names are identical across every task that references them. `render` signature `(gl, s, cfg, zoomPhase, rotPhase)` matches its call in `index.ts` Task 5.
- **No placeholders:** every code step is complete; no TBD/“handle edge cases”.
- **Known deviation (deliberate):** the original shader's global `col = sqrt(col)` gamma is dropped so `scanlines` reads as a literal 0..0.3 intensity and mono fg/bg map directly; mono with #fff/#000 otherwise reproduces the original exactly.
