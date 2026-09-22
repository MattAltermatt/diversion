import { defineDiversion, type Size } from '../../framework/types'
import { meta } from './meta'
import { poolNavySchema, toSimConfig, type PoolNavySchemaConfig } from './schema'
import { poolNavyPresets } from './presets'
import { applyConfig, createFleet, resizeArena, step, type PoolNavyState } from './sim'
import { render } from './render'

type Config = PoolNavySchemaConfig

export default defineDiversion<typeof poolNavySchema, PoolNavyState, '2d'>({
  ...meta,
  schema: poolNavySchema,
  presets: poolNavyPresets,

  setup(_ctx: CanvasRenderingContext2D, config: Config, size: Size) {
    return createFleet(toSimConfig(config), size)
  },

  /**
   * ⚠️ `dt` is MILLISECONDS, clamped at 50 by the framework loop; everything
   * in this folder works in SECONDS. This is the only place that converts, and
   * porting the loop without it would run the piece 1000x too fast — which
   * nothing would catch, because the pure tests drive the modules with
   * literals and the smoke sweep only asserts that a draw happened.
   *
   * `dt === 0` is a real case: AnimationHost repaints a paused piece that way.
   * The step is skipped and the frame still renders.
   */
  frame(state: PoolNavyState, ctx: CanvasRenderingContext2D, _t: number, dt: number) {
    if (dt > 0) step(state, (dt / 1000) * state.cfg.tempo)
    render(state, ctx)
  },

  resize(state: PoolNavyState, size: Size) {
    resizeArena(state, size)
  },

  update(state: PoolNavyState, config: Config, size: Size) {
    return applyConfig(state, toSimConfig(config), size)
  },
})
