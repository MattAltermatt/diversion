import { z } from 'zod'

// Slime Aggregation — Dictyostelium cAMP relay: a soft dark→glow ramp for the
// excitable field (rest → recovering tail → wave crest), plus a distinct bright
// accent for the streaming amoebae (a separate semantic role, not a field state).
const DEFAULT_PALETTE = [
  '#05040a', '#170a2e', '#2c1050', '#43126d', '#5e1585', '#7c1a92', '#9c2496',
  '#bc3690', '#d85484', '#ec7a80', '#f9a688', '#ffd0a0', '#fff0c8',
]

export const slimeAggregationSchema = z.object({
  // ── Field ── the excitable cAMP medium (a Greenberg-Hastings-style automaton:
  // rest → wave crest → refractory recovery), driven by a handful of pacemakers.
  cellSize: z.number().int().min(3).max(16).default(6)
    .meta({ section: 'Field', ui: 'slider', min: 3, max: 16, step: 1, label: 'Cell size',
            help: 'Pixel size of each field cell. Smaller gives finer, more detailed spiral '
                + 'fronts; larger is bolder and chunkier. Changing this restarts the dish.' }),
  waveSpeed: z.number().min(2).max(30).default(12)
    .meta({ section: 'Field', ui: 'slider', min: 2, max: 30, step: 1, label: 'Wave speed',
            help: 'How many field steps run per second — the real-time speed the cAMP fronts '
                + 'sweep across the dish. Low and slow is the zen default.' }),
  excitability: z.number().min(0.05).max(1).default(0.4)
    .meta({ section: 'Field', ui: 'slider', min: 0.05, max: 1, step: 0.01, label: 'Excitability',
            help: 'How readily a resting cell catches the pulse from an excited neighbour. Low '
                + 'and a wave can fizzle before it reaches an amoeba; high and the whole dish '
                + 'ignites almost at once.' }),
  waveWidth: z.number().int().min(1).max(16).default(4)
    .meta({ section: 'Field', ui: 'slider', min: 1, max: 16, step: 1, label: 'Wave width',
            help: 'How many steps a cell stays at the bright crest before it starts recovering. '
                + 'Wider makes a bolder, more visible ring.' }),
  recoveryTime: z.number().int().min(2).max(60).default(20)
    .meta({ section: 'Field', ui: 'slider', min: 2, max: 60, step: 1, label: 'Recovery time',
            help: 'How many steps a cell stays refractory (immune to re-firing) after its crest. '
                + 'Short recovery packs waves tightly and curls fronts into spirals; long recovery '
                + 'spaces out calmer, widely-spilling rings.' }),
  pacemakerCount: z.number().int().min(1).max(8).default(4)
    .meta({ section: 'Field', ui: 'slider', min: 1, max: 8, step: 1, label: 'Pacemakers',
            help: 'Number of cells that self-fire on their own steady rhythm — the aggregation '
                + 'centers every relay wave radiates from, and the streams ultimately converge on. '
                + 'Changing this restarts the dish.' }),

  // ── Agents ── the streaming amoebae, chemotaxing up the field's gradient.
  agentCount: z.number().int().min(200).max(6000).default(2200)
    .meta({ section: 'Agents', ui: 'slider', min: 200, max: 6000, step: 100, label: 'Amoebae',
            help: 'How many cells scatter across the dish at the start. Changing this restarts '
                + 'the dish.' }),
  chemotaxisStrength: z.number().min(0.02).max(0.6).default(0.22)
    .meta({ section: 'Agents', ui: 'slider', min: 0.02, max: 0.6, step: 0.01, label: 'Chemotaxis',
            help: 'How fast an amoeba surges up the cAMP gradient while a wave is passing over '
                + 'it. Higher makes streams snap inward fast; lower gives a slow, patient crawl.' }),
  trailPersistence: z.number().min(0).max(0.98).default(0.85)
    .meta({ section: 'Agents', ui: 'slider', min: 0, max: 0.98, step: 0.01, label: 'Trail persistence',
            help: 'How long the faint streaming trails an amoeba leaves behind stay lit. Higher '
                + 'lets branching rivers build up into bright, lingering streams; lower keeps only '
                + 'the freshest motion visible.' }),

  // ── Color ── this is a full-field simulation (the palette paints every pixel
  // of the dish), so per the schema canon it legitimately omits a separate
  // `background` field — the palette's dark end (index 0) IS the resting ground.
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(16).default(DEFAULT_PALETTE)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 16, label: 'Palette',
            help: 'The field ramp: lowest is the resting dish, highest is a fresh wave crest. '
                + 'Recovering (refractory) cells fade down through the ramp between them.' }),
  streamColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#eafcff')
    .meta({ section: 'Color', ui: 'color', label: 'Stream color',
            help: 'The bright accent for the streaming amoebae and the rivers they leave behind '
                + '— a distinct color from the field ramp so the two layers stay readable.' }),
  contrast: z.number().min(0.3).max(3).default(1.2)
    .meta({ section: 'Color', ui: 'slider', min: 0.3, max: 3, step: 0.1, label: 'Front contrast',
            help: 'Higher makes the bright wave crest thinner and the recovering tail darker; '
                + 'lower spreads the glow across the whole wave.' }),

  // ── Advanced ──
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. The same seed always scatters the same amoebae and places the '
                + 'same pacemakers. A shared link is seedless — every fresh visit grows a '
                + 'different dish.' }),
})

export type SlimeAggregationConfig = z.infer<typeof slimeAggregationSchema>
