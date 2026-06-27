# Plasma (WebGL host-prover) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Plasma diversion (GitHub #36) — a domain-warped full-screen WebGL color field — as the first `kind:'webgl'` piece, proving the untested WebGL host path end-to-end and landing framework gap #8 (context attributes + context-loss recovery).

**Architecture:** A single full-screen fragment shader (no FBO, no VAO attributes — a `gl_VertexID` fullscreen triangle) drawn each frame with time + param uniforms. The existing `AnimationHost` `webgl2` branch already drives `setup/frame/resize/teardown` and hands device-pixel sizes, so Plasma proves the host with **zero host changes** (the diversion owns `gl.viewport`). Once proven, Task 4 hardens the host with #8 (sane context attributes + `webglcontextlost/restored` recovery) so every later WebGL piece inherits a robust host.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4 + WebGL2 (GLSL ES 3.00). Vitest + @testing-library/react. Registry auto-discovers `src/diversions/*/index.ts` (no registration step).

## Global Constraints

- **Dev server port:** 5180 (`vite.config.ts`). Verify URL: `http://localhost:5180/d/plasma/play?...`
- **5 UX invariants (MUST, first pass):** readability; hide nothing (every param visible + live value); inline `help` on non-obvious params (persistent); `ui:'slider'` requires `min`+`max`+`step`; err toward more contrast.
- **Verify in Chrome only** (chrome-devtools MCP), never a built-in preview. WebGL rendering is NOT unit-testable in jsdom (`getContext('webgl2')` returns null there) — GL/shader/visual correctness is Chrome-verified; only pure helpers (schema codec round-trip, `hexToRgb`) and host *wiring* are unit-tested.
- **Git identity:** `MattAltermatt <1435066+MattAltermatt@users.noreply.github.com>`. Branch `feature/plasma-webgl`, FF-merge to `main` after user-verify.
- **Plasma is deterministic** (a pure function of time + params) — **no `seed` field**, no determinism test.
- Run `npx vitest run` (all green) + `npx tsc -b --noEmit` (clean) before each commit.

---

### Task 1: Plasma schema (single source of truth)

**Files:**
- Create: `src/diversions/plasma/schema.ts`
- Test: `src/diversions/plasma/schema.test.ts`

**Interfaces:**
- Produces: `plasmaSchema` (a `z.object`), `type PlasmaConfig = z.infer<typeof plasmaSchema>`. Fields: `speed:number`, `scale:number`, `warp:number`, `octaves:number(int)`, `contrast:number`, `colorA:string(#rrggbb)`, `colorB:string(#rrggbb)`. Consumed by Tasks 2–3 and the framework form/codec.

- [ ] **Step 1: Write the failing test**

```ts
// src/diversions/plasma/schema.test.ts
import { describe, it, expect } from 'vitest'
import { plasmaSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'

describe('plasma schema', () => {
  it('parses to documented defaults', () => {
    const d = plasmaSchema.parse({})
    expect(d).toEqual({
      speed: 1, scale: 3, warp: 0.6, octaves: 3, contrast: 1,
      colorA: '#10063a', colorB: '#ff5d8f',
    })
  })

  it('every field carries a ui meta', () => {
    for (const [, field] of Object.entries(plasmaSchema.shape)) {
      expect((field.meta() as { ui?: string }).ui).toBeTruthy()
    }
  })

  it('round-trips a tweaked config through the URL codec, omitting defaults', () => {
    const cfg = { ...plasmaSchema.parse({}), scale: 5.5, colorB: '#00ffcc' }
    const sp = encodeConfig(plasmaSchema, cfg)
    expect(sp.get('scale')).toBe('5.5')
    expect(sp.has('speed')).toBe(false) // default omitted
    expect(decodeConfig(plasmaSchema, sp)).toEqual(cfg)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/plasma/schema.test.ts`
Expected: FAIL — cannot resolve `./schema`.

- [ ] **Step 3: Write the schema**

