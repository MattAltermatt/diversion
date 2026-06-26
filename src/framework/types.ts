import type { ZodObject } from 'zod'

export interface Size {
  width: number
  height: number
}

export type RenderContext = CanvasRenderingContext2D | WebGL2RenderingContext

/** Opaque per-run state a diversion builds in setup() and the framework threads back. */
export type DiversionState = unknown

export interface Diversion<Config = unknown> {
  id: string // slug, e.g. "flow-field"
  title: string
  description: string
  kind: '2d' | 'webgl'
  schema: ZodObject<any> // drives form + URL codec + Config type
  setup(ctx: RenderContext, config: Config, size: Size): DiversionState
  frame(state: DiversionState, ctx: RenderContext, t: number, dt: number): void
  resize?(state: DiversionState, size: Size): void
  teardown?(state: DiversionState): void
}
