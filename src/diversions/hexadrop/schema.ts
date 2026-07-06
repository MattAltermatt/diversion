import { z } from 'zod'

// Hexadrop (#100): a calm hexagonal lattice on which "drops" land at random cells
// and send out concentric ripples measured in HEX-RING distance (cube distance from
// the drop). Each ripple briefly brightens, recolours and swells the hexes its
// expanding front passes; overlapping ripples interfere into shifting patterns, and
// drops keep landing so the pond never fully stills. One schema drives the form, the
// URL codec, and the Config type.
export const hexadropSchema = z.object({
  // ─── Lattice ───────────────────────────────────────────────────────────────
  hexSize: z.number().int().min(16).max(48).default(22)
    .meta({ section: 'Lattice', ui: 'slider', min: 16, max: 48, step: 1, label: 'Hex size',
            help: 'Hexagon radius in pixels — sets lattice density. Bigger = fewer, chunkier '
                + 'cells and a calmer, more legible pond. Rebuilds the lattice.' }),
  gridOpacity: z.number().min(0).max(0.4).default(0.12)
    .meta({ section: 'Lattice', ui: 'slider', min: 0, max: 0.4, step: 0.01, label: 'Mesh',
            help: 'Visibility of the resting hex mesh the ripples travel across. 0 hides it so '
                + 'only lit ripples show; higher keeps the calm lattice always present.' }),

  // ─── Ripples ───────────────────────────────────────────────────────────────
  dropRate: z.number().min(0.1).max(5).default(0.8)
    .meta({ section: 'Ripples', ui: 'slider', min: 0.1, max: 5, step: 0.1, label: 'Drop rate',
            help: 'New drops per second. Low = a sparse, meditative patter; high = a busy, '
                + 'overlapping shimmer of interfering rings.' }),
  rippleSpeed: z.number().min(0.5).max(15).default(4)
    .meta({ section: 'Ripples', ui: 'slider', min: 0.5, max: 15, step: 0.1, label: 'Ripple speed',
            help: 'How fast each ring travels outward, in hex-rings per second (frame-rate '
                + 'independent). Slow = a wide, languid swell; fast = quick darting rings.' }),
  rippleWidth: z.number().min(0.5).max(8).default(2.5)
    .meta({ section: 'Ripples', ui: 'slider', min: 0.5, max: 8, step: 0.1, label: 'Ripple width',
            help: 'Thickness of each ring in hex-rings. Narrow = crisp expanding circles; wide = '
                + 'soft, broad swells that blend readily where they overlap.' }),
  decay: z.number().min(0.05).max(2).default(0.35)
    .meta({ section: 'Ripples', ui: 'slider', min: 0.05, max: 2, step: 0.01, label: 'Decay',
            help: 'How quickly a ring fades as it spreads (per second). Low = long-lived rings '
                + 'that cross the whole field; high = drops that bloom and vanish near their source.' }),

  // ─── Color ─────────────────────────────────────────────────────────────────
  colorMode: z.enum(['by-phase', 'by-drop', 'single']).default('by-drop')
    .meta({ section: 'Color', ui: 'segmented', options: ['by-phase', 'by-drop', 'single'],
            label: 'Color by',
            help: 'by-phase = color follows ripple intensity along the palette (interference '
                + 'reads as hue). by-drop = each drop keeps its own palette color, like tinted '
                + 'raindrops. single = one color, brightness only.' }),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(6)
    .default(['#3aa0e6', '#4fd0c4', '#8a7bf0', '#f0a24a'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Palette', min: 2, max: 6,
            help: 'Ripple colors. In by-phase the palette runs cool→hot with intensity; in '
                + 'by-drop each drop picks one stop.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070d')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The still-water color behind the lattice. A deep dark keeps the ripples '
                + 'luminous (err toward contrast).' }),

  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed drops in the same places at the same times. A fresh '
                + 'visit rolls a new one.' }),
})

export type HexadropConfig = z.infer<typeof hexadropSchema>