```ts
// src/diversions/plasma/schema.ts
import { z } from 'zod'

export const plasmaSchema = z.object({
  speed: z.number().min(0).max(3).default(1)
    .meta({ ui: 'slider', min: 0, max: 3, step: 0.05, label: 'Speed',
            help: 'How fast the plasma churns. 0 = frozen.' }),
  scale: z.number().min(0.5).max(8).default(3)
    .meta({ ui: 'slider', min: 0.5, max: 8, step: 0.1, label: 'Scale',
            help: 'Spatial frequency — higher = finer, busier bands.' }),
  warp: z.number().min(0).max(2).default(0.6)
    .meta({ ui: 'slider', min: 0, max: 2, step: 0.05, label: 'Warp',
            help: 'Domain-warp strength — bends the bands into swirls. 0 = plain ripples.' }),
  octaves: z.number().int().min(1).max(5).default(3)
    .meta({ ui: 'slider', min: 1, max: 5, step: 1, label: 'Octaves',
            help: 'Layers of warping. More = more intricate folding.' }),
  contrast: z.number().min(0.5).max(2).default(1)
    .meta({ ui: 'slider', min: 0.5, max: 2, step: 0.05, label: 'Contrast',
            help: 'Sharpness of the color banding between the two colors.' }),
  colorA: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#10063a')
    .meta({ ui: 'color', label: 'Color A' }),
  colorB: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff5d8f')
    .meta({ ui: 'color', label: 'Color B' }),
})

export type PlasmaConfig = z.infer<typeof plasmaSchema>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/diversions/plasma/schema.test.ts && npx tsc -b --noEmit`
Expected: PASS (3 tests), clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/plasma/schema.ts src/diversions/plasma/schema.test.ts
git commit -m "Plasma: schema (single source of truth)"
```

---

### Task 2: Plasma renderer module (shaders + GL helpers)

**Files:**
- Create: `src/diversions/plasma/plasma.ts`
- Test: `src/diversions/plasma/plasma.test.ts` (covers the pure `hexToRgb` only — GL is Chrome-verified)

**Interfaces:**
- Consumes: `PlasmaConfig` from Task 1.
- Produces:
  - `hexToRgb(hex: string): [number, number, number]` — `#rrggbb` → 0..1 floats.
  - `VERT_SRC: string`, `FRAG_SRC: string` — GLSL ES 3.00 sources.
  - `type PlasmaGL = { program: WebGLProgram; vao: WebGLVertexArrayObject; locs: Record<string, WebGLUniformLocation | null> }`
  - `initGL(gl: WebGL2RenderingContext): PlasmaGL` — compile/link program, create empty VAO, cache uniform locations.
  - `render(gl: WebGL2RenderingContext, glState: PlasmaGL, cfg: PlasmaConfig, phase: number): void` — set uniforms (u_res from `gl.drawingBufferWidth/Height`), draw the fullscreen triangle.
  - `disposeGL(gl: WebGL2RenderingContext, glState: PlasmaGL): void` — delete program + VAO.

- [ ] **Step 1: Write the failing test (pure helper only)**

```ts
// src/diversions/plasma/plasma.test.ts
import { describe, it, expect } from 'vitest'
import { hexToRgb } from './plasma'

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

Run: `npx vitest run src/diversions/plasma/plasma.test.ts`
Expected: FAIL — cannot resolve `./plasma`.

- [ ] **Step 3: Write the renderer module**

```ts
// src/diversions/plasma/plasma.ts
import type { PlasmaConfig } from './schema'

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// Fullscreen triangle from gl_VertexID — no attribute buffers needed.
export const VERT_SRC = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

