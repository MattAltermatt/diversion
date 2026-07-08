import { z } from 'zod'

// Warm amber / cool blue-cyan / pink neon / periwinkle — a "city lights through
// rain" read out of the box. Alpha doubles as each light's glow intensity (see
// backdrop.ts), so the colorList's built-in alpha slider is a real knob, not
// decoration.
export const DEFAULT_PALETTE = ['#ffb454e6', '#5ec8ffcc', '#ff7f9ab3', '#7d8bffb3']

export const rainOnGlassSchema = z.object({
  // ── Rain ──
  density: z.number().int().min(40).max(400).default(180)
    .meta({ section: 'Rain', ui: 'slider', min: 40, max: 400, step: 10, label: 'Drop density',
            help: 'Target number of droplets kept on the glass. New drops condense in to '
                + 'replace ones that slide off the bottom.' }),
  condensation: z.number().min(0.05).max(1).default(0.35)
    .meta({ section: 'Rain', ui: 'slider', min: 0.05, max: 1, step: 0.01, label: 'Condensation rate',
            help: 'How fast static droplets grow as fog condenses into them. Higher = drops '
                + 'reach the slide threshold sooner and the glass feels busier.' }),
  slideThreshold: z.number().min(0.6).max(4).default(1.8)
    .meta({ section: 'Rain', ui: 'slider', min: 0.6, max: 4, step: 0.05, label: 'Slide threshold',
            help: 'Mass a droplet must condense past before gravity takes over and it breaks '
                + 'loose to run down the glass. Lower = frequent small runs; higher = rare, fat ones.' }),
  trailLength: z.number().min(0).max(100).default(60)
    .meta({ section: 'Rain', ui: 'slider', min: 0, max: 100, step: 1, label: 'Trail persistence',
            help: 'How long the wet streak behind a sliding droplet lingers before the glass '
                + 'fogs back over. 0 = no trail.' }),
  // ── Color ──
  numLights: z.number().int().min(2).max(16).default(8)
    .meta({ section: 'Color', ui: 'slider', min: 2, max: 16, step: 1, label: 'Light blooms',
            help: 'Number of soft glowing blobs in the blurred backdrop — city lights seen '
                + 'through the rain-streaked glass.' }),
  hueDrift: z.number().min(0).max(1).default(0.15)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Hue drift',
            help: 'Slow color drift of the backdrop lights over time. 0 = static hue.' }),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(8).default(DEFAULT_PALETTE)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Palette',
            help: 'Colors the backdrop light blooms are drawn from. Each blob’s alpha sets '
                + 'how bright that light glows.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070c')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Base night-glass color behind the lights.' }),
  // ── Advanced ──
  seed: z.number().int().default(41209)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            collapsed: true,
            help: 'Any integer. The same seed regenerates the same initial droplets and '
                + 'backdrop. A fresh visit rolls a new one.' }),
})

export type RainOnGlassConfig = z.infer<typeof rainOnGlassSchema>
