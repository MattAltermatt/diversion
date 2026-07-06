import { z } from 'zod'

export const juliaMorphSchema = z.object({
  // ── Pattern ──
  speed: z.number().min(0).max(2).default(0.14)
    .meta({ section: 'Pattern', ui: 'slider', min: 0, max: 2, step: 0.02, label: 'Morph speed',
            help: 'How fast the Julia constant orbits the plane — the whole fractal continuously '
                + 'transforms. 0 = frozen on one form.' }),
  view: z.number().min(0.4).max(2.4).default(1.1)
    .meta({ section: 'Pattern', ui: 'slider', min: 0.4, max: 2.4, step: 0.05, label: 'View',
            help: 'How much of the plane fills the screen. Lower zooms in on the filigree; '
                + 'higher pulls back to the whole set.' }),
  shape: z.number().min(0.5).max(1).default(0.7885)
    .meta({ section: 'Pattern', ui: 'slider', min: 0.5, max: 1, step: 0.005, label: 'Shape',
            help: 'Radius of the orbiting constant — this reshapes the family entirely. Small '
                + 'changes morph dendrites into spirals into scattered islands.' }),
  iterations: z.number().int().min(40).max(320).default(150)
    .meta({ section: 'Pattern', ui: 'slider', min: 40, max: 320, step: 10, label: 'Detail',
            help: 'Escape iterations — more sharpens the fractal boundary and its finest '
                + 'filaments, at some cost.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Sets where the constant starts its orbit — each fresh visit opens on a '
                + 'different form. A shared link is seedless; an explicit seed reproduces one.' }),
  // ── Color ──
  bands: z.number().min(0.1).max(3).default(0.5)
    .meta({ section: 'Color', ui: 'slider', min: 0.1, max: 3, step: 0.05, label: 'Bands',
            help: 'Frequency of the color bands rippling out through the escape rings.' }),
  colorA: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0b1e5a')
    .meta({ section: 'Color', ui: 'color', label: 'Escape color A',
            help: 'One end of the exterior gradient (fast-escaping regions).' }),
  colorB: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffd36b')
    .meta({ section: 'Color', ui: 'color', label: 'Escape color B',
            help: 'The other end of the exterior gradient (slow-escaping filaments).' }),
  colorInside: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05030f')
    .meta({ section: 'Color', ui: 'color', label: 'Interior',
            help: 'Color of the trapped interior (points that never escape).' }),
})

export type JuliaMorphConfig = z.infer<typeof juliaMorphSchema>
