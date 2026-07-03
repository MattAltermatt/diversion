import { z } from 'zod'

export const KALEIDO = ['Auto', 'On', 'Off'] as const

export const goldenApollonianSchema = z.object({
  // ── Flight ──
  speed: z.number().min(0.1).max(3).default(1)
    .meta({ section: 'Flight', ui: 'slider', min: 0.1, max: 3, step: 0.05, label: 'Speed',
            help: 'How fast the camera flies down the endless tunnel.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Flight', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Sets where in the endless flight it opens. A shared link is seedless — every '
                + 'visit begins somewhere new.' }),
  depth: z.number().int().min(4).max(9).default(9)
    .meta({ section: 'Flight', ui: 'slider', min: 4, max: 9, step: 1, label: 'Depth',
            help: 'How many fractal planes are drawn into the distance — more is deeper and '
                + 'richer. This is the main performance dial: if the framerate drops on a '
                + 'weaker GPU or a large fullscreen display, lower it.' }),
  distortion: z.number().min(0).max(1.2).default(0.5)
    .meta({ section: 'Flight', ui: 'slider', min: 0, max: 1.2, step: 0.05, label: 'Fisheye',
            help: 'Lens distortion — 0 is a flat view, higher bends the tunnel into a fisheye.' }),
  // ── Look ──
  kaleido: z.enum(KALEIDO).default('Auto')
    .meta({ section: 'Look', ui: 'segmented', options: KALEIDO as unknown as string[], label: 'Kaleidoscope',
            help: 'Kaleidoscopic mirror symmetry on the walls. Auto cycles it on and off plane by '
                + 'plane (the original behaviour); On/Off force it.' }),
  ring: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffc470')
    .meta({ section: 'Look', ui: 'color', label: 'Ring color',
            help: 'The glowing Apollonian-gasket rings on the tunnel walls.' }),
  sun: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffcce0')
    .meta({ section: 'Look', ui: 'color', label: 'Sun glow',
            help: 'The soft glow far down the throat of the tunnel.' }),
})

export type GoldenApollonianConfig = z.infer<typeof goldenApollonianSchema>
