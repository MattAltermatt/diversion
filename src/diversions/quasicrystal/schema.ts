import { z } from 'zod'

export const quasicrystalSchema = z.object({
  // ── Pattern ──
  waves: z.number().int().min(3).max(12).default(7)
    .meta({ section: 'Pattern', ui: 'slider', min: 3, max: 12, step: 1, label: 'Waves',
            help: 'How many wave gratings are superimposed — this sets the rotational symmetry. '
                + '5 and 7 give the classic quasicrystal “flowers”; higher is denser and more circular.' }),
  scale: z.number().min(4).max(60).default(22)
    .meta({ section: 'Pattern', ui: 'slider', min: 4, max: 60, step: 1, label: 'Scale',
            help: 'Zoom — spatial frequency of the waves. Higher packs more fringes into view.' }),
  fringes: z.number().min(0.5).max(8).default(3)
    .meta({ section: 'Pattern', ui: 'slider', min: 0.5, max: 8, step: 0.1, label: 'Fringes',
            help: 'How finely the summed waves resolve into bright bands — higher makes thinner, '
                + 'more numerous fringes.' }),
  speed: z.number().min(0).max(3).default(0.4)
    .meta({ section: 'Pattern', ui: 'slider', min: 0, max: 3, step: 0.05, label: 'Speed',
            help: 'How fast the interference drifts and reorganizes. 0 = frozen.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Rotates the whole lattice — every fresh visit shows a different quasicrystal. '
                + 'A shared link is seedless; an explicit seed reproduces one exactly.' }),
  // ── Color ──
  colorA: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0420')
    .meta({ section: 'Color', ui: 'color', label: 'Trough color',
            help: 'The color of the dark valleys between fringes (the background).' }),
  colorB: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3ad0ff')
    .meta({ section: 'Color', ui: 'color', label: 'Crest color',
            help: 'The color of the bright interference crests.' }),
})

export type QuasicrystalConfig = z.infer<typeof quasicrystalSchema>
