import { defineDiversion, type PresetGroup } from '../../framework/types'
import { delaunayMeshSchema, type DelaunayMeshConfig } from './schema'
import { createMeshState, stepMesh, resizeMesh, buildLUT, type MeshState } from './mesh'
import { palettePresets } from './presets'

const presets: PresetGroup<DelaunayMeshConfig>[] = [
  { label: 'Palette', options: palettePresets },
]

const delaunayMesh = defineDiversion<typeof delaunayMeshSchema, MeshState, '2d'>({
  id: 'delaunay',
  title: 'Delaunay Mesh',
  description: 'A field of drifting points, continuously re-triangulated into the ' +
    'Delaunay mesh that connects each to its nearest neighbours — the empty-circumcircle ' +
    'condition that also underlies terrain modelling and low-poly art. Rendered as a shifting ' +
    'web of faceted triangles, like an animated cut crystal. Clean-room port of the xscreensaver ' +
    'hack "delaunay" (Jamie Zawinski / tessellimage, itself built on Paul Bourke\'s classic ' +
    'incremental triangulation algorithm).',
  kind: '2d',
  schema: delaunayMeshSchema,
  presets,

  setup(ctx, config, size) {
    const st = createMeshState(config, size.width, size.height)
    stepMesh(st, ctx, 16) // paint the initial mesh
    return st
  },

  frame(state, ctx, _t, dt) {
    stepMesh(state, ctx, dt)
  },

  resize(state, size) {
    resizeMesh(state, size.width, size.height)
  },

  update(state, config) {
    // count + seed rebuild the whole point set → full re-setup.
    if (config.count !== state.cfg.count) return false
    if (config.seed !== state.cfg.seed) return false
    // palette re-bakes the color LUTs; everything else reads live.
    if (config.palette.join() !== state.cfg.palette.join()) {
      const { fill, edge } = buildLUT(config.palette)
      state.lutFill = fill
      state.lutEdge = edge
    }
    state.cfg = config
    return true
  },
})

export default delaunayMesh
