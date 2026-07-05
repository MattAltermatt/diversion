import { z } from 'zod'

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

// Base → tip: oxygen green (~557 nm) at the curtain's bright base, climbing through
// teal into the rare high-altitude violet/magenta (nitrogen + high-O). Vivid on a
// near-black sky (UX invariant #5 — err toward more contrast).
const CLASSIC_GREEN = ['#25ff86', '#1fe6c0', '#7d5cff', '#ff45c8']

export const auroraSchema = z.object({
  // ── Aurora ──
  brightness: z.number().min(0.2).max(3).default(1.2)
    .meta({ section: 'Aurora', ui: 'slider', min: 0.2, max: 3, step: 0.05, label: 'Brightness',
            help: 'Overall glow of the curtains. Higher makes them bloom brighter against the sky.' }),
  speed: z.number().min(0).max(2).default(0.3)
    .meta({ section: 'Aurora', ui: 'slider', min: 0, max: 2, step: 0.02, label: 'Drift speed',
            help: 'How fast the curtains ripple, sway and reform. 0 = frozen. Zen default is slow.' }),
  curtainScale: z.number().min(0.5).max(6).default(2)
    .meta({ section: 'Aurora', ui: 'slider', min: 0.5, max: 6, step: 0.1, label: 'Curtain scale',
            help: 'How many curtains span the sky. Low = a few broad drapes; high = many narrow ribbons.' }),
  raySharpness: z.number().min(0).max(1).default(0.6)
    .meta({ section: 'Aurora', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Ray sharpness',
            help: 'Strength of the vertical hanging-ray striations within each curtain. '
                + '0 = smooth sheets; 1 = crisp, fibrous rays.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Aurora', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Offsets the noise field, so every fresh visit shows a different night. '
                + 'A shared link is seedless; an explicit seed reproduces one exactly.' }),
  // ── Sky ──
  skyZenith: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#02030a')
    .meta({ section: 'Sky', ui: 'color', label: 'Zenith',
            help: 'The near-black colour directly overhead.' }),
  skyHorizon: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a1230')
    .meta({ section: 'Sky', ui: 'color', label: 'Horizon',
            help: 'The faint dark-blue glow low on the horizon.' }),
  starDensity: z.number().min(0).max(1).default(0.35)
    .meta({ section: 'Sky', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Stars',
            help: 'How many stars sprinkle the sky. 0 = none.' }),
  // ── Color ──
  paletteStops: z.array(hex6).min(2).max(8).default(CLASSIC_GREEN)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Palette (base → tip)',
            help: 'The colour ramp along each curtain — first stop is the bright base, last is the '
                + 'high tip. Real aurora runs green at the base up to magenta / red at altitude.' }),
})

export type AuroraConfig = z.infer<typeof auroraSchema>
