import { z } from 'zod'
import { MODEL_IDS } from './models'

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
  seed: z.number().int().default(1337)
    .meta({ section: 'Simulation', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed restarts the variant identically. '
                + 'A shared link is seedless — every fresh visit grows a different variant.' }),
})

export type NeuralCaConfig = z.infer<typeof neuralCaSchema>
