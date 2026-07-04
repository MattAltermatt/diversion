import { z } from 'zod'

// Wander — GH #79. A clean-room take on xscreensaver's "wander": one or more
// walkers take a biased (correlated) random walk across the plane, leaving a
// coloured trail whose hue drifts slowly as it goes. The accumulated paths weave
// an ever-growing meandering tapestry; when the screen fills (or a comet-style
// fade keeps it fresh) it gently renews from a new seed. Single Zod schema =
// source of truth for the form, the URL codec, and the Config type.
export const wanderSchema = z.object({
  walkers: z.number().int().min(1).max(6).default(3)
    .meta({ section: 'Walk', ui: 'slider', min: 1, max: 6, step: 1, label: 'Walkers',
            help: 'How many wandering pens paint at once. One is a lone meandering river; a few weave a fuller tapestry.' }),
  speed: z.number().min(5).max(200).default(60)
    .meta({ section: 'Walk', ui: 'slider', min: 5, max: 200, step: 5, label: 'Speed',
            help: 'Walk steps per second. Low and slow is the zen default; higher fills the screen faster.' }),
  stepSize: z.number().min(1).max(12).default(3)
    .meta({ section: 'Walk', ui: 'slider', min: 1, max: 12, step: 0.5, label: 'Step size',
            help: 'Distance (px) the pen travels each step. Small = fine detailed threads; large = bold sweeping strokes.' }),
  turnLever: z.number().min(0).max(1).default(0.28)
    .meta({ section: 'Walk', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Wander',
            help: 'How sharply the heading jitters each step. Low = smooth flowing curves; high = jagged, restless paths.' }),
  edges: z.enum(['wrap', 'bounce']).default('wrap')
    .meta({ section: 'Walk', ui: 'segmented', options: ['wrap', 'bounce'], label: 'Edges',
            help: 'Wrap: a pen leaving one edge reappears on the opposite side. Bounce: it reflects off the edge like a wall.' }),

  colorCycleSpeed: z.number().min(0).max(1).default(0.15)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Color drift',
            help: 'How fast each trail cycles through the palette as it wanders. 0 = each pen keeps one colour; high = a fast-shifting rainbow river.' }),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8)
    .default(['#2ee6c0', '#3aa0ff', '#8a5cff', '#ff5ca8', '#ffc24d'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Palette', min: 2, max: 8,
            help: 'Colours the trail cycles through (looped end-to-start). More stops = a richer gradient river.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#060a12')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The dark ground the luminous trails weave across. Edited live.' }),

  lineWidth: z.number().min(0.5).max(8).default(2.5)
    .meta({ section: 'Trail', ui: 'slider', min: 0.5, max: 8, step: 0.5, label: 'Line width',
            help: 'Thickness (px) of the wandering trail.' }),
  glow: z.boolean().default(true)
    .meta({ section: 'Trail', ui: 'toggle', label: 'Glow',
            help: 'Lay a soft same-hue halo under each stroke so the ribbons read as luminous rather than flat lines.' }),
  trailStyle: z.enum(['accumulate', 'fade']).default('accumulate')
    .meta({ section: 'Trail', ui: 'segmented', options: ['accumulate', 'fade'], label: 'Trail',
            help: 'Accumulate: paths pile up into an ever-growing tapestry, then fade and reseed when the screen fills. '
                + 'Fade: the trail continuously dims behind each pen, so it reads as a moving comet ribbon that never fully fills.' }),
  fillThreshold: z.number().int().min(20).max(95).default(70)
    .meta({ section: 'Trail', ui: 'slider', min: 20, max: 95, step: 1, label: 'Fill %',
            showWhen: { field: 'trailStyle', equals: 'accumulate' },
            help: 'Percent of the screen the tapestry covers before it fades out and reseeds (accumulate mode).' }),
  fadeTime: z.number().min(0.5).max(8).default(3)
    .meta({ section: 'Trail', ui: 'slider', min: 0.5, max: 8, step: 0.5, label: 'Fade time',
            help: 'Accumulate: seconds the full tapestry takes to fade out before reseeding. '
                + 'Fade: how long a trail lingers behind the pen (higher = longer comet tail).' }),

  seed: z.number().int().default(4931)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed reproduces the exact same wander. A fresh visit rolls a new one.' }),
})

export type WanderConfig = z.infer<typeof wanderSchema>
