import { z } from 'zod'

/** The pool floor, seen straight down. Every default here is owner-set from the
 *  live mockup (`docs/mockups/2026-09-12-caustics.html`, 2026-09-12) — a test that
 *  disagrees with one of these numbers is a wrong test, not a wrong default.
 *
 *  Deliberately NOT annotated with an explicit `: z.ZodObject<…>`: a literal
 *  annotation erases `.shape.seed`'s type and degrades `z.infer`. */
export const causticsSchema = z.object({
  // ─── Water ────────────────────────────────────────────────────────────────
  tempo: z.number().min(0).max(0.006).default(0.001)
    .meta({ section: 'Water', ui: 'slider', min: 0, max: 0.006, step: 0.0001, label: 'Tempo',
            help: 'Dilates the clock and nothing else — the surface keeps exactly the same shapes, '
                + 'it just gets through them faster. The ceiling is deliberately low: this piece is '
                + 'meant to be watched out of the corner of your eye. 0 freezes the water.' }),
  ripple: z.number().min(0.0015).max(0.026).default(0.0035)
    .meta({ section: 'Water', ui: 'slider', min: 0.0015, max: 0.026, step: 0.0002, label: 'Ripple',
            help: 'How steep the waves are, which is what focuses the light. Turning this DOWN does '
                + 'not make the piece calmer — it makes the web stop focusing and dissolve into a '
                + 'flat mottle. Use Tempo for calm; this is the knob that decides whether there is a '
                + 'picture at all.' }),
  gust: z.number().min(0).max(0.9).default(0.22)
    .meta({ section: 'Water', ui: 'slider', min: 0, max: 0.9, step: 0.01, label: 'Gust',
            help: 'A slow breeze wandering over the surface. It ruffles the short chop and barely '
                + 'touches the long swell, so what drifts across the floor is a change in the size '
                + 'of the cells rather than just their brightness. 0 makes every moment statistically '
                + 'identical to the last, which the eye stops seeing.' }),
  slosh: z.number().min(0).max(1).default(0.7)
    .meta({ section: 'Water', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Slosh',
            help: 'How much of the water stands and sloshes rather than travels. A pool is a closed '
                + 'basin, so its long waves bounce between the walls with their nodes staying put and '
                + 'the light breathes in place. At 0 every wave marches, and the whole web drifts '
                + 'steadily across the floor like open water. Near 1 every wave stands, so they all '
                + 'go slack together for a moment and the floor briefly clears — the web breathes '
                + 'hardest at the top of this slider.' }),
  depth: z.number().min(0.6).max(3.4).default(1)
    .meta({ section: 'Water', ui: 'slider', min: 0.6, max: 3.4, step: 0.05, label: 'Depth',
            help: 'Metres from the surface to the floor. Light bent at the surface travels further '
                + 'before it lands, so a deeper pool spreads and sharpens the web; a shallow one '
                + 'holds it close and soft.' }),
  scale: z.number().min(3).max(14).default(9.6)
    .meta({ section: 'Water', ui: 'slider', min: 3, max: 14, step: 0.1, label: 'Scale',
            help: 'How many metres of pool the screen covers. Waves are a fixed physical size, so '
                + 'this is how far back you are standing: smaller values give fewer, bigger cells.' }),

  // ─── Color ────────────────────────────────────────────────────────────────
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2f626b')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The water itself — the ground colour the bright filaments read against. This is '
                + 'the floor seen through a metre of pool, so it is the water and the tile together.' }),
  light: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#fffef6')
    .meta({ section: 'Color', ui: 'color', label: 'Light',
            help: 'The colour of the sun coming through. Warm white reads as afternoon; a cooler one '
                + 'pushes the whole pool towards deep water.' }),
  floor: z.enum(['Tile', 'Plain', 'Sand']).default('Tile')
    .meta({ section: 'Color', ui: 'segmented', options: ['Tile', 'Plain', 'Sand'], label: 'Floor',
            help: 'What the light lands on. Tile is a faint grout grid with slight per-tile '
                + 'variation, Plain is bare colour, Sand is a soft mottle. All three stay quiet on '
                + 'purpose — the caustic is the subject and a hard pattern competes with it.' }),

  // ─── Advanced ─────────────────────────────────────────────────────────────
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed',
            randomizeOnFreshLoad: true,
            help: 'Any integer. It fixes which directions the eleven wave trains run in, so the same '
                + 'seed always builds the same water. A fresh visit rolls a new one; a link you share '
                + 'deliberately does not carry it, so it shows a different pool every time.' }),
  tilt: z.number().min(1.6).max(2.6).default(1.78)
    .meta({ section: 'Advanced', ui: 'slider', min: 1.6, max: 2.6, step: 0.01, label: 'Swell',
            help: 'How the wave height is shared between long swell and fine chop. Below about 2 the '
                + 'shortest waves focus hardest and every cell comes out the same size — a wavy '
                + 'chain-link fence. Above it the swell takes over and the fine detail disappears '
                + 'into cracked glass. The default sits just under the even point.' }),
  spread: z.number().min(0).max(1).default(0.28)
    .meta({ section: 'Advanced', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Spread',
            help: 'How far the waves fan out from the wind line. At 0 every train runs in exactly the '
                + 'same direction and the floor reads as a regular lattice; opening it up lets the '
                + 'chop wander while the swell holds its heading.' }),
  tileSize: z.number().min(0.1).max(1).default(0.3)
    .meta({ section: 'Advanced', ui: 'slider', min: 0.1, max: 1, step: 0.05, label: 'Tile size',
            showWhen: { field: 'floor', equals: 'Tile' },
            help: 'Metres across one floor tile. Only the grout spacing changes — the waves do not '
                + 'care what is painted underneath them.' }),
})

export type CausticsConfig = z.infer<typeof causticsSchema>

/** The enum's member ORDER is the `uFloor` uniform's value: RESOLVE_FS branches
 *  `uFloor == 1` → Plain, `uFloor == 2` → Sand, else Tile. Not reorderable, and
 *  not inferable from the schema — a mapping that sends Plain → 0 renders the
 *  wrong floor and passes every test in this diversion, because nothing in the
 *  suite inspects a uniform. */
export const FLOOR_INDEX = ['Tile', 'Plain', 'Sand'] as const
