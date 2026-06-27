import { z } from 'zod'

export const plasmaSchema = z.object({
  speed: z.number().min(0).max(3).default(1)
    .meta({ section: 'Pattern', ui: 'slider', min: 0, max: 3, step: 0.05, label: 'Speed',
            help: 'How fast the plasma churns. 0 = frozen.' }),
  scale: z.number().min(0.5).max(8).default(3)
    .meta({ section: 'Pattern', ui: 'slider', min: 0.5, max: 8, step: 0.1, label: 'Scale',
            help: 'Spatial frequency — higher = finer, busier bands.' }),
  warp: z.number().min(0).max(2).default(0.6)
    .meta({ section: 'Pattern', ui: 'slider', min: 0, max: 2, step: 0.05, label: 'Warp',
            help: 'Domain-warp strength — bends the bands into swirls. 0 = plain ripples.' }),
  octaves: z.number().int().min(1).max(5).default(3)
    .meta({ section: 'Pattern', ui: 'slider', min: 1, max: 5, step: 1, label: 'Octaves',
            help: 'Layers of warping. More = more intricate folding.' }),
  contrast: z.number().min(0.5).max(2).default(1)
    .meta({ section: 'Pattern', ui: 'slider', min: 0.5, max: 2, step: 0.05, label: 'Contrast',
            help: 'Sharpness of the color banding between the two colors.' }),
  colorA: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#10063a')
    .meta({ section: 'Color', ui: 'color', label: 'Color A' }),
  colorB: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff5d8f')
    .meta({ section: 'Color', ui: 'color', label: 'Color B' }),
})

export type PlasmaConfig = z.infer<typeof plasmaSchema>
