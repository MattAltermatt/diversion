import { z } from 'zod'

/** A soap film seen head-on, filling the frame.
 *
 *  ⚠️ There is deliberately NO palette field and no `colorList`. Every colour in the
 *  piece is the reflectance of the film at that thickness, integrated against the CIE
 *  1931 observer — see `optics.ts`. What that buys visually is not four nice hues (a
 *  hand-picked palette does that, and `foam` already ships one called "Soap Film") but
 *  **desaturation with order**: about ten separable fringes whose chroma decays
 *  continuously to neutral, which no fixed set of stops can do. The legitimate colour
 *  control is the environment `illuminant`, which is physically real.
 *
 *  ⚠️ There is also NO grid-detail control. It was specified and then measured: even
 *  after nucleation was made area-based it still moved the film's whole pace by 1.6x,
 *  because a one-cell stencil covers a different physical distance at each resolution.
 *  Salvage #319 settled that class — derive the count, delete the knob.
 *
 *  Deliberately NOT annotated with an explicit `: z.ZodObject<…>`: a literal annotation
 *  erases `.shape.seed`'s type and degrades `z.infer`. */
export const soapFilmSchema = z.object({
  // ─── Film ─────────────────────────────────────────────────────────────────
  mobility: z.number().min(0).max(1).default(1)
    .meta({ section: 'Film', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Mobility',
            help: 'Which of the two real interface states the film is in. A mobile interface — plain '
                + 'soap — sheds thin patches at its edges that rise through the thicker film and stir '
                + 'it, which is what actually drains a soap film and what makes the swirls. Add a '
                + 'co-surfactant and the interface goes rigid: the patches stop, and the film drains '
                + 'by gravity alone into smooth horizontal bands. Both ends are documented regimes, '
                + 'not settings.' }),
  drainRate: z.number().min(0.2).max(3).default(1)
    .meta({ section: 'Film', ui: 'slider', min: 0.2, max: 3, step: 0.05, label: 'Drain rate',
            help: 'How fast the film loses fluid into its border. It sets how long the whole arc '
                + 'takes — thick and colourless, through the interference colours, to black film and '
                + 'rupture. Turn it down for a longer life, not for a calmer picture; Tempo is the '
                + 'knob for calm.' }),
  tempo: z.number().min(0.1).max(6).default(1)
    .meta({ section: 'Film', ui: 'slider', min: 0.1, max: 6, step: 0.05, label: 'Tempo',
            help: 'Dilates the clock and nothing else. The film passes through exactly the same '
                + 'states, just faster or slower, so the composition at any moment is unchanged.' }),
  filmThickness: z.number().min(400).max(1600).default(900)
    .meta({ section: 'Film', ui: 'slider', min: 400, max: 1600, step: 10, label: 'Formation',
            help: 'Nanometres of film at the moment it forms — where on the colour sequence the piece '
                + 'opens. A real film starts micrometres thick and therefore colourless, and would '
                + 'spend its first minutes as a flat grey; this starts it already inside the '
                + 'interference orders. Above about 1050 nm the opening washes out to neutral.' }),
  rupture: z.enum(['Dilated', 'Slow', 'None']).default('Dilated')
    .meta({ section: 'Film', ui: 'segmented', label: 'Ending',
            options: ['Dilated', 'Slow', 'None'],
            help: 'A real film tears at about ten metres per second and the hole clears the frame in '
                + 'a tenth of a second — at true speed it reads as a glitch and is over before it is '
                + 'seen. Dilated plays the same geometry over four seconds; Slow over eleven. None '
                + 'lets the film thin to black and stay there.' }),

  // ─── Color ────────────────────────────────────────────────────────────────
  illuminant: z.enum(['Daylight', 'Overcast', 'Tungsten', 'Studio']).default('Daylight')
    .meta({ section: 'Color', ui: 'select', label: 'Light',
            options: ['Daylight', 'Overcast', 'Tungsten', 'Studio'],
            help: 'What the film is reflecting. A film has no colour of its own — it returns the '
                + 'light in the room, sorted by thickness — so this is the one colour control the '
                + 'physics allows. Tungsten warms the whole sequence; Overcast is a cold north sky.' }),
  exposure: z.number().min(0.3).max(3).default(1.12)
    .meta({ section: 'Color', ui: 'slider', min: 0.3, max: 3, step: 0.05, label: 'Exposure',
            help: 'A soap film reflects only about eight per cent of the light that hits it, so the '
                + 'picture has to be scaled up to be visible at all. This is that scale. The LUT is '
                + 'normalised so its brightest channel is exactly 1 (a 9.0x lift at n = 1.33); the '
                + 'default here takes the total to ~10.1x, which is the approved mockup\'s look.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#06080b')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'What is behind the film — seen only through the hole while it tears, and for the '
                + 'moment before a new film forms.' }),

  // ─── Advanced ─────────────────────────────────────────────────────────────
  filmIndex: z.number().min(1.2).max(1.45).default(1.33)
    .meta({ section: 'Advanced', ui: 'slider', min: 1.2, max: 1.45, step: 0.005, label: 'Refractive index',
            help: 'How much the film bends light. Water is 1.33. Raising it stretches the whole '
                + 'colour sequence toward thinner film, so the fringes crowd together; it moves every '
                + 'colour coherently rather than recolouring anything.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', label: 'Seed', collapsed: true,
            randomizeOnFreshLoad: true,
            help: 'Fixes the run. Left alone, every visit gets a new film.' }),
})

export type SoapFilmConfig = z.infer<typeof soapFilmSchema>
