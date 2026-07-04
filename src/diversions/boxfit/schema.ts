import { z } from 'zod'

// Boxfit — a clean-room take on xscreensaver's `boxfit` (jwz). Space-filling
// packing: repeatedly drop a tiny shape on an empty spot and GROW it until it
// touches a neighbour or the edge, then freeze it. Big shapes claim the open
// plains, tiny ones fill the cracks — a self-assembling mosaic. One schema drives
// the form, the URL codec, and the Config type. Two preset axes (Style = shape +
// growth feel, Look = palette + colouring) live in presets.ts.
export const boxfitSchema = z.object({
  // ─── The Packing ─────────────────────────────────────────────────────────────
  shape: z.enum(['boxes', 'circles', 'mixed']).default('boxes')
    .meta({ section: 'The Packing', ui: 'segmented', options: ['boxes', 'circles', 'mixed'],
            label: 'Shape',
            help: 'What gets packed. boxes → a Mondrian-like tiling of rectangles · circles → '
                + 'a bubble / cell mosaic · mixed → both, jostling for the same gaps.' }),
  // ★ hero knob: the grout. The background shows through the gaps, so this is the
  //   width of the mosaic gridlines — 0 = seamless tiling, higher = airy, tiled feel.
  gap: z.number().min(0).max(14).default(2.5)
    .meta({ section: 'The Packing', ui: 'slider', min: 0, max: 14, step: 0.5, label: 'Gap',
            help: 'Spacing held between every pair of shapes (and the edge). The background shows '
                + 'through it, so this is the width of the mosaic grout. 0 = seamless; high = airy.' }),
  maxSize: z.number().min(0.06).max(0.34).default(0.18)
    .meta({ section: 'The Packing', ui: 'slider', min: 0.06, max: 0.34, step: 0.01, label: 'Biggest shape',
            help: 'Ceiling on how large a single shape may grow, as a fraction of the screen. Low = '
                + 'a fine, even gravel of many small tiles; high = a few bold slabs among the fillers.' }),

  // ─── Motion ──────────────────────────────────────────────────────────────────
  growthSpeed: z.number().min(20).max(420).default(140)
    .meta({ section: 'Motion', ui: 'slider', min: 20, max: 420, step: 10, label: 'Growth rate',
            help: 'How fast each shape swells (px/sec, frame-rate independent). Low = a slow, zen '
                + 'accretion you can watch tile by tile; high = the screen fills briskly.' }),
  spawnRate: z.number().min(1).max(50).default(16)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 50, step: 1, label: 'Spawn rate',
            help: 'New shapes dropped per second. More = the plane crowds with young shapes competing '
                + 'for room, so it fills with smaller tiles; fewer = each shape gets room to grow big.' }),
  maxConcurrent: z.number().int().min(1).max(48).default(16)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 48, step: 1, label: 'Growing at once',
            help: 'How many shapes may be swelling simultaneously. Higher = a busier, more parallel '
                + 'assembly; 1 = a meditative one-at-a-time placement.' }),

  // ─── Color ──────────────────────────────────────────────────────────────────
  colorMode: z.enum(['by-size', 'palette-cycle', 'random']).default('by-size')
    .meta({ section: 'Color', ui: 'segmented', options: ['by-size', 'palette-cycle', 'random'],
            label: 'Colour by',
            help: 'by-size → colour maps to a shape’s final size, so the palette reveals the '
                + 'packing structure · palette-cycle → hue sweeps slowly with spawn order · random → '
                + 'each shape a random palette pick.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0d1117')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Canvas colour — and the colour of the gaps between shapes (the grout).' }),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(8)
    .default(['#457b9d', '#2a9d8f', '#8cb369', '#e9c46a', '#f4a259', '#e63946'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Palette', min: 1, max: 8,
            help: 'Ordered small → large for "by-size"; cycled for the other modes.' }),

  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Same seed repacks the same mosaic. A fresh visit rolls a new one.' }),
})

export type BoxfitConfig = z.infer<typeof boxfitSchema>