export const FRAG_SRC = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform float u_scale;
uniform float u_warp;
uniform int   u_octaves;
uniform float u_contrast;
uniform vec3  u_colorA;
uniform vec3  u_colorB;
out vec4 fragColor;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);
  vec2 p = uv * u_scale;
  float t = u_time;
  for (int i = 0; i < 5; i++) {
    if (i >= u_octaves) break;
    p += u_warp * vec2(
      sin(p.y * 1.3 + t * 0.7 + float(i)),
      cos(p.x * 1.7 - t * 0.6 + float(i))
    );
  }
  float f = sin(p.x) + sin(p.y) + sin((p.x + p.y) * 0.7 + t);
  f = 0.5 + 0.5 * sin(f * u_contrast);
  vec3 col = mix(u_colorA, u_colorB, f);
  fragColor = vec4(col, 1.0);
}`

export type PlasmaGL = {
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
    throw new Error(`Plasma shader compile failed: ${log}`)
  }
  return sh
}

export function initGL(gl: WebGL2RenderingContext): PlasmaGL {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
  const program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Plasma program link failed: ${gl.getProgramInfoLog(program)}`)
  }
  const vao = gl.createVertexArray()!
  const name = (n: string) => gl.getUniformLocation(program, n)
  return {
    program,
    vao,
    locs: {
      res: name('u_res'), time: name('u_time'), scale: name('u_scale'),
      warp: name('u_warp'), octaves: name('u_octaves'), contrast: name('u_contrast'),
      colorA: name('u_colorA'), colorB: name('u_colorB'),
    },
  }
}

