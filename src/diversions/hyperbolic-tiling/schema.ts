import { z } from 'zod'

export const STYLE_OPTIONS = ['fill', 'outline', 'both'] as const

export const hyperbolicTilingSchema = z.object({
  // ── Tiling ──
  p: z.number().int().min(3).max(12).default(7)
    .meta({ section: 'Tiling', ui: 'slider', min: 3, max: 12, step: 1, label: 'Polygon sides (p)',
            help: 'Sides of each tile. A regular {p,q} tiling only covers the hyperbolic '
                + '(not flat or spherical) plane when (p−2)(q−2) > 4 — an invalid pair '
                + 'quietly falls back to the nearest valid one instead of breaking.' }),
  q: z.number().int().min(3).max(12).default(3)
    .meta({ section: 'Tiling', ui: 'slider', min: 3, max: 12, step: 1, label: 'Tiles per vertex (q)',
            help: 'How many tiles meet at each vertex. Same (p−2)(q−2) > 4 constraint as p — '
                + 'e.g. {3,3}, {4,4} and {3,4} are flat/spherical, not hyperbolic, and get remapped.' }),
  depth: z.number().int().min(1).max(7).default(4)
    .meta({ section: 'Tiling', ui: 'slider', min: 1, max: 7, step: 1, label: 'Rings',
            help: 'How many reflection rings radiate out from the centre. Tiles crowd '
                + 'infinitely toward the boundary, so deeper rings cost more to draw — the '
                + 'total tile count is capped internally to keep every frame cheap regardless '
                + 'of how deep this goes or how fast {p,q} branches.' }),
  lineWidth: z.number().min(0).max(4).default(1.2)
    .meta({ section: 'Tiling', ui: 'slider', min: 0, max: 4, step: 0.1, label: 'Edge width',
            help: 'Thickness of the geodesic tile borders. 0 hides them entirely.' }),
  style: z.enum(STYLE_OPTIONS).default('both')
    .meta({ section: 'Tiling', ui: 'select', options: [...STYLE_OPTIONS], label: 'Tile style',
            help: 'Fill = solid colour tiles, no borders · Outline = wireframe only · '
                + 'Both = filled tiles with crisp borders — the classic woodcut look.' }),
  // ── Motion ──
  driftSpeed: z.number().min(0).max(2).default(0.35)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 2, step: 0.05, label: 'Drift speed',
            help: 'A slow hyperbolic translation carries every tile from the centre out '
                + 'toward the boundary while its axis gently swirls, so the pattern never '
                + 'settles — the classic Escher Circle-Limit flow. 0 = perfectly still.' }),
  // ── Color ──
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8)
    .default(['#f2ead6', '#c9974a', '#8a4a2a', '#3a1c14'])
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Tile colors',
            help: 'Ramp sampled by each tile\'s ring distance from the centre (nearer the '
                + 'boundary = further along the ramp). Every other tile — by reflection '
                + 'parity — is darkened a touch for the classic checkerboard read.' }),
  edgeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#160d08')
    .meta({ section: 'Color', ui: 'color', label: 'Edge color' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0c0704')
    .meta({ section: 'Color', ui: 'color', label: 'Background' }),
})

export type HyperbolicTilingConfig = z.infer<typeof hyperbolicTilingSchema>
