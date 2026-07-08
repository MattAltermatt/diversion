import { z } from 'zod'

// Vermiculate — turtle-graphics "worms" crawl the plane, turning by a rate that
// itself drifts step to step, leaving trails that meander into a wormy,
// vermiculated tangle (like the winding galleries worms leave under bark).
// Clean-room reimplementation of the mechanic in xscreensaver's `vermiculate`
// (Jamie Zawinski / David Konerding) — see index.ts for the credit line and
// dla.ts-style state notes for the port's design decisions. One schema drives
// the form, the URL codec, and the Config type.
export const vermiculateSchema = z.object({
  // ─── Form (the turtles) ──────────────────────────────────────────────────────
  worms: z.number().int().min(1).max(30).default(12)
    .meta({ section: 'Form', ui: 'slider', min: 1, max: 30, step: 1, label: 'Worms',
            help: 'How many turtles crawl at once. A few is calm and meditative; more fills the '
                + 'plane faster and denser.' }),
  stepSize: z.number().min(1).max(8).default(3)
    .meta({ section: 'Form', ui: 'slider', min: 1, max: 8, step: 0.25, label: 'Step size',
            help: 'Distance covered per turtle step, in pixels. Larger steps turn less often, '
                + 'so tracks read chunkier and more angular.' }),
  speed: z.number().min(5).max(240).default(60)
    .meta({ section: 'Form', ui: 'slider', min: 5, max: 240, step: 5, label: 'Crawl speed',
            help: 'Turtle steps per second (frame-rate independent). Low = a slow, zen crawl you '
                + 'can trace by eye; high = the tangle fills in fast.' }),
  wander: z.number().min(0).max(20).default(6)
    .meta({ section: 'Form', ui: 'slider', min: 0, max: 20, step: 0.5, label: 'Wander',
            help: 'Degrees the turning rate itself randomly drifts, per step. 0 = each worm holds '
                + 'a fixed turn and traces a clean arc; higher = the curl constantly changes, '
                + 'producing the organic worm-track wiggle.' }),
  curlLimit: z.number().min(5).max(90).default(40)
    .meta({ section: 'Form', ui: 'slider', min: 5, max: 90, step: 1, label: 'Curl limit',
            help: 'Clamp on how sharply a worm can turn per step, in degrees. Low = gentle, '
                + 'sweeping tracks; high = tight coils and switchbacks.' }),

  // ─── Render ────────────────────────────────────────────────────────────────
  trailWidth: z.number().min(0.5).max(6).default(2.2)
    .meta({ section: 'Render', ui: 'slider', min: 0.5, max: 6, step: 0.1, label: 'Trail width',
            help: 'Thickness of each worm track in pixels.' }),
  hueCycleLength: z.number().min(40).max(2000).default(320)
    .meta({ section: 'Render', ui: 'slider', min: 40, max: 2000, step: 10, label: 'Color cycle length',
            help: 'Distance (in pixels) a worm travels before its trail color cycles once through '
                + 'the palette. Short = rainbow-striped tracks; long = a slow gradient along each worm.' }),
  glow: z.number().min(0).max(1).default(0.22)
    .meta({ section: 'Render', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Glow',
            help: 'Soft bloom around the tracks. 0 = crisp ink; higher = a warm luminous tangle.' }),

  // ─── Color ───────────────────────────────────────────────────────────────
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1c140c')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Canvas color — the "wood" the worm tracks are carved into.' }),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(8)
    .default(['#1c140c', '#6b4a2f', '#c99a5b', '#f1e3c6'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Palette', min: 1, max: 8,
            help: 'Cycled along each worm’s trail as it crawls (see Color cycle length). '
                + 'Each worm also starts at a different point in the cycle for variety.' }),

  seed: z.number().int().default(11)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Same seed regrows the same starting worms. A fresh visit rolls a new one.' }),
})

export type VermiculateConfig = z.infer<typeof vermiculateSchema>
