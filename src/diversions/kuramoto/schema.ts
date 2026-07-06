import { z } from 'zod'

// Phase → color, sampled cyclically (the wheel wraps 2π → 0). A cool, restrained
// wheel reads as an elegant flowing field rather than a busy rainbow; synchronized
// domains glow one colour and defects swirl at the seams.
const AURORA = ['#0affc0', '#12a0ff', '#7a4dff', '#12a0ff']

export const kuramotoSchema = z.object({
  // ── Coupling ──
  coupling: z.number().min(0).max(3).default(1.4)
    .meta({ section: 'Coupling', ui: 'slider', min: 0, max: 3, step: 0.05, label: 'Coupling',
            help: 'How strongly neighbours pull each other into step. Higher locks broad domains '
                + 'of one phase; lower stays incoherent, shimmering noise.' }),
  spread: z.number().min(0).max(1.5).default(0.35)
    .meta({ section: 'Coupling', ui: 'slider', min: 0, max: 1.5, step: 0.02, label: 'Frequency spread',
            help: 'Variety in the oscillators’ natural speeds. More spread resists sync into '
                + 'restless, churning spirals; less lets big domains settle and lock.' }),
  simSpeed: z.number().min(0.1).max(8).default(2)
    .meta({ section: 'Simulation', ui: 'slider', min: 0.1, max: 8, step: 0.1, label: 'Sim speed',
            help: 'How fast the oscillators advance, in sub-steps per frame. Lower is a slow, '
                + 'meditative drift.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Sets the initial phases + natural frequencies. A shared link is '
                + 'seedless — every visit self-organizes a different field.' }),
  // ── Color ──
  stops: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(AURORA)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Phase colors',
            help: 'Each oscillator’s phase maps around this color wheel (it wraps end-to-start), '
                + 'so a synced region glows one color and defects swirl through the spectrum.' }),
})

export type KuramotoConfig = z.infer<typeof kuramotoSchema>
