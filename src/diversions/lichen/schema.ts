import { z } from 'zod'

// Lichen — a sea cliff colonised over centuries. Five species arrive as scattered founders,
// spread at their own rates, and stop where they meet each other, so the rock fills with a
// mosaic of contested borders outlined by dark contact margins. They sort into horizontal
// bands by height above the water, because that is what sets how much salt spray reaches
// them. Quartz veins and smooth unweathered faces run through it all and nothing ever grows
// on those. Every few decades a storm scrubs part of the cliff in a spiral sweep, leaving a
// sparse remnant, and the race to refill starts again.
//
// There is deliberately NO `background` field: the simulation paints every pixel, so a
// background swatch would be a control with no visible effect. The two grounds that do
// show — the stone and the sea — are exposed instead.

const hex = () => z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const lichenSchema = z.object({
  yearsPerMinute: z.number().min(5).max(140).default(40)
    .meta({ section: 'Tempo', ui: 'slider', min: 5, max: 140, step: 1, label: 'Years per minute',
            help: 'How fast the decades run. This also sets how often storms arrive in real '
                + 'time: at the default a storm lands roughly every half minute.' }),

  exposure: z.number().min(0.15).max(1).default(0.55)
    .meta({ section: 'Rock', ui: 'slider', min: 0.15, max: 1, step: 0.01, label: 'Wave exposure',
            help: 'Exposed shores throw spray higher up the cliff, which draws the species '
                + 'bands wide and sharp. Sheltered ones let them blur together.' }),
  relief: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Rock', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Relief',
            help: 'How much the rock\'s own hollows hold water and its ridges shed it, so the '
                + 'band edges wander instead of ruling straight across.' }),
  bareRock: z.number().min(0).max(40).default(12)
    .meta({ section: 'Rock', ui: 'slider', min: 0, max: 40, step: 1, label: 'Bare rock',
            help: 'Percentage of the cliff nothing can take hold on — quartz and smooth '
                + 'unweathered faces. It never heals, so it stays visible through every storm '
                + 'and gives each rock a permanent signature.' }),
  veinStyle: z.number().min(0).max(100).default(35)
    .meta({ section: 'Rock', ui: 'slider', min: 0, max: 100, step: 1, label: 'Veins to speckle',
            help: '0 draws the bare rock as quartz veins following the cliff\'s fractures. '
                + '100 scatters it as smooth unweathered patches.' }),

  sporeRate: z.number().min(0).max(3).default(1)
    .meta({ section: 'Life', ui: 'slider', min: 0, max: 3, step: 0.05, label: 'Spore arrival',
            help: 'How often new colonies land on bare rock. Low gives a few big thalli, high '
                + 'a crowded mosaic of small ones.' }),

  stormEvery: z.number().min(2).max(90).default(18)
    .meta({ section: 'Storms', ui: 'slider', min: 2, max: 90, step: 1, label: 'Storm every',
            help: 'Roughly how often storms come. The true mean is about a quarter longer '
                + 'than this number, because the interval is drawn wide and the next clock '
                + 'only starts once a storm finishes scrubbing — at the default that is a '
                + 'storm every ~23 years, near enough half a minute of real time. Severity '
                + 'varies wildly on its own: most barely scratch the fringe, one in a while '
                + 'takes most of the cliff.' }),
  whimsy: z.number().min(0).max(100).default(15)
    .meta({ section: 'Storms', ui: 'slider', min: 0, max: 100, step: 1, label: 'Whimsy',
            help: 'The odds that a storm carves something the sea would not. 0 and it only '
                + 'ever does what the sea does; 100 and every storm leaves a checkerboard or '
                + 'a face. The lichen grows back over it either way.' }),

  zoom: z.number().min(1).max(8).default(1)
    .meta({ section: 'View', ui: 'slider', min: 1, max: 8, step: 0.1, label: 'Zoom',
            help: 'Magnifies the middle of the cliff so you can look at individual thalli and '
                + 'the contact margins between them. Purely a view change — the simulation is '
                + 'identical at every setting, and the whole cliff is still being computed.' }),

  margins: z.number().min(0).max(100).default(50)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 100, step: 1, label: 'Contact margins',
            help: 'Darkening where two species meet. Map lichen is named for these lines, and '
                + 'they are what stops neighbouring greys reading as one mass.' }),
  species: z.object({
    verrucaria: hex().default('#1a1916').meta({ ui: 'color', label: 'Verrucaria (fringe)' }),
    caloplaca: hex().default('#d66a1a').meta({ ui: 'color', label: 'Caloplaca (splash)' }),
    xanthoria: hex().default('#e2a830').meta({ ui: 'color', label: 'Xanthoria (upper splash)' }),
    lecanora: hex().default('#b0b4ac').meta({ ui: 'color', label: 'Lecanora (dry side)' }),
    ramalina: hex().default('#8a9880').meta({ ui: 'color', label: 'Ramalina (dry zone)' }),
  }).default({
    verrucaria: '#1a1916', caloplaca: '#d66a1a', xanthoria: '#e2a830',
    lecanora: '#b0b4ac', ramalina: '#8a9880',
  }).meta({ section: 'Color', ui: 'group', label: 'Species colours' }),
  rock: hex().default('#3c4148')
    .meta({ section: 'Color', ui: 'color', label: 'Stone',
            help: 'The bare cliff. Kept a field rather than a constant because the fringe '
                + 'species is near-black and its contrast against the stone is the tightest '
                + 'pairing in the piece.' }),
  sea: hex().default('#0e2834')
    .meta({ section: 'Color', ui: 'color', label: 'Sea' }),

  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', collapsed: true,
            randomizeOnFreshLoad: true,
            help: 'Fixes the cliff. Left alone, every visit gets a new one.' }),
})

export type LichenConfig = z.infer<typeof lichenSchema>
