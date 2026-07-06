import { z } from 'zod'

// Non-cyclic value ramp (fingerprint copper by default).
const COPPER = ['#0a0604', '#7a3b1e', '#e8a84a', '#fff2d8']

export const mccabeSchema = z.object({
  // ── Pattern ──
  scale: z.number().min(0).max(3).default(1.5)
    .meta({ section: 'Pattern', ui: 'slider', min: 0, max: 3, step: 0.1, label: 'Feature size',
            help: 'Shifts every activator/inhibitor scale coarser — smaller values give tight '
                + 'fingerprint ridges, larger give broad reptile-skin cells.' }),
  contrast: z.number().min(0.5).max(3).default(1.1)
    .meta({ section: 'Pattern', ui: 'slider', min: 0.5, max: 3, step: 0.1, label: 'Contrast',
            help: 'How hard the value ramp maps to color — higher sharpens ridge-vs-valley, '
                + 'lower widens the soft metallic transition bands.' }),
  speed: z.number().min(0.25).max(4).default(1.2)
    .meta({ section: 'Pattern', ui: 'slider', min: 0.25, max: 4, step: 0.05, label: 'Speed',
            help: 'How fast the field self-organizes (settling steps per frame).' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Sets the initial noise. A shared link is seedless — every visit '
                + 'grows a different field.' }),
  // ── Color ──
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(COPPER)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Value ramp',
            help: 'Low values map to the first color, high values to the last.' }),
})

export type MccabeConfig = z.infer<typeof mccabeSchema>
