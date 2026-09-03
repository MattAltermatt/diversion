import { z } from 'zod'
// Shared with Ablation deliberately (see the spec's Reuse section): a module two lazy
// chunks import lands in the precache wherever its source file lives, so hoisting it
// would move a file and change nothing about the bundle.
import { PICTURE_OPTIONS, SHUFFLE_ALL } from '../ablation/pictures'

// Salvage: a colony of spider drones takes a sprite apart from the outside in and
// carries it, piece by piece, to a mound on the far side. One schema drives the form,
// the URL codec and the Config type.
export const salvageSchema = z.object({
  // ─── Picture ──────────────────────────────────────────────────────────────
  source: z.enum(['Pictures', 'Contours', 'Yours']).default('Pictures')
    .meta({ section: 'Picture', ui: 'segmented', label: 'Source', options: ['Pictures', 'Contours', 'Yours'],
            help: 'Pictures works through a set of pixel-art sprites bundled with the gallery. '
                + 'Contours generates a fresh banded contour map — the picture Ablation eats — '
                + 'each time one is carried off; the Palette presets above apply to it. Yours '
                + 'dismantles a picture from your own machine, the same one every time.' }),
  picture: z.string().default(SHUFFLE_ALL)
    .meta({ section: 'Picture', ui: 'select', label: 'Picture', options: PICTURE_OPTIONS,
            showWhen: { field: 'source', equals: 'Pictures' },
            help: 'Shuffle all moves to the next sprite each time a picture is finished; picking '
                + 'one repeats it. This choice travels in a shared link.' }),
  image: z.string().optional()
    .meta({ section: 'Picture', ui: 'image', label: 'Image', local: true,
            showWhen: { field: 'source', equals: 'Yours' },
            help: 'Stays on this machine — a picture is far too big to ride in a link. Shared '
                + 'with Ablation: the last picture chosen in either piece is the one both use. '
                + 'Someone opening a link you share sees the bundled sprites instead.' }),
  // Same regex as Ablation's: z.string() would accept '%2' as a stop, which is invalid
  // as a fillStyle and leaves the previous fill silently in place.
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(12)
    .default(['#1b4f6b', '#247091', '#2f8b9b', '#67b8ab', '#b2d18d', '#f2e2b0'])
    // min/max restate the Zod bounds so ColorList does not fall back to its own 1..8 (#304).
    .meta({ section: 'Picture', ui: 'colorList', min: 2, max: 12, label: 'Palette',
            showWhen: { field: 'source', equals: 'Contours' },
            help: 'The ramp the contour map is painted in, dark to light. Colors below picks how '
                + 'many bands it is read at: fewer than the stops drops tones, more spreads the '
                + 'same ramp over finer steps.' }),
  colors: z.number().int().min(2).max(12).default(6)
    .meta({ section: 'Picture', ui: 'slider', min: 2, max: 12, step: 1, label: 'Colors',
            help: 'How many colours the picture is reduced to. Each is a trail the colony can '
                + 'follow and a tint a drone can take, so fewer colours means bigger, more '
                + 'decisive waves.' }),
  // ─── Colony ───────────────────────────────────────────────────────────────
  drones: z.number().int().min(10).max(400).default(60)
    .meta({ section: 'Colony', ui: 'slider', min: 10, max: 400, step: 10, label: 'Drones',
            help: 'How many drones the colony has. A small arena caps it so a thumbnail is not '
                + 'wall-to-wall drones.' }),
  strength: z.number().int().min(1).max(24).default(3)
    .meta({ section: 'Colony', ui: 'slider', min: 1, max: 24, step: 1, label: 'Strength',
            help: 'Pixels of the picture one drone can carry alone. A heavier piece waits, with '
                + 'drones latched on and pulsing, until enough have gathered to lift it together.' }),
  chunkSize: z.number().int().min(1).max(48).default(12)
    .meta({ section: 'Colony', ui: 'slider', min: 1, max: 48, step: 1, label: 'Piece size',
            help: 'Largest piece the picture is cut into, in pixels of the picture — this is what '
                + 'sets how many pieces there are. Pieces follow '
                + 'the pixel grid. At 1 every pixel is its own piece and no crew ever forms.' }),
  immunity: z.number().min(0).max(120).default(20)
    .meta({ section: 'Colony', ui: 'slider', min: 0, max: 120, step: 1, label: 'Immunity',
            help: 'Seconds a drone that gave up on a colour refuses to be recruited back to it. '
                + 'Short keeps the colony mixed; long makes it sweep the picture one colour at a time.' }),
  tempo: z.number().min(0.1).max(4).default(1)
    .meta({ section: 'Colony', ui: 'slider', min: 0.1, max: 4, step: 0.1, label: 'Tempo',
            help: 'Scales every speed in the sim at once. 1 is a calm crawl; 4 is an ant hill.' }),
  glyph: z.enum(['Spider', 'Ant', 'Dot']).default('Spider')
    .meta({ section: 'Colony', ui: 'segmented', label: 'Drone', options: ['Spider', 'Ant', 'Dot'],
            help: 'How a drone is drawn. Same colony either way.' }),
  droneSize: z.number().min(0.6).max(1.5).default(0.8)
    .meta({ section: 'Colony', ui: 'slider', min: 0.6, max: 1.5, step: 0.05, label: 'Drone size',
            help: 'How big a drone draws, as a multiple of its natural size. Looks only: the colony, '
                + 'its speed and its reach are unchanged.' }),

  // ─── Trails ───────────────────────────────────────────────────────────────
  trailFade: z.number().min(2).max(120).default(25)
    .meta({ section: 'Trails', ui: 'slider', min: 2, max: 120, step: 1, label: 'Trail fade',
            help: 'Seconds for a trail to fade to half. Tinted drones lay a trail in their '
                + 'colour on the way to a piece and on the way home, and blank drones crossing it '
                + 'take that colour — a thickening trail is the colony telling you what goes next.' }),
  trailGlow: z.number().min(0).max(1).default(0.6)
    .meta({ section: 'Trails', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Trail glow',
            help: 'How bright trails are drawn. Purely visual — recruitment is unaffected.' }),

  // ─── Color ────────────────────────────────────────────────────────────────
  background: z.string().default('#07080c')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The ground. The picture\'s darkest colour is lifted clear of it so no piece '
                + 'can vanish against the floor.' }),

  // ─── Advanced ─────────────────────────────────────────────────────────────
  featureSize: z.number().min(3).max(30).default(8)
    .meta({ section: 'Advanced', ui: 'slider', min: 3, max: 30, step: 1, label: 'Feature size',
            showWhen: { field: 'source', equals: 'Contours' },
            help: 'Blocks per contour feature. Large gives a few broad lazy bands; small gives '
                + 'crenellated ridges and islands that come apart as many small pieces.' }),
  roughness: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Advanced', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Roughness',
            showWhen: { field: 'source', equals: 'Contours' },
            help: 'How much the finer octaves contribute. 0 is smooth rolling contours; 1 is '
                + 'ragged coastline.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            collapsed: true,
            help: 'Fixes the drones\' wandering, the sprite order and the contour maps. Omitted '
                + 'from shared links so every visit is a fresh colony.' }),
})

export type SalvageConfig = z.infer<typeof salvageSchema>
