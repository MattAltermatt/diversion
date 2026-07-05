import { z } from 'zod'

// The 2D Ising model. Spins live on a grid and flip under Metropolis dynamics at
// temperature T (in units of the coupling J). The critical point sits at
// Tc ≈ 2.269·J: below it the lattice spontaneously magnetizes into big domains of
// one spin, right around it you get fractal-boundary critical fluctuations, and
// above it it's disordered noise. A slow temperature "breath" carries the screen
// back and forth through Tc forever.
export const isingSchema = z.object({
  // ── Field ──
  cellSize: z.number().int().min(2).max(16).default(8)
    .meta({ section: 'Field', ui: 'slider', min: 2, max: 16, step: 1, label: 'Cell size',
            help: 'Pixel size of each spin cell. Small = a fine, high-resolution lattice with '
                + 'delicate domain walls; large = bold, chunky blocks.' }),

  // ── Dynamics ──
  tempMode: z.enum(['sweep', 'fixed']).default('sweep')
    .meta({ section: 'Dynamics', ui: 'segmented', options: ['sweep', 'fixed'], label: 'Temperature',
            help: 'Sweep slowly breathes the temperature up and down through the critical point '
                + 'forever — ordered domains coarsen, then dissolve into roiling disorder, then '
                + 're-form. Fixed holds one temperature.' }),
  tempMin: z.number().min(0.4).max(2.2).default(2.0)
    .meta({ section: 'Dynamics', ui: 'slider', min: 0.4, max: 2.2, step: 0.05, label: 'Coldest',
            showWhen: { field: 'tempMode', equals: 'sweep' },
            help: 'The cold end of the breath — just below the critical point (≈2.27), where the '
                + 'lattice coarsens into large single-spin domains. Push it lower for solid blocks.' }),
  tempMax: z.number().min(2.3).max(5).default(2.6)
    .meta({ section: 'Dynamics', ui: 'slider', min: 2.3, max: 5, step: 0.05, label: 'Hottest',
            showWhen: { field: 'tempMode', equals: 'sweep' },
            help: 'The hot end of the breath — just above the critical point, where domains melt '
                + 'into lacy fractal fluctuations. Push it higher for flickering thermal static.' }),
  sweepPeriod: z.number().min(8).max(180).default(48)
    .meta({ section: 'Dynamics', ui: 'slider', min: 8, max: 180, step: 1, label: 'Breath period',
            showWhen: { field: 'tempMode', equals: 'sweep' },
            help: 'Seconds for one full cold → hot → cold cycle. Long and slow is the zen default.' }),
  temperature: z.number().min(0.2).max(5).default(2.27)
    .meta({ section: 'Dynamics', ui: 'slider', min: 0.2, max: 5, step: 0.01, label: 'Temperature',
            showWhen: { field: 'tempMode', equals: 'fixed' },
            help: 'Held temperature in units of J. The critical point is ≈ 2.27: just below it you '
                + 'get the most beautiful fractal-boundary domains.' }),
  coupling: z.number().min(0.5).max(2).default(1)
    .meta({ section: 'Dynamics', ui: 'slider', min: 0.5, max: 2, step: 0.05, label: 'Coupling J',
            help: 'How strongly neighbouring spins want to agree. Raising it pushes the critical '
                + 'temperature higher, so ordered domains survive to hotter sweeps.' }),
  field: z.number().min(-0.5).max(0.5).default(0)
    .meta({ section: 'Dynamics', ui: 'slider', min: -0.5, max: 0.5, step: 0.01, label: 'External field',
            help: 'A magnetic bias toward one spin. 0 is balanced (both colours equally likely); '
                + 'push it either way and that colour tends to win the whole lattice.' }),
  speed: z.number().min(0.02).max(4).default(0.1)
    .meta({ section: 'Dynamics', ui: 'slider', min: 0.02, max: 4, step: 0.02, label: 'Speed',
            help: 'Monte-Carlo sweeps of the whole lattice per frame. Fractional values (below 1) '
                + 'run one sweep every few frames for a slow, watchable simmer — the calm default. '
                + 'Raise it to churn and coarsen faster.' }),

  // ── Color ──
  colorUp: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f4f1e6')
    .meta({ section: 'Color', ui: 'color', label: 'Up spin',
            help: 'Colour of one spin domain.' }),
  colorDown: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a1c30')
    .meta({ section: 'Color', ui: 'color', label: 'Down spin',
            help: 'Colour of the other spin domain. Keep strong contrast with Up spin for crisp '
                + 'domains.' }),
  boundary: z.boolean().default(false)
    .meta({ section: 'Color', ui: 'toggle', label: 'Domain walls',
            help: 'Trace a bright line along the boundaries between domains — highlights the '
                + 'fractal coastlines near the critical point.' }),
  boundaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff5a1e')
    .meta({ section: 'Color', ui: 'color', label: 'Wall colour',
            help: 'Colour of the domain-wall outline (used only when Domain walls is on).' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05060a')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The ground colour behind the lattice (shows at the grid-edge margin).' }),

  // ── Advanced ──
  seed: z.number().int().default(42)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed regenerates the same starting noise and evolution. '
                + 'A shared link is seedless — every visit seeds a fresh lattice.' }),
})

export type IsingConfig = z.infer<typeof isingSchema>
