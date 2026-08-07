import { z } from 'zod'

// Ablation: lasers on a rectangular track peel a quantized contour-map picture
// from the outside in. One schema drives the form, the URL codec, and the type.
// Two preset axes (Palette = colours, Demolition = laser feel) live in presets.ts.
export const ablationSchema = z.object({
  // ─── Picture ──────────────────────────────────────────────────────────────
  cellSize: z.number().int().min(2).max(40).default(10)
    .meta({ section: 'Picture', ui: 'slider', min: 2, max: 40, step: 1, label: 'Cell size',
            help: 'Size of one cell in pixels. Smaller means a finer picture and a far longer '
                + 'demolition — at 2 there are a quarter-million cells to get through.' }),
  featureSize: z.number().min(4).max(60).default(18)
    .meta({ section: 'Picture', ui: 'slider', min: 4, max: 60, step: 1, label: 'Feature size',
            help: 'Cells per contour feature. Large gives a few huge lazy bands that take an age '
                + 'to peel; small gives crenellated ridges and islands that fragment fast.' }),
  roughness: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Picture', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Roughness',
            help: 'How much the finer octaves contribute. 0 is smooth rolling contours; 1 is '
                + 'ragged, noisy coastline.' }),

  // ─── Color ────────────────────────────────────────────────────────────────
  palette: z.array(z.string()).min(2).max(24)
    // Deliberately stops short of the ground — see the note in presets.ts.
    .default(['#1b4f6b', '#247091', '#2f8b9b', '#67b8ab', '#b2d18d', '#f2e2b0'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Palette',
            help: 'The contour bands, outermost value first. The LENGTH of this list is the '
                + 'number of bands — two colours gives a stark black-and-white map, twenty a '
                + 'slow topographic dissolve.' }),
  background: z.string().default('#05070a')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'What a destroyed cell leaves behind.' }),

  // ─── Lasers ───────────────────────────────────────────────────────────────
  capacity: z.number().int().min(1).max(64).default(12)
    .meta({ section: 'Lasers', ui: 'slider', min: 1, max: 64, step: 1, label: 'Lasers at once',
            help: 'How many lasers ride the track at the same time. Arrivals beyond this wait '
                + 'in the queue outside the gate until a slot frees. Set it to 2 with Spacing '
                + 'at 1 for a pair working exactly opposite each other.' }),
  spacing: z.number().min(0).max(1).default(0)
    .meta({ section: 'Lasers', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Spacing',
            help: 'How lasers are distributed around the track. 0 sends every one in at the '
                + 'gate, so they ride as one bunched pack and the picture is worked by a wave '
                + 'sweeping round. 1 spreads them at perfectly even intervals — and because '
                + 'they all travel at the same speed, they stay evenly spread, so the whole '
                + 'perimeter is worked at once.' }),
  arrivalRate: z.number().min(0.1).max(20).default(2.5)
    .meta({ section: 'Lasers', ui: 'slider', min: 0.1, max: 20, step: 0.1, label: 'Arrival rate',
            help: 'New lasers per second showing up at the gate.' }),
  charge: z.number().int().min(3).max(400).default(60)
    .meta({ section: 'Lasers', ui: 'slider', min: 3, max: 400, step: 1, label: 'Charge',
            help: 'How many cells one laser can destroy before it goes dark and ejects. Its '
                + 'brightness is how much charge it has left.' }),
  speed: z.number().min(2).max(600).default(140)
    .meta({ section: 'Lasers', ui: 'slider', min: 2, max: 600, step: 2, label: 'Track speed',
            help: 'Pixels per second around the track — the pace of the whole piece. It also '
                + 'sets the firing rate, since a laser gets one shot per cell it passes, so '
                + 'there is no separate rate to tune: turning this down slows travel and '
                + 'demolition together without changing what the picture looks like on the way. '
                + 'The low end is a deep crawl; the default is already unhurried.' }),
  targetingBias: z.number().min(0).max(3).default(0.5)
    .meta({ section: 'Lasers', ui: 'slider', min: 0, max: 3, step: 0.05, label: 'Targeting bias',
            help: 'How new lasers pick a colour from what is currently exposed. 0 gives every '
                + 'exposed colour equal attention; 1 is strictly proportional; above 1 the swarm '
                + 'piles onto whatever is most exposed and peels one colour at a time.' }),
  trackOffset: z.number().int().min(4).max(80).default(22)
    .meta({ section: 'Lasers', ui: 'slider', min: 4, max: 80, step: 1, label: 'Track offset',
            help: 'Gap between the track and the picture. Also sets the corner dead zones, where '
                + 'a laser rides past the picture and its beam finds nothing.' }),

  // ─── Advanced ─────────────────────────────────────────────────────────────
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', label: 'Seed', randomizeOnFreshLoad: true,
            collapsed: true,
            help: 'Fixes the picture sequence. Omitted from shared links so every visit gets a '
                + 'new world; pin one here to reproduce an exact run.' }),
  lapCap: z.number().int().min(1).max(12).default(3)
    .meta({ section: 'Advanced', ui: 'number', label: 'Lap cap', min: 1, max: 12,
            help: 'A backstop on how long one laser may ride. A laser that goes a whole lap '
                + 'without a single strike leaves anyway — its colour is not showing anywhere '
                + '— so this only catches the opposite case: one that keeps hitting and still '
                + 'has charge left.' }),
})

export type AblationConfig = z.infer<typeof ablationSchema>
