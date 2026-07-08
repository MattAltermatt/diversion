import { z } from 'zod'

// Stained-glass jewel tones — cells are tinted around this wheel.
const STAINED_GLASS = ['#1a0a3c', '#7b2fbf', '#c23b6e', '#e8823c', '#f0d060']

export const FILL_MODES = ['site', 'position', 'area'] as const

export const voronoiSchema = z.object({
  // ── Cells ──
  siteCount: z.number().int().min(20).max(400).default(150)
    .meta({ section: 'Cells', ui: 'slider', min: 20, max: 400, step: 5, label: 'Sites',
            help: 'How many Voronoi sites (colored cells) drift across the field. More sites '
                + 'make a finer, faster-reshaping mosaic.' }),
  driftSpeed: z.number().min(0.05).max(2).default(0.5)
    .meta({ section: 'Cells', ui: 'slider', min: 0.05, max: 2, step: 0.05, label: 'Drift speed',
            help: 'How fast each site orbits its own home point on an incommensurate path — the '
                + 'orbit periods never quite line up, so the mosaic reshapes and never repeats.' }),
  driftRadius: z.number().min(0.05).max(0.45).default(0.22)
    .meta({ section: 'Cells', ui: 'slider', min: 0.05, max: 0.45, step: 0.01, label: 'Drift radius',
            help: 'How far a site wanders from its home point, as a fraction of the canvas. Larger '
                + 'radius makes cells grow, shrink, and swap neighbors more dramatically.' }),
  // ── Color ──
  fillMode: z.enum(FILL_MODES).default('site')
    .meta({ section: 'Color', ui: 'select', options: [...FILL_MODES], label: 'Fill mode',
            help: '"Site" tints each cell by its own site, so color patches flow with the moving '
                + 'mosaic. "Position" tints by where a cell currently sits on screen. "Area" tints '
                + 'by how large a cell currently is.' }),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(STAINED_GLASS)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Palette',
            help: 'Cell fill colors, sampled cyclically around this wheel.' }),
  edgeWidth: z.number().min(0).max(4).default(1.5)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 4, step: 0.5, label: 'Edge width',
            help: 'Thickness of the crisp lines between cells — the leading in the stained glass. '
                + '0 hides the edges entirely.' }),
  edgeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070d')
    .meta({ section: 'Color', ui: 'color', label: 'Edge color',
            help: 'Color of the lines between cells. Every pixel is painted by a cell, so there is '
                + 'no separate background — this is the only "dark" you see, in the seams.' }),
  // ── Advanced ──
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Sets each site\'s home position and orbit. A shared link is '
                + 'seedless — every visit drifts a different mosaic.' }),
})

export type VoronoiConfig = z.infer<typeof voronoiSchema>
