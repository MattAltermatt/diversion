// Terrain — a fractal mountain range (GH #96, after xscreensaver `triangle`).
// Layered ridgelines recede into atmospheric haze under a gradient dawn/dusk sky
// and drift slowly by. Heightfield: summed value-noise octaves (fractal fBm)
// sampled per screen column in a normalized, viewport-independent domain.
import { defineDiversion } from '../../framework/types'
import { terrainSchema } from './schema'
import type { PresetGroup } from '../../framework/types'
import type { TerrainConfig } from './schema'
import {
  createTerrainState, stepTerrain, resizeTerrainState, updateTerrainState, resolvePalette,
  drawScene, type TerrainState,
} from './terrain'

const scenePresets: PresetGroup<TerrainConfig>[] = [{
  label: 'Scene',
  options: [
    { name: 'Auto cycle', patch: { timeOfDay: 'Auto', atmosphere: 0.8 } },
    { name: 'Misty dawn', patch: { timeOfDay: 'Dawn', atmosphere: 0.88 } },
    { name: 'Clear day', patch: { timeOfDay: 'Day', atmosphere: 0.5 } },
    { name: 'Golden dusk', patch: { timeOfDay: 'Dusk', atmosphere: 0.75 } },
    { name: 'Blue hour', patch: { timeOfDay: 'Night', atmosphere: 0.7 } },
    { name: 'Alpenglow', patch: { timeOfDay: 'Alpenglow', atmosphere: 0.82 } },
  ],
}]

const terrain = defineDiversion<typeof terrainSchema, TerrainState, '2d'>({
  id: 'terrain',
  title: 'Terrain',
  description: 'Fractal mountain ridgelines recede into misty haze under a slowly shifting '
    + 'dawn-to-dusk sky, drifting endlessly by. After xscreensaver’s triangle.',
  kind: '2d',
  schema: terrainSchema,
  presets: scenePresets,

  setup(_ctx, config, size) {
    return createTerrainState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    stepTerrain(state, dt)
    const pal = resolvePalette(state.cfg.timeOfDay, state.tSec, state.cfg.cycleMinutes)
    drawScene(ctx, state.noise, state.layers, state.cfg, pal, state.w, state.h, state.scrollDist, state.morphZ)
  },

  resize(state, size) {
    resizeTerrainState(state, size.width, size.height)
  },

  update(state, config, size) {
    return updateTerrainState(state, config, size.width, size.height)
  },
})

export default terrain
