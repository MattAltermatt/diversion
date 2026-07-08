import { z } from 'zod'

// Map Creator (GH #150) — a fantasy/old-world map draws itself: an elevation +
// moisture field is generated once, then progressively inked in — sea, then
// coastline, then biomes washing in low-to-high, then rivers + a compass rose —
// before the finished parchment map holds, dissolves, and a fresh one begins.
//
// `background`/parchment is intentionally NOT a schema field: this is a
// full-field simulation (the palette paints every grid cell edge-to-edge), so
// per the schema-UX-canon exception the paper tone is a fixed constant in
// `render.ts` rather than a dark-default `background` control.

const PALETTE_ANTIQUE = {
  sea: '#8fb0ba', beach: '#e0c98a', desert: '#d8b876', grassland: '#9fae66',
  forest: '#5f7a4a', mountain: '#8a7a68', snow: '#eef0e6', ink: '#3b2b1a',
}

export const mapCreatorSchema = z.object({
  // ── Terrain ──
  seaLevel: z.number().min(0.15).max(0.65).default(0.42)
    .meta({ section: 'Terrain', ui: 'slider', min: 0.15, max: 0.65, step: 0.01, label: 'Sea level',
            help: 'Elevation threshold below which land floods to ocean. Higher = a smaller '
                + 'continent hemmed by more sea; lower = a sprawling landmass.' }),
  roughness: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Terrain', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Terrain roughness',
            help: 'Fractal detail in the elevation field. Low = smooth rolling country and gentle '
                + 'coastlines; high = jagged mountains and a ragged, bitten coast.' }),

  // ── Cartography ──
  revealSpeed: z.number().min(0.4).max(2.5).default(1)
    .meta({ section: 'Cartography', ui: 'slider', min: 0.4, max: 2.5, step: 0.1, label: 'Reveal speed',
            help: 'How fast the map draws itself — sea, then coastline ink, then biomes, then '
                + 'rivers. Low = a slow, meditative unveiling; high = a brisk sketch.' }),
  showRivers: z.boolean().default(true)
    .meta({ section: 'Cartography', ui: 'toggle', label: 'Rivers',
            help: 'Trace rivers downhill from wet highlands to the sea.' }),
  showCompass: z.boolean().default(true)
    .meta({ section: 'Cartography', ui: 'toggle', label: 'Compass rose',
            help: 'Draw a decorative compass rose once the map finishes inking in.' }),

  // ── Color ──
  palette: z.object({
    sea: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(PALETTE_ANTIQUE.sea)
      .meta({ ui: 'color', label: 'Sea' }),
    beach: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(PALETTE_ANTIQUE.beach)
      .meta({ ui: 'color', label: 'Beach' }),
    desert: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(PALETTE_ANTIQUE.desert)
      .meta({ ui: 'color', label: 'Desert' }),
    grassland: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(PALETTE_ANTIQUE.grassland)
      .meta({ ui: 'color', label: 'Grassland' }),
    forest: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(PALETTE_ANTIQUE.forest)
      .meta({ ui: 'color', label: 'Forest' }),
    mountain: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(PALETTE_ANTIQUE.mountain)
      .meta({ ui: 'color', label: 'Mountain' }),
    snow: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(PALETTE_ANTIQUE.snow)
      .meta({ ui: 'color', label: 'Snow cap' }),
    ink: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(PALETTE_ANTIQUE.ink)
      .meta({ ui: 'color', label: 'Ink',
              help: 'Coastline strokes, rivers, and the compass rose are all drawn in this ink.' }),
  }).default(PALETTE_ANTIQUE)
    .meta({ section: 'Color', ui: 'group', label: 'Palette' }),

  // ── Advanced ──
  seed: z.number().int().default(150420)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed',
            randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed regenerates the same continent, coastline, and '
                + 'rivers. A fresh visit rolls a new one.' }),
})

export type MapCreatorConfig = z.infer<typeof mapCreatorSchema>
export type MapPalette = MapCreatorConfig['palette']
