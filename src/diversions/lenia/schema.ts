import { z } from 'zod'

// Field value → color ramp. Default: Bioluminescence (deep navy → teal → white-hot).
const BIOLUMINESCENCE = ['#040a1a', '#0a6e7a', '#eafcff']

export const leniaSchema = z.object({
  // ── Simulation ──
  simSpeed: z.number().min(0.1).max(10).default(1)
    .meta({ section: 'Simulation', ui: 'slider', min: 0.1, max: 10, step: 0.1, label: 'Sim speed',
            help: 'How fast the soup evolves. At the slowest (0.1) it takes about ten minutes to '
                + 'condense from the seed — a meditative genesis; the default settles in roughly a '
                + 'minute, and the fastest in a few seconds. (The frame cost is the same at every '
                + 'speed — only the pace changes.)' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Simulation', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed always restarts the field the same way. '
                + 'A shared link is seedless — every fresh visit grows a different soup.' }),
  // ── Advanced ── raw growth band; most values away from a preset give a dead or saturated field.
  mu: z.number().min(0.05).max(0.45).default(0.15)
    .meta({ section: 'Advanced', ui: 'slider', min: 0.05, max: 0.45, step: 0.001, label: 'Growth center (μ)',
            help: 'Where the bell-shaped growth peaks. The soup’s character knob — set by the Pattern '
                + 'preset; nudge gently, viable life lives on a thin band.' }),
  sigma: z.number().min(0.005).max(0.10).default(0.017)
    .meta({ section: 'Advanced', ui: 'slider', min: 0.005, max: 0.10, step: 0.001, label: 'Growth width (σ)',
            help: 'How forgiving the growth band is. Wider = softer, blobbier; narrower = crisper, '
                + 'more fragile structures.' }),
  // ── Kernel ── structural: a change recompiles/rebuilds and reseeds via setup.
  kernelRadius: z.number().int().min(8).max(14).default(14)
    .meta({ section: 'Kernel', ui: 'slider', min: 8, max: 14, step: 1, label: 'Kernel radius (R)',
            help: 'Ring size. Bigger means larger cells and coarser soup, but costs quadratically '
                + 'more per step — a change reseeds the field.' }),
  kernel: z.enum(['Smooth', 'Layered']).default('Smooth')
    .meta({ section: 'Kernel', ui: 'segmented', options: ['Smooth', 'Layered'], label: 'Ring profile',
            help: 'Smooth is one soft ring; Layered stacks concentric rings for a richer, more '
                + 'textured broth.' }),
  // ── Color ──
  stops: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(BIOLUMINESCENCE)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Field colors',
            help: 'The field value maps along these — the lowest is the empty background, the '
                + 'highest is the dense glowing core.' }),
})

export type LeniaConfig = z.infer<typeof leniaSchema>
