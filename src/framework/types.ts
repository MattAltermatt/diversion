import type { z, ZodObject } from 'zod'

export interface Size {
  width: number
  height: number
}

export type DiversionKind = '2d' | 'webgl' | 'webgpu'

export type RenderContext =
  | CanvasRenderingContext2D
  | WebGL2RenderingContext
  | GPUCanvasContext

/** The concrete drawing context the framework hands a diversion of a given kind:
 *  '2d' → CanvasRenderingContext2D, 'webgl' → WebGL2RenderingContext, 'webgpu' →
 *  GPUCanvasContext. NB the webgpu context is only the presentation surface —
 *  `canvas.getContext('webgpu')` is synchronous, but the GPUDevice it configures
 *  is acquired asynchronously; a webgpu diversion follows the neural-ca ready-flag
 *  pattern (setup returns sync, device resolves in a fire-and-forget tail, frame
 *  no-ops until ready). For the erased kind (the registry's stored `Diversion`),
 *  the union collapses back to RenderContext, so the framework keeps working at
 *  the unknown boundary. */
export type CtxFor<K extends DiversionKind> = K extends '2d'
  ? CanvasRenderingContext2D
  : K extends 'webgl'
    ? WebGL2RenderingContext
    : GPUCanvasContext

/** One pickable preset within a group. `patch` holds the subset of config fields
 *  the preset sets — applied over the current config (top-level), so a nested
 *  group (e.g. `color`) must be supplied whole. */
export interface PresetOption<Config = unknown> {
  name: string
  patch: Partial<Config>
}

/** A labeled set of presets along one independent axis (e.g. "Flow", "Color").
 *  The framework renders one dropdown per group above the config form. */
export interface PresetGroup<Config = unknown> {
  label: string
  options: PresetOption<Config>[]
}

/** A diversion's identity — everything the gallery grid and the router need in
 *  order to render, and nothing that needs its code (#288).
 *
 *  This is the half the registry eager-globs. It lives in a sibling `meta.ts` per
 *  folder, four string fields and no imports, so all 137 cost ~14.7 kB gzipped in
 *  the entry chunk while the implementations load on demand. `index.ts` spreads it
 *  back (`...meta`) rather than restating it, so there is still exactly one source
 *  of truth per field — `contract.test.ts` asserts the two agree.
 *
 *  `schema` is deliberately NOT here. It is the expensive field: eager-globbing the
 *  137 schemas costs 142 kB gzipped (it drags all of zod into the entry) and more
 *  than doubles the entry chunk, for a value nothing needs until a tile actually
 *  mounts — at which point its module has loaded anyway. */
export interface DiversionMeta {
  id: string // slug, e.g. "flow-field"; must equal the folder name
  title: string
  description: string
  kind: DiversionKind // lets the gallery budget GPU contexts BEFORE loading any code
}

export interface Diversion<
  Config = unknown,
  State = unknown,
  K extends DiversionKind = DiversionKind,
