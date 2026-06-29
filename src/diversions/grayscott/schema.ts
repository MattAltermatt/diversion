import { z } from 'zod'

// V-concentration → color ramp. Default: Deep Coral (deep water → cyan structures).
const DEEP_CORAL = ['#06121f', '#0a4f6e', '#58d8ff']

// Fresh seed per load → every reload grows a different pattern; a URL with an
// explicit ?seed=N pins it (the codec encodes whatever value is active).
const rollSeed = () => Math.floor(Math.random() * 1e9)

export const grayScottSchema = z.object({
  // ── Simulation ──
  simSpeed: z.number().min(0.1).max(24).default(2)
    .meta({ section: 'Simulation', ui: 'slider', min: 0.1, max: 24, step: 0.1, label: 'Sim speed',
            help: 'How fast the reaction evolves, in sub-steps per frame. Below 1 runs a '
                + 'step every few frames for a slow, meditative drift (0.1 ≈ a step every '
                + '10 frames); above 1 runs several steps per frame for faster growth.' }),
  seed: z.number().int().default(rollSeed)
    .meta({ section: 'Simulation', ui: 'number', step: 1, label: 'Seed',
            help: 'Any integer. Each reload grows a different pattern; the same seed always '
                + 'restarts the chemical field the same way. A shared link pins its seed.' }),
  // ── Advanced ── raw feed/kill, clamped to the thin viable band.
  feed: z.number().min(0.01).max(0.09).default(0.0545)
    .meta({ section: 'Advanced', ui: 'slider', min: 0.01, max: 0.09, step: 0.0005, label: 'Feed (F)',
            help: 'Rate the U chemical is replenished. Set by the Pattern preset — most '
                + 'values away from a preset give a blank field, so nudge gently.' }),
  kill: z.number().min(0.045).max(0.07).default(0.062)
    .meta({ section: 'Advanced', ui: 'slider', min: 0.045, max: 0.07, step: 0.0005, label: 'Kill (k)',
            help: 'Rate the V chemical is removed. Coupled with Feed — viable patterns live '
                + 'on a thin curve, so small moves go a long way.' }),
  // ── Color ──
  stops: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(DEEP_CORAL)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Pattern colors',
            help: 'The V-concentration maps along these colors — the lowest is the empty '
                + 'background, the highest is the dense pattern core.' }),
})

export type GrayScottConfig = z.infer<typeof grayScottSchema>
