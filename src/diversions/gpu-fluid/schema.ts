import { z } from 'zod'

// Injection palette — the set of vibrant hues periodically spilled into the dye
// field. Rendered on a black background (max contrast, UX invariant #5), so the
// stops are saturated colors, NOT a dark→light ramp. Default: Aurora.
const AURORA = ['#0affc2', '#19d3fa', '#6a5cff', '#b14cff', '#39ffa6']

export const gpuFluidSchema = z.object({
  // ── Simulation ──
  simSpeed: z.number().min(0.25).max(4).default(1)
    .meta({ section: 'Simulation', ui: 'slider', min: 0.25, max: 4, step: 0.25, label: 'Sim speed',
            help: 'Solver sub-steps per frame. Below 1 advances the fluid every few frames '
                + 'for a slow, drifting calm; above 1 runs several solver passes per frame so '
                + 'the smoke boils and curls faster. Higher costs more GPU.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Simulation', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed always injects the same sequence of dye blobs '
                + 'and impulses. A shared link is seedless — every fresh visit swirls a '
                + 'different world.' }),
  resolution: z.enum(['low', 'medium', 'high']).default('medium')
    .meta({ section: 'Simulation', ui: 'select', label: 'Resolution', options: ['low', 'medium', 'high'],
            help: 'Sim grid detail. Low is cheapest and softest; High resolves the finest '
                + 'vortex filaments but costs the most GPU. The display always fills the '
                + 'screen regardless.' }),

  // ── Flow ──
  curl: z.number().min(0).max(50).default(30)
    .meta({ section: 'Flow', ui: 'slider', min: 0, max: 50, step: 1, label: 'Curl',
            help: 'Vorticity confinement — re-injects the small swirls the solver would '
                + 'otherwise smear away. This is the filament knob: 0 gives soft blobby smoke, '
                + 'high gives sharp curling vortex threads.' }),
  injectionRate: z.number().min(0).max(3).default(2)
    .meta({ section: 'Flow', ui: 'slider', min: 0, max: 3, step: 0.1, label: 'Injection rate',
            help: 'How often (blobs per second) a fresh colored dye blob + directional '
                + 'impulse is spilled into the field to keep it alive. 0 lets the current '
                + 'flow coast and slowly fade.' }),
  dissipation: z.number().min(0).max(0.05).default(0.003)
    .meta({ section: 'Flow', ui: 'slider', min: 0, max: 0.05, step: 0.001, label: 'Dye fade',
            help: 'How quickly old dye fades each step. 0 keeps color forever (the field '
                + 'fills and saturates); higher clears smoke faster so fresh blobs read '
                + 'against a darker background.' }),

  // ── Advanced ──
  pressureIters: z.number().int().min(10).max(50).default(30)
    .meta({ section: 'Advanced', ui: 'slider', min: 10, max: 50, step: 1, label: 'Pressure iterations',
            help: 'Jacobi iterations of the pressure solve that makes the flow '
                + 'incompressible. More = cleaner, less bulgy swirls at higher GPU cost; '
                + 'the default is plenty for a screensaver.' }),

  // ── Color ──
  stops: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(AURORA)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Dye colors',
            help: 'The palette injected blobs draw their color from (sampled cyclically). '
                + 'Saturated hues on the black field give the richest look.' }),
})

export type GpuFluidConfig = z.infer<typeof gpuFluidSchema>