> {
  id: string // slug, e.g. "flow-field"
  title: string
  description: string
  kind: K // selects which context the host acquires (and thus CtxFor<K>)
  schema: ZodObject<any> // drives form + URL codec + Config type
  setup(ctx: CtxFor<K>, config: Config, size: Size): State
  frame(state: State, ctx: CtxFor<K>, t: number, dt: number): void
  resize?(state: State, size: Size, ctx: CtxFor<K>): void
  /** Apply a config change to live state without a full re-setup. Return truthy
   *  if applied live; falsy (or omit the hook) → framework re-runs setup(). */
  update?(state: State, config: Config, size: Size): boolean | void
  teardown?(state: State): void
  /** Polled once per rendered frame (after frame()). Return true to ask the framework
   *  to reseed: roll fresh randomizeOnFreshLoad fields (e.g. a new seed) + re-run
   *  setup(). Diversion-specific staleness policy lives here; the framework owns the
   *  reseed lifecycle and live-config reporting. Omit → never auto-restarts. */
  shouldRestart?(state: State, t: number, dt: number): boolean
  /** Config screen: normalize a config edit before it commits (e.g. clear a derived
   *  override when its generator changes). Pure; the framework calls it in
   *  ConfigScreen.update. Omit → edits commit as-is. */
  reconcile?(prev: Config, next: Config): Config
  /** Optional named preset groups (motion, palette, …). Each option patches a
   *  subset of config; the framework renders a dropdown per group. */
  presets?: PresetGroup<Config>[]
  /** Play-screen resume (persistence, #226). Consulted with the incoming URL params
   *  and `direct` (true for a direct load / reload / bookmark / back-forward; false
   *  for an in-app link such as the Config screen's Play button). Return a config to
   *  resume a saved session with — the framework mounts it verbatim and the diversion's
   *  setup() restores its own runtime (e.g. a bred population) from the same store —
   *  or null to mount normally. Typically resume only when `direct`, so an in-app Play
   *  click always honors its config. Pure READ: no side effects beyond stashing the
   *  decision for the setup() that follows, and MUST be idempotent (React may re-run
   *  the resolver). Persistence arming is a separate concern (armPersistence). Omit →
   *  no resume. */
  resumeConfig?(params: URLSearchParams, direct: boolean): Config | null
  /** Arm/disarm this session's persistence (#226). The Play screen calls it with the
   *  mounted config when the run may occupy the diversion's single resume slot (a
   *  seedless Play run), and with null to disarm — on unmount and for a run that must
   *  not persist (an explicit ?seed reproducible link). No OTHER screen calls it, so a
   *  Config-screen live preview or a Gallery thumbnail — which mount the diversion but
   *  never arm — can never clobber the slot. Idempotent; the diversion should still
   *  gate its writes on the armed config matching the run actually being saved. Omit →
   *  never persists. */
  armPersistence?(config: Config | null): void
  /** Discard any persisted session (the Play-screen "New run" control). Called by
   *  the framework when the user asks for a fresh run. Omit → no persistence. */
  clearPersistedRun?(): void
  /** Pointer input (#9). The framework owns the DOM: it attaches the canvas pointer
   *  listeners (only when this hook exists), normalizes each event into the diversion's
   *  OWN draw space — CSS pixels for `2d`, device pixels for `webgl`/`webgpu`, matching
   *  the coords `frame()` draws in — plus a resolution-independent 0..1 `(nx, ny)`, and
   *  tears the listeners down on diversion switch/unmount. The diversion stays a black
   *  box: it never touches the canvas or React, just reads the sample and mutates its
   *  own state (which `frame()` then renders). Omit → no pointer input. */
  onPointer?(state: State, sample: PointerSample): void
  /** ESCAPE HATCH (#290) — this diversion attaches its OWN listeners to `ctx.canvas`
   *  in `setup()` because its gesture is a viewport camera (wheel-zoom, drag-pan with
   *  pointer capture, a persistent view transform) and `onPointer`'s sample cannot
   *  express any of that. The three WebGPU cameras are the whole population.
   *
   *  Declaring it buys exactly one thing: the `.anim-canvas--interactive` class, i.e.
   *  the same `touch-action: none` an `onPointer` diversion gets, still gated on
   *  `interactive`. Without it the browser keeps the touch gesture and a finger drag
   *  both pans and scrolls; the `.config-preview` media override still hands the
   *  gesture back below 820px, which is why such a diversion must ALSO gate its own
   *  touch handling on `gesturesYielded()` (see `framework/canvasGestures.ts`).
   *
   *  Mutually exclusive with `onPointer` in practice — if the sample is enough for
   *  you, use `onPointer` and let the framework own the DOM. Guarded by
   *  `canvasGestures.test.ts`. */
  ownsCanvasGestures?: true
}

/** A pointer event normalized into a diversion's draw space (#9). `x`/`y` are in the
 *  same coordinate space `frame()` draws in (CSS px for `2d`, device px for GPU kinds);
 *  `nx`/`ny` are 0..1 across the canvas (clamped) for resolution-independent logic. */
export interface PointerSample {
  phase: 'down' | 'move' | 'up' | 'leave'
  x: number
  y: number
  nx: number
  ny: number
  buttons: number // MouseEvent.buttons bitmask (0 = no button held, e.g. a hover move)
}

/** Identity factory that ties a diversion's `Config` to its Zod `schema` at the
 *  type level: `Config` is forced to `z.infer<typeof schema>`, so the schema is
 *  the single source of truth the COMPILER enforces — not discipline. If a
 *  diversion's hand-written config type drifts from its schema, this stops
 *  compiling. Runtime behavior is unchanged: it returns its argument verbatim. */
export function defineDiversion<
  S extends ZodObject<any>,
  State,
  K extends DiversionKind = DiversionKind,
>(diversion: Diversion<z.infer<S>, State, K> & { schema: S }): Diversion<z.infer<S>, State, K> {
  return diversion
}
