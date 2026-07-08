// schema.ts — single source of truth (form + URL codec + Config type) for Vicsek
// Flock. The whole model is one control: noise η. Everything else (count, radius,
// arena size) just sets the DENSITY the phase transition plays out at.
import { z } from 'zod'

const TWO_PI = Math.PI * 2

// A full-hue wheel: heading maps onto this ring (wrapping), so a coherent flock
// reads as a solid colour domain and a disordered gas scrambles into confetti.
const DEFAULT_PALETTE = [
  '#ff4d6d', '#ff9e4d', '#ffe14d', '#7bff8a', '#4de1ff', '#4d7bff', '#b14dff', '#ff4de1',
]

export const vicsekSchema = z.object({
  // ── Flock ──
  particleCount: z.number().int().min(100).max(3000).default(2200)
    .meta({ section: 'Flock', ui: 'slider', min: 100, max: 3000, step: 50, label: 'Particles',
            help: 'Self-propelled particles in the field. All-neighbour averaging over a spatial '
                + 'grid, so this stays smooth well past a thousand.' }),
  speed: z.number().min(10).max(200).default(60)
    .meta({ section: 'Flock', ui: 'slider', min: 10, max: 200, step: 5, label: 'Speed',
            help: 'Constant travel speed (world units/second). Vicsek particles never speed up or '
                + 'slow down — only turn.' }),
  neighborRadius: z.number().min(5).max(60).default(24)
    .meta({ section: 'Flock', ui: 'slider', min: 5, max: 60, step: 1, label: 'Neighbour radius',
            help: 'How far each particle looks to average its neighbours’ heading. A wider '
                + 'radius reaches order at a higher noise (more eyes agreeing, faster).' }),
  worldSize: z.number().min(300).max(1800).default(620)
    .meta({ section: 'Flock', ui: 'slider', min: 300, max: 1800, step: 50, label: 'Arena size',
            help: 'Side length of the square arena (wraps at the edges). The SAME particle count in '
                + 'a smaller arena packs denser — density is the model’s other lever on the phase '
                + 'transition, alongside noise.' }),

  // ── Phase Transition ──
  noise: z.number().min(0).max(TWO_PI).default(1.1)
    .meta({ section: 'Phase Transition', ui: 'slider', min: 0, max: TWO_PI, step: 0.02, label: 'Noise (η)',
            help: 'The whole model in one knob. Each step, a particle’s new heading is the mean '
                + 'of its neighbours, perturbed by a random angle up to ±η/2. η=0 is perfect order — '
                + 'the field locks into one drifting flock. Crank it up past the critical point and '
                + 'order collapses into a directionless, milling gas. That collapse is the headline.' }),

  // ── Display ──
  showOrderParameter: z.boolean().default(true)
    .meta({ section: 'Display', ui: 'toggle', label: 'Order readout',
            help: 'Show the live order parameter — the length of the mean heading vector, 0..1. '
                + '1 = every particle points the same way; 0 = headings cancel out into noise. This '
                + 'is the number physicists watch to find the transition.' }),

  // ── Color ──
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(16).default(DEFAULT_PALETTE)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 16, label: 'Palette',
            help: 'Particles are tinted by their heading around this wheel (wrapping end→start). '
                + 'A coherent flock reads as one colour domain; a disordered gas scrambles it into '
                + 'confetti.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070d')
    .meta({ section: 'Color', ui: 'color', label: 'Background', help: 'Dark reads best against the '
                + 'heading-hue particles.' }),

  // ── Advanced ──
  seed: z.number().int().default(19950613)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed',
            randomizeOnFreshLoad: true,
            help: 'Any integer. The seed rolls the starting positions and headings, so the same seed '
                + 'always starts the same world. A fresh visit rolls a new one.' }),
})

export type VicsekConfig = z.infer<typeof vicsekSchema>
