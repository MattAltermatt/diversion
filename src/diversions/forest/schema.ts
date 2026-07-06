import { z } from 'zod'

// Forest — a SCENE of recursive fractal trees standing across the ground at
// varying depths. Each tree's full branch geometry is built ONCE (deterministic
// from seed) then revealed level-by-level so trees visibly sprout: trunk first,
// then boughs, then twigs, then foliage. The whole grove grows → settles → fades
// → reseeds, an endless zen loop. Depth is faked with a painter's-order parallax:
// nearer trees are larger, lower, and richly coloured; farther trees are smaller,
// higher, and blended toward a misty haze (atmospheric perspective).
//
// This schema is the single source of truth: it drives the config form, the URL
// codec, AND the Config type. SEASON palettes live in `tree.ts`.
export const forestSchema = z.object({
  // ─── Forest (scene + reveal) ────────────────────────────────────────────────
  treeCount: z.number().int().min(3).max(24).default(10)
    .meta({ section: 'Forest', ui: 'slider', min: 3, max: 24, step: 1, label: 'Trees',
            help: 'How many trees populate the scene, scattered across the ground at random '
                + 'depths. More trees read as a denser, deeper forest.' }),
  depth: z.number().int().min(4).max(9).default(7)
    .meta({ section: 'Forest', ui: 'slider', min: 4, max: 9, step: 1, label: 'Branch levels',
            help: 'Recursion depth of each tree — trunk splits into boughs, boughs into twigs. '
                + 'Higher = finer, more intricate crowns (grows exponentially — capped for perf).' }),
  growthSpeed: z.number().min(0.04).max(0.5).default(0.12)
    .meta({ section: 'Forest', ui: 'slider', min: 0.04, max: 0.5, step: 0.01, label: 'Growth speed',
            help: 'Fraction of full height the trees grow per second. Low = a slow, meditative '
                + 'sprout from trunk to twig-tip.' }),

  // ─── Form (the branching) ────────────────────────────────────────────────────
  branchAngle: z.number().min(10).max(45).default(26)
    .meta({ section: 'Form', ui: 'slider', min: 10, max: 45, step: 1, label: 'Branch angle',
            help: 'Degrees each child branch turns away from its parent. Narrow = tall and '
                + 'columnar; wide = broad, spreading crowns.' }),
  angleJitter: z.number().min(0).max(24).default(9)
    .meta({ section: 'Form', ui: 'slider', min: 0, max: 24, step: 0.5, label: 'Wander',
            help: 'Random degrees added at each split, so branches bend and twist organically '
                + 'instead of drawing a rigid fractal. 0 = perfectly geometric.' }),
  splitFactor: z.number().int().min(2).max(3).default(2)
    .meta({ section: 'Form', ui: 'slider', min: 2, max: 3, step: 1, label: 'Branches per fork',
            help: '2 = classic forking tree · 3 = a central leader plus two side branches, '
                + 'giving fuller, bushier crowns.' }),
  lengthDecay: z.number().min(0.6).max(0.82).default(0.72)
    .meta({ section: 'Form', ui: 'slider', min: 0.6, max: 0.82, step: 0.01, label: 'Length taper',
            help: 'How much shorter each deeper branch grows. Lower = a stubby, compact tree; '
                + 'higher = long, reaching limbs.' }),
  taper: z.number().min(0.55).max(0.85).default(0.68)
    .meta({ section: 'Form', ui: 'slider', min: 0.55, max: 0.85, step: 0.01, label: 'Trunk taper',
            help: 'How much each deeper branch thins. Lower = a strong thick-trunk-to-fine-twig '
                + 'taper.' }),
  trunkWidth: z.number().min(2).max(16).default(8)
    .meta({ section: 'Form', ui: 'slider', min: 2, max: 16, step: 0.5, label: 'Trunk width',
            help: 'Thickness of a near tree’s trunk in pixels. Twigs taper thinner from here; '
                + 'far trees scale down proportionally.' }),

  // ─── Foliage ─────────────────────────────────────────────────────────────────
  foliage: z.boolean().default(true)
    .meta({ section: 'Foliage', ui: 'toggle', label: 'Foliage',
            help: 'Draw soft leaf / blossom clusters at the branch tips as they finish growing '
                + '(ignored in the Bare season).' }),
  foliageSize: z.number().min(1).max(12).default(4.5)
    .meta({ section: 'Foliage', ui: 'slider', min: 1, max: 12, step: 0.5, label: 'Foliage size',
            help: 'Radius of the tip leaf clusters on a near tree, in pixels (no effect when '
                + 'Foliage is off).' }),

  // ─── Depth (atmosphere) ──────────────────────────────────────────────────────
  atmosphere: z.number().min(0).max(1).default(0.65)
    .meta({ section: 'Depth', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Atmosphere',
            help: 'How strongly distant trees fade into the haze. Higher = deeper, mistier '
                + 'recession; 0 = every tree equally crisp and saturated.' }),

  // ─── Color ───────────────────────────────────────────────────────────────────
  season: z.enum(['Spring', 'Summer', 'Autumn', 'Winter', 'Bare']).default('Autumn')
    .meta({ section: 'Color', ui: 'segmented',
            options: ['Spring', 'Summer', 'Autumn', 'Winter', 'Bare'], label: 'Season',
            help: 'Sets the bark and foliage palette. Spring: pink blossom · Summer: rich green · '
                + 'Autumn: amber & red · Winter: pale snow-dusted · Bare: bark only, no leaves.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0e0906')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Sky / canvas color. Distant trees fade toward the season haze above it, and '
                + 'the whole grove fades to this when it reseeds.' }),

  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. The same seed regrows the exact same forest. A fresh visit rolls '
                + 'a new one.' }),
})

export type ForestConfig = z.infer<typeof forestSchema>
