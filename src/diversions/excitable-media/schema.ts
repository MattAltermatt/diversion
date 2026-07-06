import { z } from 'zod'

// Intensity → color ramp. Index 0 is the resting (healthy) background; the last is
// the peak of an excited wave; the tail sweeps the ramp in between. Default: "Aurora"
// — a 16-stop perceptual ramp (deep navy → blue → cyan → icy white) with even
// luminance steps, so the now-smoothed intensity reads as a rich continuous gradient
// rather than a few hard bands. (Other palettes, incl. the classic red-orange Ferroin
// BZ dye, live in presets.ts.)
const DEFAULT_STOPS = [
  '#04070f', '#061530', '#08214a', '#0a2f63', '#0c3d7d', '#0e4d93', '#105ea8', '#1372bb',
  '#1787cc', '#1e9dd8', '#2ab3e2', '#3fc7ea', '#63d6f0', '#93e4f5', '#c3f2fa', '#eafcff',
]

export const excitableMediaSchema = z.object({
  // ── Simulation ──
  simSpeed: z.number().min(0.01).max(2).default(0.05)
    .meta({ section: 'Simulation', ui: 'slider', min: 0.01, max: 2, step: 0.01, label: 'Sim speed',
            help: 'How fast the reaction evolves, in sub-steps per frame. The default is a slow crawl — '
                + 'the dish ticks gently and, with smoothing, drifts glassily instead of flickering. '
                + 'Raise it to organize faster (the low end takes a while to settle); even 1 is brisk '
                + 'and the ceiling of 2 flickers fast.' }),
  persistence: z.number().min(0).max(1).default(0.6)
    .meta({ section: 'Simulation', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Smoothing',
            help: 'Phosphor-style trailing that fades each cell between its discrete rest→crest '
                + 'jumps instead of snapping — this is what tames the white flicker in the turbulent, '
                + 'non-spiral patches. 0 is the raw hard-edged automaton; higher is a smoother, '
                + 'more liquid glow (too high smears the crisp spiral fronts).' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
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
  stops: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(16).default(DEFAULT_STOPS)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 16, label: 'Wave colors',
            help: 'The lowest color is the resting background; the highest is the wave crest. '
                + 'The recovering tail fades down through the ramp between them.' }),
})

export type ExcitableMediaConfig = z.infer<typeof excitableMediaSchema>
