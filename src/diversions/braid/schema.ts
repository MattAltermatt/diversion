import { z } from 'zod'

// Colour treatment of the woven strands.
//   palette — each strand gets its own jewel hue, golden-angle spaced from a
//             seeded base hue (a fresh harmonious set every reseed).
//   rainbow — hues evenly span the wheel by strand index (index-derived, stable).
export const COLOR_MODES = ['palette', 'rainbow'] as const

// Braid — a ring of coloured strands braiding over and under each other, like a
// maypole plait bent into a circle. The braid word (a sequence of adjacent-strand
// swaps) and the over/under weave are generated deterministically; `seed` chooses
// the palette, the starting rotation, and the global weave parity, so the same
// seed always weaves the same torc and a shared link is seedless — a fresh ring
// every visit. The whole band slowly rotates; a new braid is woven periodically.
export const braidSchema = z.object({
  // ─── Braid ───────────────────────────────────────────────────────────────
  strandCount: z.number().int().min(3).max(8).default(5)
    .meta({ section: 'Braid', ui: 'slider', min: 3, max: 8, step: 1, label: 'Strands',
            help: 'How many colored strands weave around the ring. Fewer = bold, chunky '
                + 'rope; more = a fine, intricate plait.' }),
  twist: z.number().int().min(1).max(6).default(2)
    .meta({ section: 'Braid', ui: 'slider', min: 1, max: 6, step: 1, label: 'Twist',
            help: 'How tightly the strands braid — how many full weave cycles wrap the '
                + 'ring. Low = long, lazy crossings; high = a dense, tightly-plaited torc.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. Chooses the palette, the starting angle, and the over/under '
                + 'parity. A shared link is seedless — every visit weaves a different braid.' }),

  // ─── Ribbon ──────────────────────────────────────────────────────────────
  braidRadius: z.number().min(0.3).max(0.85).default(0.6)
    .meta({ section: 'Ribbon', ui: 'slider', min: 0.3, max: 0.85, step: 0.01, label: 'Ring size',
            help: 'Radius of the braided ring, as a fraction of the screen. Larger fills the '
                + 'frame; smaller leaves a calm dark border.' }),
  strandWidth: z.number().int().min(4).max(40).default(18)
    .meta({ section: 'Ribbon', ui: 'slider', min: 4, max: 40, step: 1, label: 'Strand width',
            help: 'Thickness of each strand. Strands are separated by a dark gap so the '
                + 'over/under interlace reads cleanly.' }),
  glow: z.number().min(0).max(1).default(0.4)
    .meta({ section: 'Ribbon', ui: 'slider', min: 0, max: 1, step: 0.02, label: 'Glow',
            help: 'A soft luminous halo around each strand. 0 = flat and graphic; higher makes '
                + 'the torc glow against the dark ground.' }),

  // ─── Motion ──────────────────────────────────────────────────────────────
  rotationSpeed: z.number().min(-0.8).max(0.8).default(0.15)
    .meta({ section: 'Motion', ui: 'slider', min: -0.8, max: 0.8, step: 0.01, label: 'Rotation',
            help: 'How fast the whole ring turns, in radians per second. Negative spins the '
                + 'other way; 0 holds it still. Slow is hypnotic.' }),
  holdSeconds: z.number().int().min(6).max(60).default(24)
    .meta({ section: 'Motion', ui: 'slider', min: 6, max: 60, step: 1, label: 'New braid every',
            help: 'Seconds before a fresh seed re-weaves the braid with new colors and a new '
                + 'weave — the endless screensaver loop. The ring keeps rotating throughout.' }),

  // ─── Color ───────────────────────────────────────────────────────────────
  colorMode: z.enum(COLOR_MODES).default('palette')
    .meta({ section: 'Color', ui: 'segmented', options: [...COLOR_MODES], label: 'Coloring',
            help: 'Palette: each strand a jewel hue, golden-angle spaced from a seeded base. '
                + 'Rainbow: hues evenly span the wheel by strand.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0a14')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The dark ground. Also the color of the gaps between crossing strands.' }),
})

export type BraidConfig = z.infer<typeof braidSchema>
