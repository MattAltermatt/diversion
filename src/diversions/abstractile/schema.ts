import { z } from 'zod'

export const TILE_SETS = ['Triangles', 'Arcs', 'Quarters', 'Diamonds', 'Bars', 'Mixed'] as const
export const SYMMETRIES = ['Mirror', 'Rotate', 'Translate'] as const

// A bold, high-contrast quilt/Islamic-tile set: coral, amber, cream, teal, indigo.
const TILE_COLORS = ['#e6472f', '#f3a712', '#f6e8cb', '#1c8a8a', '#25446b']

export const abstractileSchema = z.object({
  // ── Tiling ──
  gridSize: z.number().int().min(6).max(48).default(18)
    .meta({ section: 'Tiling', ui: 'slider', min: 6, max: 48, step: 1, label: 'Grid size',
            help: 'Cells across the longer edge — smaller reads as bold, chunky tile; larger packs '
                + 'a finer, more intricate mosaic.' }),
  tileSet: z.enum(TILE_SETS).default('Mixed')
    .meta({ section: 'Tiling', ui: 'segmented', options: TILE_SETS as unknown as string[], label: 'Tile set',
            help: 'The family of shapes each cell draws: half-square Triangles (quilt), Truchet '
                + 'Arcs (flowing waves), corner Quarters (fish-scale circles), Diamonds (octagon '
                + 'lattice), woven Bars — or Mixed for all five.' }),
  symmetry: z.enum(SYMMETRIES).default('Mirror')
    .meta({ section: 'Tiling', ui: 'segmented', options: SYMMETRIES as unknown as string[], label: 'Symmetry',
            help: 'How the mosaic mirrors itself: Mirror = kaleidoscope across both centre lines, '
                + 'Rotate = 180° pinwheel, Translate = a small motif tiled edge to edge.' }),
  grout: z.number().int().min(0).max(12).default(2)
    .meta({ section: 'Tiling', ui: 'slider', min: 0, max: 12, step: 1, label: 'Grout',
            help: 'Width of the gap between tiles, where the background color shows through.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. Sets the whole tileset, colors and symmetry. A shared link is '
                + 'seedless — every visit lays a fresh mosaic.' }),
  // ── Motion ──
  fillSpeed: z.number().min(4).max(120).default(24)
    .meta({ section: 'Motion', ui: 'slider', min: 4, max: 120, step: 2, label: 'Fill speed',
            help: 'How fast tiles lay down (tiles per second). Lower is a calm, meditative build.' }),
  holdSeconds: z.number().min(1).max(30).default(6)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 30, step: 0.5, label: 'Hold',
            help: 'Seconds to hold the finished mosaic before it dissolves and a new one begins.' }),
  // ── Color ──
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(TILE_COLORS)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Tile colors',
            help: 'Each tile region is filled with one of these. More colors = a richer quilt.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#141019')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Shows in the grout gaps and behind open (negative-space) tiles.' }),
})

export type AbstractileConfig = z.infer<typeof abstractileSchema>
