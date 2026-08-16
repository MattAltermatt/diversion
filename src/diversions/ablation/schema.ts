import { z } from 'zod'

// Ablation: turrets on a rectangular track peel a quantized contour-map picture
// from the outside in. One schema drives the form, the URL codec, and the type.
// Two preset axes (Palette = colours, Demolition = turret feel) live in presets.ts.
export const ablationSchema = z.object({
  // ─── Picture ──────────────────────────────────────────────────────────────
  // `source` gates everything below it. It has to be an enum rather than a
  // derived "is an image set" test, because showWhen.equals only validates
  // against enum siblings — and an explicit mode reads better anyway than
  // controls silently swapping the moment a file is picked.
  source: z.enum(['Contours', 'Image']).default('Contours')
    .meta({ section: 'Picture', ui: 'segmented', label: 'Source',
            options: ['Contours', 'Image'],
            help: 'Contours generates a fresh topographic map for every picture. Image peels '
                + 'a picture you choose, reduced to a handful of colours — and re-peels the '
                + 'same one each time, since the crew is shuffled fresh per picture and never '
                + 'dissolves it the same way twice.' }),
  image: z.string().optional()
    .meta({ section: 'Picture', ui: 'image', label: 'Image', local: true,
            showWhen: { field: 'source', equals: 'Image' },
            help: 'Stays on this machine — a picture is far too big to ride in a link. Your own '
                + 'reloads keep it; someone opening a link you share sees the generated contour '
                + 'map instead, or their own picture if they have one here.' }),
  colors: z.number().int().min(2).max(24).default(6)
    .meta({ section: 'Picture', ui: 'slider', min: 2, max: 24, step: 1, label: 'Colors',
            showWhen: { field: 'source', equals: 'Image' },
            help: 'How many colours the picture is reduced to, which is also how many bands '
                + 'the crew divides into. Like is grouped with like, and the range is stretched '
                + 'to span dark to light — so 2 gives you a stark two-tone picture. The dark end '
                + 'stops short of the ground on purpose: a band that matched the background '
                + 'would be indistinguishable from the space a turret had already cleared.' }),
  cellSize: z.number().int().min(2).max(40).default(10)
    .meta({ section: 'Picture', ui: 'slider', min: 2, max: 40, step: 1, label: 'Cell size',
            help: 'Size of one cell in pixels. Smaller means a finer picture and a far longer '
                + 'demolition — at 2 there are a quarter-million cells to get through.' }),
  featureSize: z.number().min(4).max(60).default(18)
    .meta({ section: 'Picture', ui: 'slider', min: 4, max: 60, step: 1, label: 'Feature size',
            showWhen: { field: 'source', equals: 'Contours' },
            help: 'Cells per contour feature. Large gives a few huge lazy bands that take an age '
                + 'to peel; small gives crenellated ridges and islands that fragment fast.' }),
  roughness: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Picture', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Roughness',
            showWhen: { field: 'source', equals: 'Contours' },
            help: 'How much the finer octaves contribute. 0 is smooth rolling contours; 1 is '
                + 'ragged, noisy coastline.' }),

  // ─── Color ────────────────────────────────────────────────────────────────
  palette: z.array(z.string()).min(2).max(24)
    // Deliberately stops short of the ground — see the note in presets.ts.
    .default(['#1b4f6b', '#247091', '#2f8b9b', '#67b8ab', '#b2d18d', '#f2e2b0'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Palette',
            showWhen: { field: 'source', equals: 'Contours' },
            help: 'The contour bands, outermost value first. The LENGTH of this list is the '
                + 'number of bands — two colours gives a stark black-and-white map, twenty a '
                + 'slow topographic dissolve.' }),
  background: z.string().default('#05070a')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'What a destroyed cell leaves behind.' }),

  // ─── Turrets ───────────────────────────────────────────────────────────────
  capacity: z.number().int().min(1).max(64).default(12)
    .meta({ section: 'Turrets', ui: 'slider', min: 1, max: 64, step: 1, label: 'Turrets on track',
            help: 'How many turrets ride the track at the same time. This plus "In queue" is '
                + 'the whole fleet — a turret is never used up, it rides a shift, rotates out '
                + 'at the gate, recharges and queues for another. Set it to 2 with Spacing at '
                + '1 for a pair working exactly opposite each other.' }),
  queued: z.number().int().min(0).max(64).default(8)
    .meta({ section: 'Turrets', ui: 'slider', min: 0, max: 64, step: 1, label: 'In queue',
            help: 'How many turrets wait outside the gate for a slot to free. 0 means no '
                + 'reserve at all — a turret rotating out is released again straight away. In '
                + 'Mixed this is raised automatically if the fleet would otherwise be smaller '
                + 'than the number of colours, since a colour with no turret hunting it can '
                + 'never be cleared. It is a starting count, not a promise: as colours run out '
                + 'the queue also drains into the retired row.' }),
  spacing: z.number().min(0).max(1).default(1)
    .meta({ section: 'Turrets', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Spacing',
            help: 'How turrets are distributed around the track. 0 sends every one in at the '
                + 'gate, so they ride as one bunched pack and the picture is worked by a wave '
                + 'sweeping round. 1 spreads them at perfectly even intervals — and because '
                + 'they all travel at the same speed, they stay evenly spread, so the whole '
                + 'perimeter is worked at once.' }),
  targeting: z.enum(['Mixed', 'Unison']).default('Mixed')
    .meta({ section: 'Turrets', ui: 'segmented', label: 'Targeting',
            options: ['Mixed', 'Unison'],
            help: 'Mixed gives the fleet a fixed colour mix matching the picture, so '
                + 'every band is worked at once and the map dissolves evenly. Unison '
                + 'locks the whole crew onto ONE colour until it is gone from the '
                + 'outside edge, then picks another — the map peels a band at a time. '
                + 'A crew converts as its turrets rotate, so a switch shows up in the '
                + 'queue before it reaches the track.' }),
  charge: z.number().int().min(3).max(400).default(60)
    .meta({ section: 'Turrets', ui: 'slider', min: 3, max: 400, step: 1, label: 'Charge',
            help: 'How many cells one turret destroys before its shift ends. It then '
                + 'rotates out at the gate, recharges to full and rejoins the back of '
                + 'the queue. Brightness on the track is charge remaining, so a turret '
                + 'dims visibly as its shift runs down.' }),
  speed: z.number().min(2).max(600).default(140)
    .meta({ section: 'Turrets', ui: 'slider', min: 2, max: 600, step: 2, label: 'Track speed',
            help: 'Pixels per second around the track — the pace of the whole piece. It also '
                + 'sets the firing rate, since a turret gets one shot per cell it passes, so '
                + 'there is no separate rate to tune: turning this down slows travel and '
                + 'demolition together without changing what the picture looks like on the way. '
                + 'The low end is a deep crawl; the default is already unhurried.' }),
  targetingBias: z.number().min(0).max(3).default(1)
    .meta({ section: 'Turrets', ui: 'slider', min: 0, max: 3, step: 0.05, label: 'Targeting bias',
            help: 'How the fleet is shared out. 0 gives every colour the same number '
                + 'of turrets whatever its share of the picture; 1 is strictly '
                + 'proportional, so a map that is half blue gets a crew that is half '
                + 'blue; above 1 the crew piles onto whatever covers the most ground. '
                + 'In Unison it weights which colour the crew locks onto next.' }),
  trackOffset: z.number().int().min(4).max(80).default(22)
    .meta({ section: 'Turrets', ui: 'slider', min: 4, max: 80, step: 1, label: 'Track offset',
            help: 'Gap between the track and the picture. Also sets the corner dead zones, where '
                + 'a turret rides past the picture and its beam finds nothing.' }),

  // ─── Advanced ─────────────────────────────────────────────────────────────
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', label: 'Seed', randomizeOnFreshLoad: true,
            collapsed: true,
            help: 'Fixes the picture sequence. Omitted from shared links so every visit gets a '
                + 'new world; pin one here to reproduce an exact run.' }),
  lapCap: z.number().int().min(1).max(12).default(3)
    .meta({ section: 'Advanced', ui: 'number', label: 'Lap cap', min: 1, max: 12,
            help: 'A backstop on how long one turret may ride. A turret that goes a whole lap '
                + 'without a single strike leaves anyway — its colour is not showing anywhere '
                + '— so this only catches the opposite case: one that keeps hitting and still '
                + 'has charge left.' }),
})

export type AblationConfig = z.infer<typeof ablationSchema>
