import { z } from 'zod'

// Cell fill wheel, sampled cyclically by centroid position + a slow drift.
const IRIDESCENT = ['#0d2a4a', '#1a8fbf', '#6ee0d0', '#b0a0e8', '#e88ac0']

export const lloydRelaxationSchema = z.object({
  // ── Cells ──
  count: z.number().int().min(60).max(1000).default(360)
    .meta({ section: 'Cells', ui: 'slider', min: 60, max: 1000, step: 10, label: 'Cells',
            help: 'How many Voronoi cells (seed points). More makes a finer honeycomb.' }),
  relaxRate: z.number().min(0.02).max(0.4).default(0.1)
    .meta({ section: 'Cells', ui: 'slider', min: 0.02, max: 0.4, step: 0.01, label: 'Relax rate',
            help: 'How fast each cell slides toward its own centroid — the anneal into an even, '
                + 'hexagonal tiling. Lower is a slow, mesmerizing settle.' }),
  jitter: z.number().min(0).max(3).default(0.7)
    .meta({ section: 'Cells', ui: 'slider', min: 0, max: 3, step: 0.05, label: 'Jitter',
            help: 'Gentle perpetual perturbation so the foam never fully freezes — cells keep '
                + 'nudging and occasionally swapping neighbours. 0 = settles and stops.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Cells', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Sets the initial scatter of seeds. A shared link is seedless — '
                + 'every visit anneals a different foam.' }),
  // ── Style ──
  borderWidth: z.number().min(0).max(4).default(1.5)
    .meta({ section: 'Style', ui: 'slider', min: 0, max: 4, step: 0.5, label: 'Wall width',
            help: 'Thickness of the cell walls.' }),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(IRIDESCENT)
    .meta({ section: 'Style', ui: 'colorList', min: 2, max: 8, label: 'Cell colors',
            help: 'Cells are tinted around this wheel by their position, drifting slowly over time.' }),
  border: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070d')
    .meta({ section: 'Style', ui: 'color', label: 'Wall color' }),
})

export type LloydRelaxationConfig = z.infer<typeof lloydRelaxationSchema>
