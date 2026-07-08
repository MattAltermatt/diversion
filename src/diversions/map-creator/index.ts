// Map Creator (GH #150) — a fantasy continent draws itself into being on
// parchment: sea washes in, coastline ink traces around it, biomes wash in
// low-to-high, rivers find the sea, a compass rose settles in — then the
// finished map holds, dissolves, and a fresh one begins.
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { mapCreatorSchema, type MapCreatorConfig } from './schema'
import {
  createState, resizeState, applyConfig, stepState, draw, isDone, type MapCreatorState,
} from './render'
import { palettePresets } from './presets'

const presets: PresetGroup<MapCreatorConfig>[] = [{ label: 'Palette', options: palettePresets }]

const mapCreator = defineDiversion<typeof mapCreatorSchema, MapCreatorState, '2d'>({
  id: 'map-creator',
  title: 'Map Creator',
  description: 'A fantasy continent draws itself into being on parchment — sea, then ink '
    + 'coastlines, biomes washing in by elevation, and rivers finding their way to the sea — '
    + 'before the finished map dissolves and a fresh world begins.',
  kind: '2d',
  schema: mapCreatorSchema,
  presets,

  setup(_ctx, config, size) {
    return createState(config, size)
  },

  frame(state, ctx, _t, dt) {
    stepState(state, dt)
    draw(ctx, state)
  },

  resize(state, size) {
    resizeState(state, size)
  },

  update(state, config) {
    return applyConfig(state, config)
  },

  shouldRestart(state) {
    return isDone(state)
  },
})

export default mapCreator
