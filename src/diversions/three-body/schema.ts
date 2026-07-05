import { z } from 'zod'
import { ORBIT_NAMES, CYCLE_ALL } from './orbits'

// One Zod schema is the single source of truth: it drives the config form, the
// URL codec, and the Config type. Every field carries .meta({ ui, label, help,
// min, max, step, options }).

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

// The orbit picker: "Cycle all" (default) walks the whole catalogue one at a
// time, forever; any named orbit pins that single choreography and loops it.
const ORBIT_CHOICES = [CYCLE_ALL, ...ORBIT_NAMES] as const

// One warm-cool triad per body — distinct hues so the three chasing trails read
// apart against the dark ground.
const AURORA = ['#5ef2c8', '#4d9bff', '#c77dff']

export const threeBodySchema = z.object({
  // ── Orbit ──
  orbit: z.enum(ORBIT_CHOICES).default(CYCLE_ALL)
    .meta({ section: 'Orbit', ui: 'select', options: [...ORBIT_CHOICES], label: 'Choreography',
            help: 'Which published periodic three-body orbit to trace. "Cycle all" walks the whole '
                + 'catalogue one at a time, forever; pick a name to hold a single choreography.' }),
  periodsPerOrbit: z.number().int().min(1).max(8).default(3)
    .meta({ section: 'Orbit', ui: 'slider', min: 1, max: 8, step: 1, label: 'Periods per orbit',
            help: 'How many full periods a choreography traces before it fades out and the next one '
                + 'begins. Only matters while cycling.' }),

  // ── Motion ──
  speed: z.number().min(0.2).max(4).default(1.5)
    .meta({ section: 'Motion', ui: 'slider', min: 0.2, max: 4, step: 0.1, label: 'Speed',
            help: 'How fast the bodies chase around the closed curve. Low and slow is the calm '
                + 'default; the integration substeps stay fine regardless.' }),

  // ── Trail ──
  trailFade: z.number().min(0).max(1).default(0.6)
    .meta({ section: 'Trail', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Trail length',
            help: 'How long the glowing trail lingers before fading into the dark. Higher keeps more '
                + 'of the curve lit at once — enough to reveal the whole choreography.' }),
  lineWidth: z.number().min(0.5).max(3).default(1.4)
    .meta({ section: 'Trail', ui: 'slider', min: 0.5, max: 3, step: 0.1, label: 'Line width',
            help: 'Thickness of the bright core stroke, in pixels. Thin reads as a luminous thread.' }),
  glow: z.number().min(0).max(0.4).default(0.22)
    .meta({ section: 'Trail', ui: 'slider', min: 0, max: 0.4, step: 0.02, label: 'Glow',
            help: 'Opacity of the soft halo drawn under each trail and body, giving a gentle bloom. '
                + '0 = plain hairlines.' }),

  // ── Color ──
  colors: z.array(hex6).min(3).max(3).default(AURORA)
    .meta({ section: 'Color', ui: 'colorList', min: 3, max: 3, label: 'Body colors',
            help: 'One color per body — the three chasing trails. Distinct hues read best.' }),
  background: hex6.default('#04060d')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The dark ground the luminous trails are drawn on. Err toward deep and low-key.' }),
  showLabel: z.boolean().default(true)
    .meta({ section: 'Color', ui: 'toggle', label: 'Show orbit name',
            help: 'Print the current choreography’s name subtly in the corner.' }),

  // ── Advanced ──
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. While cycling, it shuffles the order of the catalogue (the iconic '
                + 'figure-eight always leads). A shared link is seedless — every visit shuffles '
                + 'anew; pass ?seed=N to reproduce an exact order.' }),
})

export type ThreeBodyConfig = z.infer<typeof threeBodySchema>
