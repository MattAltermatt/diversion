import { z } from 'zod'
import { MODEL_IDS } from './models'

// Fresh seed per load → every reload grows a different variant; a URL with an explicit ?seed=N
// pins it (the codec encodes whatever value is active). Same pattern as Gray-Scott.
const rollSeed = () => Math.floor(Math.random() * 1e9)

export const neuralCaSchema = z.object({
  // Which trained texture grows. Driven by the "Texture" preset dropdown (11 options) — there is
  // no inline 'select' control, so the field itself is hidden, but it's still URL-encoded so a
  // shared link pins the texture.
  pattern: z.enum(MODEL_IDS as unknown as [string, ...string[]]).default('bubbly')
    .meta({ ui: 'hidden', label: 'Pattern' }),
  speed: z.number().min(0.25).max(6).default(1.5)
    .meta({ section: 'Simulation', ui: 'slider', min: 0.25, max: 6, step: 0.25, label: 'Speed',
            help: 'Simulation steps per frame. Higher churns faster; lower is calmer.' }),
  scale: z.number().min(0.5).max(2).default(1)
    .meta({ section: 'Simulation', ui: 'slider', min: 0.5, max: 2, step: 0.1, label: 'Scale',
            help: 'Cell size — higher = a finer grid of more, smaller cells.' }),
  seed: z.number().int().default(rollSeed)
    .meta({ section: 'Simulation', ui: 'number', step: 1, label: 'Seed',
            help: 'Each reload grows a different variant; the same seed restarts identically. '
                + 'A shared link pins its seed.' }),
})

export type NeuralCaConfig = z.infer<typeof neuralCaSchema>