export function render(
  gl: WebGL2RenderingContext, s: PlasmaGL, cfg: PlasmaConfig, phase: number,
): void {
  gl.useProgram(s.program)
  gl.bindVertexArray(s.vao)
  gl.uniform2f(s.locs.res, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.uniform1f(s.locs.time, phase)
  gl.uniform1f(s.locs.scale, cfg.scale)
  gl.uniform1f(s.locs.warp, cfg.warp)
  gl.uniform1i(s.locs.octaves, cfg.octaves)
  gl.uniform1f(s.locs.contrast, cfg.contrast)
  const a = hexToRgb(cfg.colorA)
  const b = hexToRgb(cfg.colorB)
  gl.uniform3f(s.locs.colorA, a[0], a[1], a[2])
  gl.uniform3f(s.locs.colorB, b[0], b[1], b[2])
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export function disposeGL(gl: WebGL2RenderingContext, s: PlasmaGL): void {
  gl.deleteProgram(s.program)
  gl.deleteVertexArray(s.vao)
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/diversions/plasma/plasma.test.ts && npx tsc -b --noEmit`
Expected: PASS (1 test), clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/plasma/plasma.ts src/diversions/plasma/plasma.test.ts
git commit -m "Plasma: WebGL renderer (shaders + GL helpers)"
```

---

### Task 3: Plasma diversion wiring — proves the WebGL host

**Files:**
- Create: `src/diversions/plasma/index.ts`
- Verify: Chrome at `http://localhost:5180`

**Interfaces:**
- Consumes: `plasmaSchema`/`PlasmaConfig` (Task 1); `initGL`/`render`/`disposeGL`/`PlasmaGL` (Task 2); `Diversion`/`Size` from `src/framework/types.ts`.
- Produces: default-exported `Diversion<PlasmaConfig, PlasmaState, 'webgl'>`, auto-discovered by the registry. `type PlasmaState = { gl: PlasmaGL; cfg: PlasmaConfig; phase: number }`.

- [ ] **Step 1: Write the diversion**

```ts
// src/diversions/plasma/index.ts
import type { Diversion, Size } from '../../framework/types'
import { plasmaSchema, type PlasmaConfig } from './schema'
import { initGL, render, disposeGL, type PlasmaGL } from './plasma'

type PlasmaState = { gl: PlasmaGL; cfg: PlasmaConfig; phase: number }

const plasma: Diversion<PlasmaConfig, PlasmaState, 'webgl'> = {
  id: 'plasma',
  title: 'Plasma',
  description: 'Domain-warped color fields drifting across the screen — demoscene plasma.',
  kind: 'webgl',
  schema: plasmaSchema,

  setup(gl, cfg, size: Size) {
    gl.viewport(0, 0, size.width, size.height)
    return { gl: initGL(gl), cfg, phase: 0 }
  },

  frame(state, gl, _t, dt) {
    // accumulate phase so changing Speed never jumps the animation
    state.phase += (dt / 1000) * state.cfg.speed
    render(gl, state.gl, state.cfg, state.phase)
  },

  resize(state, size) {
    // gl is the same context; re-set the viewport for the new backing-store size.
    // (state.gl holds program/vao, not the GL context — viewport is on the live ctx,
    //  which frame() receives; setting it here is harmless until the next frame.)
  },

  update(state, cfg) {
    state.cfg = cfg
    return true // every param is a uniform — always applied live, never re-setup
  },

  teardown(state) {
    // gl context not available here; program/vao are released when the context is
    // dropped on diversion change. disposeGL is wired in Task 4's loss path.
  },
}

export default plasma
```

> NOTE on `resize`/`teardown`: the contract's `resize(state,size)` and `teardown(state)` do **not** receive the `gl` context. The viewport must therefore be re-applied from `frame` (which does receive `gl`). Adjust `frame` to set the viewport from the live backing store each frame — cheap and always-correct:

```ts
  frame(state, gl, _t, dt) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    state.phase += (dt / 1000) * state.cfg.speed
    render(gl, state.gl, state.cfg, state.phase)
  },
```

With per-frame viewport, `resize` can be omitted entirely. Remove the empty `resize` and the `setup` `gl.viewport` line (the first `frame` sets it). Final `setup` body: `return { gl: initGL(gl), cfg, phase: 0 }`.

- [ ] **Step 2: Typecheck + full suite**

Run: `npx tsc -b --noEmit && npx vitest run`
Expected: clean typecheck; all tests green (plasma + flow-field + framework). The registry glob now includes plasma with no registration.

- [ ] **Step 3: Start the dev server (background)**

Run: `npm run dev` (background). Confirm it is listening on **5180** (Vite may bump the port — check the actual port).

- [ ] **Step 4: Chrome verify — THIS proves the WebGL host path**

Using chrome-devtools MCP (never a built-in preview):
1. Gallery `http://localhost:5180/` → the **Plasma** tile renders a live animated preview (not black).
2. Config `http://localhost:5180/d/plasma` → every control visible with live values (speed/scale/warp/octaves/contrast sliders + Color A/B pickers); inline help shows on the documented fields; the preview animates and **looks good** (rich swirling color, strong contrast — UX invariant #5), not a flat wash.
3. Edit a slider → preview updates live AND the URL gains the param (defaults omitted).
4. Open `http://localhost:5180/d/plasma/play?scale=5.5&colorB=%2300ffcc` → the look reconstructs from the URL.
5. Fullscreen + pause both work; **console is clean** (no GL warnings/errors). Capture a screenshot for the user-verify handoff.

If it renders black or errors: systematic-debugging — check shader compile/link logs (the `throw`s surface them), confirm `getContext('webgl2')` returned non-null in Chrome, confirm `drawingBufferWidth/Height` are non-zero.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/plasma/index.ts
git commit -m "Plasma: diversion wiring — proves the WebGL host path (#36)"
```

---

### Task 4: #8 — WebGL context attributes + context-loss recovery (framework)

**Files:**
- Modify: `src/framework/AnimationHost.tsx` (context creation ~line 31-34; setup effect ~52-92)
- Test: `src/framework/AnimationHost.test.tsx` (add a webgl-wiring describe block)

**Interfaces:**
- Consumes: the existing `AnimationHost` setup effect + `runRef`/`lastConfigRef`/`pausedRef`/`loop`.
- Produces: WebGL2 created with `{ alpha:false, antialias:true, powerPreference:'high-performance' }`; `webglcontextlost` (preventDefault + pause) and `webglcontextrestored` (re-run `setup` with the latest config, resume) listeners on the canvas, removed on cleanup.

- [ ] **Step 1: Write the failing tests (jsdom wiring — not GL rendering)**

Add to `src/framework/AnimationHost.test.tsx`. Extend the `beforeEach` stub to record `getContext` args and return a fake webgl context, and add a `kind:'webgl'` diversion factory:

```ts
// add near the top, after existing imports
let lastContextArgs: unknown[] = []

// replace the existing getContext stub in beforeEach with one that records args
// and returns a usable fake for both kinds:
HTMLCanvasElement.prototype.getContext = vi.fn((...args: unknown[]) => {
  lastContextArgs = args
  return { setTransform() {}, fillRect() {}, viewport() {}, drawingBufferWidth: 300, drawingBufferHeight: 150 }
}) as unknown as typeof HTMLCanvasElement.prototype.getContext

// helper: a webgl diversion that records lifecycle calls
function makeWebglDiv(calls: string[]): Diversion {
  return {
    id: 'glfake', title: 'GLFake', description: '', kind: 'webgl',
    schema: z.object({ v: z.number().default(0) }),
    setup: () => { calls.push('setup'); return { s: 1 } },
    frame: () => {},
  }
}
```

```ts
describe('AnimationHost WebGL host (#8)', () => {
  it('creates webgl2 with sane context attributes', () => {
    render(<AnimationHost diversion={makeWebglDiv([])} config={{ v: 0 }} />)
    expect(lastContextArgs[0]).toBe('webgl2')
    expect(lastContextArgs[1]).toMatchObject({ alpha: false, powerPreference: 'high-performance' })
  })

  it('re-runs setup on webglcontextrestored', () => {
    const calls: string[] = []
    const { container } = render(<AnimationHost diversion={makeWebglDiv(calls)} config={{ v: 0 }} />)
    expect(calls).toEqual(['setup'])
    const canvas = container.querySelector('canvas')!
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(calls).toEqual(['setup', 'setup'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/framework/AnimationHost.test.tsx`
Expected: FAIL — attributes not passed (arg[1] undefined); restore does not re-run setup.

- [ ] **Step 3: Implement in `AnimationHost.tsx`**

Replace the context-acquisition (lines 31-34) with attribute-passing:

```tsx
    const ctx = (
      diversion.kind === 'webgl'
        ? canvas.getContext('webgl2', {
            alpha: false,
            antialias: true,
            powerPreference: 'high-performance',
          })
        : canvas.getContext('2d')
    ) as RenderContext | null
    if (!ctx) return
```

Inside the setup effect, after `loop.start()` and the existing `onResize`/`onVisibility` wiring, add context-loss handling (only for webgl):

```tsx
    const onLost = (e: Event) => {
      e.preventDefault() // required, or the context never restores
      loop.setPaused(true)
    }
    const onRestored = () => {
      run.size = sizeOf()
      run.state = diversion.setup(ctx, lastConfigRef.current, run.size)
      loop.setPaused(pausedRef.current || document.hidden)
    }
    if (diversion.kind === 'webgl') {
      canvas.addEventListener('webglcontextlost', onLost as EventListener)
      canvas.addEventListener('webglcontextrestored', onRestored)
    }
```

And in the cleanup return, remove them:

```tsx
    return () => {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      if (diversion.kind === 'webgl') {
        canvas.removeEventListener('webglcontextlost', onLost as EventListener)
        canvas.removeEventListener('webglcontextrestored', onRestored)
      }
      loop.stop()
      loopRef.current = null
      runRef.current = null
      diversion.teardown?.(run.state)
    }
```

> `lastConfigRef.current` (not the effect-captured `config`) is used on restore so a context loss after live config edits rebuilds with the **current** look.

- [ ] **Step 4: Run tests + typecheck + full suite**

Run: `npx vitest run && npx tsc -b --noEmit`
Expected: all green (new webgl wiring tests + existing 2d lifecycle tests + plasma), clean typecheck. Confirm the existing 2d tests still pass (the `getContext` stub now also returns `viewport`/`drawingBuffer*` — harmless for 2d).

- [ ] **Step 5: Chrome verify — context-loss actually recovers**

Dev server on 5180, open `http://localhost:5180/d/plasma/play`. In the chrome-devtools console:

```js
const c = document.querySelector('canvas');
const gl = c.getContext('webgl2');
const ext = gl.getExtension('WEBGL_lose_context');
ext.loseContext();           // canvas should freeze/blank, console clean (no uncaught)
setTimeout(() => ext.restoreContext(), 500); // animation resumes, no permanent blank
```

Expected: after `restoreContext()` the plasma resumes animating; console has no uncaught errors. (This is the screensaver-correctness MUST — an unattended GPU reset must not leave a dead canvas.)

- [ ] **Step 6: Commit**

```bash
git add src/framework/AnimationHost.tsx src/framework/AnimationHost.test.tsx
git commit -m "Framework: WebGL context attributes + context-loss recovery (#8)"
```

---

### Task 5: Docs, review, ship

**Files:**
- Modify: `CHANGELOG.md` (create if absent), `README.md` (gallery now has 2 pieces; WebGL path proven)

- [ ] **Step 1: Update docs**

Add a `CHANGELOG.md` entry: Plasma diversion (#36) shipped — first WebGL piece; framework #8 (context attributes + context-loss recovery) landed; WebGL host path proven. Update `README.md`'s diversion list / feature set to include Plasma and note WebGL is now exercised.

- [ ] **Step 2: Commit docs**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: Plasma + WebGL host (#36, #8)"
```

- [ ] **Step 3: Code review (required phase)**

Dispatch the `diversion-reviewer` agent against the branch diff (no implementation bias) — checks the 5 UX invariants, schema-as-single-source-of-truth, codec keystone integrity, and the WebGL host change. Address findings via `superpowers:receiving-code-review`.

- [ ] **Step 4: User-verify handoff (gate before FF-merge)**

Hand the user the verify URL `http://localhost:5180/d/plasma/play?scale=5&warp=0.8` + the gallery + config screens and the context-loss check. Surface the screenshot. **Wait for explicit approval.**

- [ ] **Step 5: Ship (after approval)**

Use the `ship-diversion` skill: squash to clean commits → FF-merge to `main` → push → watch GH Pages deploy → validate live at `mattaltermatt.github.io/diversion/#/d/plasma/play` (open, watch console, confirm it renders) → close **#36** and **#8** → comment on **#13** reframing it ("first nontrivial shader on the host Plasma proved; #8 done") → delete the merged feature branch (both ends).

---

## Self-Review

**Spec coverage (#36 + #8):**
- #36 params speed/scale/warp/octaves/contrast/colorA/colorB → Task 1 schema ✓; rendered via uniforms → Task 2/3 ✓.
- #36 "first WebGL piece, prove host" → Task 3 ✓. "bundle #8" → Task 4 ✓.
- #36 MUST "domain-warp + curated palette, not more params" → FRAG_SRC domain-warp loop + tasteful default color pair (#10063a→#ff5d8f) ✓. "viewport-on-resize + no GL leak" → per-frame viewport (Task 3 note) + `disposeGL`/context-drop ✓.
- #8 "context attributes" → Task 4 Step 3 ✓. "context-loss handling" → Task 4 lost/restored ✓.

**Placeholder scan:** none — all steps carry real code/commands.

**Type consistency:** `PlasmaConfig` (Task 1) consumed by `render`/`initGL` (Task 2) and `Diversion<PlasmaConfig, PlasmaState, 'webgl'>` (Task 3). `PlasmaGL` shape defined Task 2, used Task 3. `hexToRgb` signature consistent. Host uses existing `runRef`/`lastConfigRef`/`pausedRef`/`sizeOf`/`loop` names verbatim from the read source.

**Open note for executor:** `teardown(state)` and `resize(state,size)` lack the `gl` context by contract; Task 3's per-frame-viewport approach sidesteps both. GL resource cleanup on diversion-change relies on context drop; the explicit `disposeGL` exists for the (future) case where teardown gains context access — not wired into teardown now (YAGNI), noted so a reviewer doesn't flag it as dead code without context.
