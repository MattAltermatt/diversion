import { defineDiversion } from '../../framework/types'
import { ablationSchema } from './schema'
import { ablationPresets } from './presets'
import { createState, step, applyConfig, resizeState, type AblationState } from './ablation'
import { render } from './render'
import { rehydrate } from '../../framework/imageStore'
import { meta } from './meta'

// Ablation: a quantized contour-map picture sits in the middle; a rectangular
// track just outside it carries turrets that each hunt ONE palette colour. A turret
// strikes only the outermost surviving cell of the lane it is passing, dims as it
// discharges, and ejects dark. The picture is peeled from the outside in until
// nothing is left, the track goes quiet, and a new picture resolves in.
const ablation = defineDiversion<typeof ablationSchema, AblationState, '2d'>({
  ...meta,
  schema: ablationSchema,
  presets: ablationPresets,

  setup(_ctx, config, size) {
    // Kick the stored upload's decode off here rather than at module scope: the
    // registry glob is eager, so a module-scope call would make every visitor to
    // the GALLERY pay an image decode for a diversion they have not opened.
    // Fire-and-forget — `setup` is synchronous and cannot await it, so `step`
    // watches the store's version counter and swaps the picture in when it lands.
    // Only the UPLOAD lane needs this. The bundled lane fetches from `resolveImage`
    // on every `newPicture`, which `createState` below runs synchronously.
    if (config.source === 'Yours') rehydrate()
    return createState(config, size)
  },

  // The framework's loop hands dt in MILLISECONDS (clamped to 50); the simulation
  // works in seconds. Without this conversion the piece runs a thousand times fast
  // — which a still screenshot cannot show.
  frame(state, ctx, _t, dt) {
    step(state, dt / 1000)
    render(state, ctx)
  },

  resize(state, size) {
    resizeState(state, size)
  },

  update(state, config, size) {
    return applyConfig(state, config, size)
  },
})

export default ablation
