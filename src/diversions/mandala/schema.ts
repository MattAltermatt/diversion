import { z } from 'zod'

// Motif-style sets. 'Mixed' lets every ring pick any motif; the others bias a
// ring's motif to one family for a more uniform, themed bloom.
export const MOTIF_STYLES = ['Mixed', 'Petals', 'Dots', 'Lotus', 'Geometric'] as const

// Default jewel palette — deep saturated gem tones for the motifs (invariant #5:
// err toward more contrast against the near-black indigo ground).
const JEWEL = ['#f4d35e', '#e8623a', '#c0306a', '#8e3bd6', '#2f9e7e', '#2a6fd6']

export const mandalaSchema = z.object({
  // ── Symmetry ──
  symmetry: z.number().int().min(6).max(24).default(12)
    .meta({ section: 'Symmetry', ui: 'slider', min: 6, max: 24, step: 1, label: 'Fold symmetry',
            help: 'How many identical wedges the mandala is divided into (its N-fold '
                + 'rotational symmetry). 12 is a classic dozen-petal bloom.' }),
  mirror: z.boolean().default(true)
    .meta({ section: 'Symmetry', ui: 'toggle', label: 'Mirror weave',
            help: 'Weaves a second, half-offset copy of every ring so motifs interlock '
                + 'into a denser, mirrored lattice.' }),
  ringCount: z.number().int().min(4).max(16).default(11)
    .meta({ section: 'Symmetry', ui: 'slider', min: 4, max: 16, step: 1, label: 'Rings',
            help: 'How many concentric rings of motifs grow out from the centre.' }),
  motifStyle: z.enum(MOTIF_STYLES).default('Mixed')
    .meta({ section: 'Symmetry', ui: 'segmented', options: MOTIF_STYLES as unknown as string[],
            label: 'Motif style',
            help: 'Which family of motifs the rings draw from — dots, petals, lotus points, '
                + 'crisp geometric shapes, or a free Mix.' }),

  // ── Motion ──
  growthSpeed: z.number().min(0.2).max(3).default(0.8)
    .meta({ section: 'Motion', ui: 'slider', min: 0.2, max: 3, step: 0.1, label: 'Bloom speed',
            help: 'Rings revealed per second as the mandala blooms outward. Low is calm '
                + 'and meditative.' }),
  holdSeconds: z.number().min(2).max(20).default(6)
    .meta({ section: 'Motion', ui: 'slider', min: 2, max: 20, step: 0.5, label: 'Hold',
            help: 'Seconds the finished mandala rests on screen before it fades and a '
                + 'fresh one blooms.' }),
  fadeSeconds: z.number().min(1).max(8).default(3)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 8, step: 0.5, label: 'Fade',
            help: 'Seconds the completed mandala takes to dissolve before reseeding.' }),

  // ── Style ──
  sizeScale: z.number().min(0.5).max(1.6).default(1)
    .meta({ section: 'Style', ui: 'slider', min: 0.5, max: 1.6, step: 0.05, label: 'Motif size',
            help: 'Scales every motif up or down. Larger overlaps into a solid rosette; '
                + 'smaller leaves airy lacework.' }),
  lineWidth: z.number().min(1).max(6).default(2)
    .meta({ section: 'Style', ui: 'slider', min: 1, max: 6, step: 0.5, label: 'Line width',
            help: 'Stroke thickness of the outlined motifs (arcs and spokes).' }),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(3).max(8).default(JEWEL)
    .meta({ section: 'Style', ui: 'colorList', min: 3, max: 8, label: 'Jewel colors',
            help: 'Each ring is colored from this palette, cycling outward.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0812')
    .meta({ section: 'Style', ui: 'color', label: 'Background' }),

  // ── Seed (pin-only) ──
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Sets the whole mandala — symmetry, motifs, colors. A shared '
                + 'link is seedless, so every visit blooms a different one.' }),
})

export type MandalaConfig = z.infer<typeof mandalaSchema>
