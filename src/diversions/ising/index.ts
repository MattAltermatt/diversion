// Ising — the 2D Ising model of ferromagnetism (GH #146). A lattice of ±1 spins
// evolves under Metropolis dynamics at temperature T; a slow temperature "breath"
// carries the screen through the critical point Tc ≈ 2.27·J, so ordered domains
// coarsen and merge, dissolve into thermal static, then re-form — forever.
import { defineDiversion } from '../../framework/types'
import { isingSchema } from './schema'
import {
  createIsingState, advanceIsing, renderIsing, resizeIsing, applyColors,
  currentTemperature, type IsingState,
} from './ising'

const ising = defineDiversion<typeof isingSchema, IsingState, '2d'>({
  id: 'ising',
  title: 'Ising',
  description: 'The 2D Ising model of a magnet: a lattice of up/down spins that flip by '
    + 'Metropolis dynamics. As the temperature breathes through the critical point, spins '
    + 'condense into vast domains, dissolve into roiling static, and coarsen back again.',
  kind: '2d',
  schema: isingSchema,

  setup(ctx, config, size) {
    const st = createIsingState(config, size.width, size.height)
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    renderIsing(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    state.elapsed += dt
    advanceIsing(state, currentTemperature(state), state.cfg.speed)
    if (state.needBlit) renderIsing(state, ctx)
  },

  resize(state, size) {
    resizeIsing(state, size.width, size.height)
  },

  update(state, config) {
    // A different lattice resolution or seed wants a fresh board → full re-setup.
    if (config.cellSize !== state.cfg.cellSize) return false
    if (config.seed !== state.cfg.seed) return false
    // Everything else applies live over the CURRENT lattice: temperature mode/range,
    // coupling, field, speed read straight off cfg next frame; colours re-cache.
    const colorsChanged = config.colorUp !== state.cfg.colorUp
      || config.colorDown !== state.cfg.colorDown
      || config.boundaryColor !== state.cfg.boundaryColor
      || config.background !== state.cfg.background
      || config.boundary !== state.cfg.boundary
    state.cfg = config
    if (colorsChanged) applyColors(state, config)
    else state.needBlit = true
    return true
  },
})

export default ising
