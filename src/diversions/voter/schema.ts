import { z } from 'zod'

// The Voter Model (GH #185). Every cell holds one of k discrete opinions. Each step,
// a random cell simply COPIES a random neighbour's opinion — pure imitation, no energy,
// no surface tension (what makes it distinct from Ising/Potts, #146/#177). That alone is
// enough for domains of like opinion to coarsen: boundaries do an unbiased random walk,
// merging and shrinking, and a finite lattice eventually drifts to full consensus — one
// opinion owns the whole board. We reseed once that happens so the show runs forever.
export const voterSchema = z.object({
  // ── Field ──
  cellSize: z.number().int().min(2).max(8).default(4)
    .meta({ section: 'Field', ui: 'slider', min: 2, max: 8, step: 1, label: 'Cell size',
            help: 'Pixel size of each cell. Small = a fine mosaic that coarsens into big sweeping '
                + 'domains; large = bold, chunky blocks.' }),

  // ── Rules ──
  neighborhood: z.enum(['vonNeumann', 'moore']).default('moore')
    .meta({ section: 'Rules', ui: 'segmented', options: ['vonNeumann', 'moore'], label: 'Neighborhood',
            help: 'Which neighbours a cell can copy from. Von Neumann = the 4 orthogonal neighbours '
                + '(boundaries drift on the grid axes); Moore = all 8 surrounding neighbours (smoother, '
                + 'more isotropic domain walls).' }),
  stepsPerFrame: z.number().int().min(1).max(8).default(3)
    .meta({ section: 'Rules', ui: 'slider', min: 1, max: 8, step: 1, label: 'Speed',
            help: 'Full lattice sweeps (one imitation attempt per cell, on average) per frame. Higher '
                + 'coarsens faster; lower is a calmer, more watchable drift toward consensus.' }),
  noiseRate: z.number().min(0).max(0.05).default(0)
    .meta({ section: 'Rules', ui: 'slider', min: 0, max: 0.05, step: 0.001, label: 'Independence',
            help: 'Chance a cell ignores its neighbours and jumps to a random opinion instead of '
                + 'copying one. 0 = the pure voter model (imitation only) — domains coarsen cleanly to '
                + 'consensus and reseed. Above 0 a trickle of independent opinions keeps some diversity '
                + 'alive, so boundaries wander forever instead of ever fully agreeing.' }),

  // ── Color ──
  // The palette length IS the opinion count k (3-10 distinct colours) — add or remove
  // swatches to change how many opinions compete. No separate count field to keep in
  // sync: the list is the single source of truth. Full-field sim (every cell painted) —
  // per the Background canon (#271) a dedicated background field is legitimately omitted.
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(3).max(10)
    .default(['#ff5d73', '#ffb84d', '#f4e04d', '#6bdc7d', '#4ddbe0', '#5d8bff', '#b06bff'])
    .meta({ section: 'Color', ui: 'colorList', min: 3, max: 10, label: 'Palette',
            help: 'One color per opinion — add or remove swatches to change how many opinions compete '
                + '(k = number of colors). Distinct, high-contrast colors make the coarsening domains '
                + 'read clearly.' }),

  // ── Advanced ──
  seed: z.number().int().default(42)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed regenerates the same starting opinions and evolution. '
                + 'A shared link is seedless — every visit starts a fresh drift toward consensus.' }),
})

export type VoterConfig = z.infer<typeof voterSchema>
