import { z } from 'zod'

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

// Aurora — deep night sky bleeding up through teal into a green curtain and a
// pale crest. Dark→light so the ribbons read with high contrast (UX invariant #5).
const AURORA = ['#060826', '#123a6a', '#1fb3a3', '#8ff0a8', '#f4f6ff']

export const cwavesSchema = z.object({
  // ── Pattern ──
  waveCount: z.number().int().min(3).max(8).default(5)
    .meta({ section: 'Pattern', ui: 'slider', min: 3, max: 8, step: 1, label: 'Waves',
            help: 'How many cosine gratings are summed. More = richer, more intricate '
                + 'interference; fewer = broad, calmer bands.' }),
  scale: z.number().min(1).max(24).default(6)
    .meta({ section: 'Pattern', ui: 'slider', min: 1, max: 24, step: 0.5, label: 'Scale',
            help: 'Zoom — overall spatial frequency. Higher packs more ribbons into view.' }),
  frequencySpread: z.number().min(0).max(1).default(0.35)
    .meta({ section: 'Pattern', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Frequency spread',
            help: 'How much the gratings differ in wavelength. 0 = all the same size (regular '
                + 'moiré); higher mixes coarse and fine ribbons together.' }),
  angleSpread: z.number().min(0).max(1).default(0.35)
    .meta({ section: 'Pattern', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Angle spread',
            help: 'How much the gratings fan out in direction. Low = near-parallel silk ribbons; '
                + 'high = a woven, cellular interference.' }),
  banding: z.number().min(0.2).max(3).default(0.9)
    .meta({ section: 'Pattern', ui: 'slider', min: 0.2, max: 3, step: 0.05, label: 'Banding',
            help: 'How tightly the summed field folds into colour bands. Low = wide, smooth '
                + 'ribbons; high = many thin fringes.' }),
  driftSpeed: z.number().min(0).max(2).default(0.3)
    .meta({ section: 'Pattern', ui: 'slider', min: 0, max: 2, step: 0.05, label: 'Drift speed',
            help: 'How fast the phases drift and the ribbons reorganize. 0 = frozen.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Pattern', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Chooses the base set of angles and wavelengths — every fresh visit shows a '
                + 'different weave. A shared link is seedless; an explicit seed reproduces one exactly.' }),
  // ── Color ──
  palette: z.array(hex6).min(2).max(8).default(AURORA)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Palette',
            help: 'The colour gradient the field flows through. The field oscillates smoothly, so '
                + 'the palette is swept out and back — dark → light → dark — with no seam.' }),
})

export type CwavesConfig = z.infer<typeof cwavesSchema>
