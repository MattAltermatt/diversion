import type { NeuralCaConfig } from './schema'
import { CURATED } from './models'

// One preset per curated DTD texture. Each patches only `pattern`; the framework's PresetPicker
// renders these as a dropdown (the diversion's texture selector). Switching is structural — the
// diversion re-runs setup to load the new model's weights.
export const texturePresets: { name: string; patch: Pick<NeuralCaConfig, 'pattern'> }[] =
  CURATED.map((m) => ({ name: m.label, patch: { pattern: m.id } }))
