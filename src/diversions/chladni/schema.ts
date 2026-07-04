import { z } from 'zod'

// Chladni figures — grains of sand on a vibrating square plate migrate off the
// antinodes and settle onto the nodal lines of a standing-wave mode (n,m),
// tracing the classic filigree figure. Auto-cycling the mode dissolves each
// figure and re-forms the next. One schema drives the form, the URL codec, and
// the Config type.
export const chladniSchema = z.object({
  grainCount: z.number().int().min(500).max(24000).default(11000)
    .meta({ section: 'Grains', ui: 'slider', min: 500, max: 24000, step: 500, label: 'Grain count',
            help: 'How many sand grains dance on the plate. More grains = denser, '
                + 'sharper nodal lines (and a touch more work per frame).' }),
  grainSize: z.number().min(0.5).max(3).default(1)
    .meta({ section: 'Grains', ui: 'slider', min: 0.5, max: 3, step: 0.1, label: 'Grain size',
            help: 'Size of each grain dot, in pixels.' }),

  autoCycle: z.enum(['cycle', 'fixed']).default('cycle')
    .meta({ section: 'The Figure', ui: 'segmented', options: ['cycle', 'fixed'], label: 'Figures',
            help: 'cycle: the driving frequency slowly steps through a sequence of modes — '
                + 'each figure dissolves and re-forms as the next. fixed: hold one chosen mode.' }),
  dwell: z.number().min(3).max(40).default(11)
    .meta({ section: 'The Figure', ui: 'slider', min: 3, max: 40, step: 1, label: 'Dwell (seconds)',
            showWhen: { field: 'autoCycle', equals: 'cycle' },
            help: 'How long each figure holds before the frequency shifts to the next mode.' }),
  modeN: z.number().int().min(1).max(9).default(3)
    .meta({ section: 'The Figure', ui: 'slider', min: 1, max: 9, step: 1, label: 'Mode n',
            showWhen: { field: 'autoCycle', equals: 'fixed' },
            help: 'First mode number. Together (n, m) pick the standing-wave pattern; '
                + 'higher numbers give finer, busier figures.' }),
  modeM: z.number().int().min(1).max(9).default(4)
    .meta({ section: 'The Figure', ui: 'slider', min: 1, max: 9, step: 1, label: 'Mode m',
            showWhen: { field: 'autoCycle', equals: 'fixed' },
            help: 'Second mode number. Try m ≠ n for the ornate asymmetric figures.' }),
  superposition: z.enum(['+', '-']).default('+')
    .meta({ section: 'The Figure', ui: 'segmented', options: ['+', '-'], label: 'Superposition',
            help: 'How the two wave terms combine: w = sin(nπx)sin(mπy) ± sin(mπx)sin(nπy). '
                + '“+” and “−” give two different figure families for the same (n, m).' }),

  migrationSpeed: z.number().min(0).max(1).default(0.42)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Migration speed',
            help: 'How fast grains flow downhill off the antinodes toward the nodal lines. '
                + '0 = grains only bounce in place.' }),
  jitter: z.number().min(0).max(1).default(0.34)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Jitter (bounce)',
            help: 'Vibration energy. Grains bounce hardest on the antinodes and calm down on '
                + 'the nodes — a little keeps them shimmering and stops them freezing off-line.' }),

  grainColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f4ead2')
    .meta({ section: 'Color', ui: 'color', label: 'Grain color',
            help: 'Colour of the sand. A warm off-white on a dark plate reads as delicate filigree.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0a10')
    .meta({ section: 'Color', ui: 'color', label: 'Plate (background)' }),
  afterglow: z.number().min(0).max(0.9).default(0)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 0.9, step: 0.05, label: 'Afterglow',
            help: 'Motion-trail persistence. 0 = crisp (each frame wiped clean); higher leaves '
                + 'a soft comet-tail as grains migrate, so the flow toward the nodes is visible.' }),

  seed: z.number().int().default(7331)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Fixes the grain scatter and the auto-cycle mode order. '
                + 'A fresh visit rolls a new one.' }),
})

export type ChladniConfig = z.infer<typeof chladniSchema>
