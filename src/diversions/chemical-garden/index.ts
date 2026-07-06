import { defineDiversion, type PresetGroup } from '../../framework/types'
import { chemicalGardenSchema, type ChemicalGardenConfig } from './schema'
import {
  advanceGarden,
  computeView,
  createGardenState,
  shouldReseed,
  updateGardenState,
  type GardenState,
} from './garden'
import { render, disposeRender } from './render'
import { gardenPresets, mineralPresets } from './presets'

const presets: PresetGroup<ChemicalGardenConfig>[] = [
  { label: 'Garden', options: gardenPresets },
  { label: 'Palette', options: mineralPresets },
]

const chemicalGarden = defineDiversion<typeof chemicalGardenSchema, GardenState, '2d'>({
  id: 'chemical-garden',
  title: 'Chemical Garden',
  description: 'Mineral tubes climb and branch from seed crystals on a silicate garden floor.',
  kind: '2d',
  schema: chemicalGardenSchema,

  setup(_ctx, config, size) {
    return createGardenState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    advanceGarden(state, dt)
    render(state, ctx)
  },

  resize(state, size) {
    // Geometry is viewport-independent (fixed world bounds) — only refit the
    // view transform; never regenerate the sim (a ResizeObserver fires on
    // every fullscreen toggle / drag, which would otherwise restart the garden).
    state.w = size.width
    state.h = size.height
    state.view = computeView(state.bounds, size.width, size.height)
  },

  update(state, config) {
    return updateGardenState(state, config)
  },

  shouldRestart(state) {
    return shouldReseed(state)
  },

  teardown(state) {
    disposeRender(state)
  },

  presets,
})

export default chemicalGarden
