import { z } from 'zod'

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

// Pond — deep water fading up through teal into a pale glowing crest, wrapping
// back to the deep water tone. Dark→bright, high contrast (UX invariant #5).
const POND = ['#03101f', '#0c5c78', '#2dd4bf', '#eafff8']

export const interferenceSchema = z.object({
  // ── Pattern ──
  sourceCount: z.number().int().min(2).max(8).default(4)
    .meta({ section: 'Pattern', ui: 'slider', min: 2, max: 8, step: 1, label: 'Sources',
            help: 'How many ripple sources sum together. More sources make a denser, busier '
                + 'interference pattern; fewer reads as calm, isolated ripples.' }),
  frequency: z.number().min(4).max(60).default(20)
    .meta({ section: 'Pattern', ui: 'slider', min: 4, max: 60, step: 1, label: 'Frequency',
            help: 'How tightly each source’s rings are spaced — higher packs more rings per source.' }),
  speed: z.number().min(0).max(3).default(1)
    .meta({ section: 'Pattern', ui: 'slider', min: 0, max: 3, step: 0.05, label: 'Speed',
            help: 'How fast the ripples travel outward from each source. 0 = frozen rings — the '
                + 'sources still drift, but the water stops moving.' }),
  driftSpeed: z.number().min(0).max(1.5).default(0.25)
    .meta({ section: 'Pattern', ui: 'slider', min: 0, max: 1.5, step: 0.05, label: 'Drift',
            help: 'How fast the wave sources themselves wander around the field. 0 = fixed sources.' }),
  radius: z.number().min(0.3).max(4).default(1.8)
    .meta({ section: 'Pattern', ui: 'slider', min: 0.3, max: 4, step: 0.1, label: 'Reach',
            help: 'How far a source’s ripple extends before fading to nothing.' }),
  bands: z.number().min(0.3).max(3).default(1.1)
    .meta({ section: 'Pattern', ui: 'slider', min: 0.3, max: 3, step: 0.05, label: 'Bands',
            help: 'How many times the colour palette cycles across the summed wave height — higher '
                + 'gives thinner, more numerous colour bands (a busier moiré).' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Where each wave source starts its drift. A shared link is seedless — every visit '
                + 'shows a different arrangement; an explicit seed reproduces one exactly.' }),
  // ── Color ──
  palette: z.array(hex6).min(2).max(8).default(POND)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Palette',
            help: 'The colour cycle the summed wave height sweeps through. The palette loops — the '
                + 'last colour flows back into the first — matching the ripples’ own wraparound.' }),
})

export type InterferenceConfig = z.infer<typeof interferenceSchema>
