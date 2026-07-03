import { z } from 'zod'

// Intensity → color ramp. Index 0 is the resting (healthy) background; index 1 is
// the peak of an excited wave; the tail sweeps the ramp in between. Default:
// "Ferroin" — the classic red-orange BZ indicator dye.
const FERROIN = ['#060310', '#5c1250', '#e8481f', '#ffe6a0']

export const excitableMediaSchema = z.object({
  // ── Simulation ──
  simSpeed: z.number().min(0.1).max(10).default(2)
    .meta({ section: 'Simulation', ui: 'slider', min: 0.1, max: 10, step: 0.1, label: 'Sim speed',
            help: 'How fast the reaction evolves, in sub-steps per frame. Below 1 runs a step every '
                + 'few frames for a slow, meditative drift; above 1 runs several steps per frame.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Simulation', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed always restarts the dish the same way. A shared '
                + 'link is seedless — every fresh visit self-organizes a different set of spirals.' }),
  // ── Pattern ── the Gerhardt-Schuster "hodgepodge machine" cellular-BZ knobs.
  states: z.number().int().min(20).max(220).default(100)
    .meta({ section: 'Pattern', ui: 'slider', min: 20, max: 220, step: 1, label: 'Recovery ceiling',
            help: 'How high a cell’s excitation climbs before it heals back to rest. Higher → '
                + 'longer, broader, slower waves; lower → tight fast ripples.' }),
  k1: z.number().int().min(1).max(8).default(3)
    .meta({ section: 'Pattern', ui: 'slider', min: 1, max: 8, step: 1, label: 'Infection rate',
            help: 'How readily a resting cell catches the wave from lightly-excited neighbours. '
                + 'Lower spreads waves more eagerly (denser field); higher makes them selective.' }),
  k2: z.number().int().min(1).max(8).default(3)
    .meta({ section: 'Pattern', ui: 'slider', min: 1, max: 8, step: 1, label: 'Contagion rate',
            help: 'How readily a resting cell is triggered by fully-excited (peak) neighbours. '
                + 'Lower makes wavefronts push harder into fresh tissue.' }),
  g: z.number().int().min(1).max(80).default(20)
    .meta({ section: 'Pattern', ui: 'slider', min: 1, max: 80, step: 1, label: 'Wave speed',
            help: 'How fast an excited cell climbs toward its peak. Higher → faster, tighter '
                + 'spiral rotation; lower → slow, languid scrolls.' }),
  // ── Color ──
  gamma: z.number().min(0.3).max(3).default(1.1)
    .meta({ section: 'Color', ui: 'slider', min: 0.3, max: 3, step: 0.1, label: 'Tail contrast',
            help: 'Higher makes the bright wave crest thinner and the trailing recovery darker; '
                + 'lower spreads the glow across the whole wave.' }),
  stops: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(FERROIN)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Wave colors',
            help: 'The lowest color is the resting background; the highest is the wave crest. '
                + 'The recovering tail fades down through the ramp between them.' }),
})

export type ExcitableMediaConfig = z.infer<typeof excitableMediaSchema>
