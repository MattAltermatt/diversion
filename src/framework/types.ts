import type { z, ZodObject } from 'zod'

export interface Size {
  width: number
  height: number
}

export type DiversionKind = '2d' | 'webgl'

export type RenderContext = CanvasRenderingContext2D | WebGL2RenderingContext

/** The concrete drawing context the framework hands a diversion of a given kind:
 *  '2d' → CanvasRenderingContext2D, 'webgl' → WebGL2RenderingContext. For the
 *  erased kind (the registry's stored `Diversion`), the union collapses back to
 *  RenderContext, so the framework keeps working at the unknown boundary. */
export type CtxFor<K extends DiversionKind> = K extends '2d'
  ? CanvasRenderingContext2D
  : WebGL2RenderingContext

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
  /** Optional named preset groups (motion, palette, …). Each option patches a
   *  subset of config; the framework renders a dropdown per group. */
  presets?: PresetGroup<Config>[]
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
