import { z } from 'zod'

// Worm — a clean-room take on xscreensaver's "worm". Several worms crawl on
// smooth curving paths (a slow random walk in heading → gentle S-curves),
// dragging a fixed-length, tapered, glossy body chain behind a rounded head.
export const wormSchema = z.object({
  wormCount: z.number().int().min(1).max(24).default(6)
    .meta({ section: 'Body', ui: 'slider', min: 1, max: 24, step: 1, label: 'Worms',
            help: 'How many worms crawl the screen at once.' }),
  bodyLength: z.number().int().min(8).max(90).default(44)
    .meta({ section: 'Body', ui: 'slider', min: 8, max: 90, step: 1, label: 'Body length',
            help: 'Segments in each worm. More = longer, more sinuous bodies.' }),
  thickness: z.number().min(3).max(48).default(18)
    .meta({ section: 'Body', ui: 'slider', min: 3, max: 48, step: 1, label: 'Thickness',
            help: 'Diameter of the fattest part of the body, in pixels.' }),
  taper: z.number().min(0).max(1).default(0.7)
    .meta({ section: 'Body', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Taper',
            help: '0 = an even tube. 1 = the tail narrows to a point behind the rounded head.' }),
  speed: z.number().min(10).max(240).default(70)
    .meta({ section: 'Motion', ui: 'slider', min: 10, max: 240, step: 1, label: 'Speed',
            help: 'How fast each head glides forward, in pixels per second.' }),
  turniness: z.number().min(0).max(0.3).default(0.08)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 0.3, step: 0.005, label: 'Turniness',
            help: 'How much the heading jitters each step. Low = long, lazy curves; '
                + 'high = tight, restless wriggling. Never sharp corners.' }),
  colorMode: z.enum(['per-worm', 'rainbow', 'shift-along-body']).default('per-worm')
    .meta({ section: 'Color', ui: 'segmented', options: ['per-worm', 'rainbow', 'shift-along-body'],
            label: 'Color mode',
            help: 'per-worm: each worm keeps one random hue. rainbow: worms fan across the '
                + 'spectrum. shift-along-body: the hue drifts down each worm’s length.' }),
  bodyHueShift: z.number().min(30).max(360).default(150)
    .meta({ section: 'Color', ui: 'slider', min: 30, max: 360, step: 5, label: 'Body hue shift',
            showWhen: { field: 'colorMode', equals: 'shift-along-body' },
            help: 'Degrees the hue sweeps from head to tail.' }),
  saturation: z.number().min(0).max(100).default(78)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 100, step: 1, label: 'Saturation',
            help: 'Color intensity of the bodies.' }),
  lightness: z.number().min(30).max(75).default(58)
    .meta({ section: 'Color', ui: 'slider', min: 30, max: 75, step: 1, label: 'Lightness',
            help: 'Base brightness of the bodies before the glossy highlight.' }),
  trailMode: z.enum(['clean', 'trails']).default('clean')
    .meta({ section: 'Trails', ui: 'segmented', options: ['clean', 'trails'], label: 'Trails',
            help: 'clean: crisp glossy worms glide over a fresh frame. '
                + 'trails: they smear a slowly-fading trail behind them.' }),
  trailFade: z.number().min(0).max(100).default(60)
    .meta({ section: 'Trails', ui: 'slider', min: 0, max: 100, step: 1, label: 'Trail length',
            showWhen: { field: 'trailMode', equals: 'trails' },
            help: 'Higher leaves a longer, slower-fading trail. Only applies in trails mode.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0a14')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Backdrop the worms glide over (and trails fade toward).' }),
  seed: z.number().int().default(4231)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed reproduces the same paths and colours. '
                + 'A fresh visit rolls a new one.' }),
})

export type WormConfig = z.infer<typeof wormSchema>
