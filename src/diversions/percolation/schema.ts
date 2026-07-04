import { z } from 'zod'

// Percolation — the giant-component phase transition made visible. Every site of a
// square lattice is independently "open" with probability p; the connected clusters
// of open sites (4-neighbour) are found and coloured. As p sweeps up through the
// critical threshold p_c ≈ 0.5927, a lacy fractal cluster abruptly bridges the whole
// grid top→bottom — the spanning cluster — highlighted in gold. One schema drives the
// form, the URL codec, and the Config type.
export const percolationSchema = z.object({
  // ─── Lattice ────────────────────────────────────────────────────────────────
  cellSize: z.number().int().min(4).max(16).default(8)
    .meta({ section: 'Lattice', ui: 'slider', min: 4, max: 16, step: 1, label: 'Site size',
            help: 'Pixel size of each lattice site. Small = a fine, lacy fractal with millions of sites; '
                + 'large = bold, chunky clusters.' }),

  // ─── The Sweep ──────────────────────────────────────────────────────────────
  sweepMode: z.enum(['sweep', 'manual']).default('sweep')
    .meta({ section: 'The Sweep', ui: 'segmented', options: ['sweep', 'manual'], label: 'Density',
            help: 'sweep = p rises and falls forever through the critical threshold, so the spanning '
                + 'cluster crystallizes and dissolves on a loop · manual = park p yourself and hold it '
                + '(try 0.593, right at criticality).' }),
  sweepSpeed: z.number().min(0.1).max(2).default(0.6)
    .meta({ section: 'The Sweep', ui: 'slider', min: 0.1, max: 2, step: 0.05, label: 'Sweep speed',
            help: 'How fast the density p breathes up and down. Low and slow is the zen default — you '
                + 'watch scattered islands slowly bridge into one continent.',
            showWhen: { field: 'sweepMode', equals: 'sweep' } }),
  pMin: z.number().min(0.2).max(0.55).default(0.5)
    .meta({ section: 'The Sweep', ui: 'slider', min: 0.2, max: 0.55, step: 0.01, label: 'Low density',
            help: 'The bottom of the sweep — below the critical p_c ≈ 0.593, so only small scattered '
                + 'clusters exist here.',
            showWhen: { field: 'sweepMode', equals: 'sweep' } }),
  pMax: z.number().min(0.6).max(0.9).default(0.62)
    .meta({ section: 'The Sweep', ui: 'slider', min: 0.6, max: 0.9, step: 0.01, label: 'High density',
            help: 'The top of the sweep — above p_c, so the giant cluster fills most of the grid.',
            showWhen: { field: 'sweepMode', equals: 'sweep' } }),
  p: z.number().min(0.3).max(0.85).default(0.593)
    .meta({ section: 'The Sweep', ui: 'slider', min: 0.3, max: 0.85, step: 0.005, label: 'Density p',
            help: 'Probability each site is open. The spanning cluster appears abruptly as p crosses '
                + 'the critical p_c ≈ 0.593 — park right there to watch it flicker in and out of existence.',
            showWhen: { field: 'sweepMode', equals: 'manual' } }),

  // ─── Colour ─────────────────────────────────────────────────────────────────
  colorMode: z.enum(['cluster', 'size', 'spanning']).default('cluster')
    .meta({ section: 'Colour', ui: 'segmented', options: ['cluster', 'size', 'spanning'], label: 'Colour by',
            help: 'cluster = every connected cluster gets its own distinct hue · size = a cool→warm ramp '
                + 'so the emerging giant glows warm against tiny cool islands · spanning = everything dim '
                + 'except the top↔bottom spanning cluster.' }),
  highlightSpanning: z.boolean().default(true)
    .meta({ section: 'Colour', ui: 'toggle', label: 'Highlight spanning',
            help: 'Paint the cluster that connects top to bottom in the highlight colour so the phase '
                + 'transition pops the instant it bridges the grid.' }),
  spanningColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffd94a')
    .meta({ section: 'Colour', ui: 'color', label: 'Spanning colour',
            help: 'The highlight for the giant spanning cluster. Bright gold reads as the star of the show.' }),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8)
    .default(['#16305a', '#2a7fb8', '#57cbc4', '#f4dc55', '#ef8033'])
    .meta({ section: 'Colour', ui: 'colorList', label: 'Size ramp', min: 2, max: 8,
            help: 'Cool → warm ramp used by the "size" colour mode: tiny clusters cool, the giant warm.',
            showWhen: { field: 'colorMode', equals: 'size' } }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#060810')
    .meta({ section: 'Colour', ui: 'color', label: 'Background',
            help: 'The colour of closed (empty) sites behind the clusters.' }),

  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed regenerates the same random landscape. A fresh visit rolls a new one.' }),
})

export type PercolationConfig = z.infer<typeof percolationSchema>
