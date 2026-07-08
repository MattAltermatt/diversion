import { z } from 'zod'
import { PLATONIC_SOLIDS } from './geometry'

// Platonic Folding — a Platonic solid's flattened net folds itself shut into the solid,
// turns in the light, then unfolds flat again. One Zod object is the single source of
// truth for the config form, the URL codec, and the Config type.
const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

const SOLID_OPTIONS = [...PLATONIC_SOLIDS, 'cycle'] as const

export const platonicFoldingSchema = z.object({
  // ─── Shape ───────────────────────────────────────────────────────────────────
  solid: z.enum(SOLID_OPTIONS).default('cycle')
    .meta({ section: 'Shape', ui: 'segmented', options: [...SOLID_OPTIONS], label: 'Solid',
      help: "Pin one Platonic solid, or 'cycle' to tour all five in turn — tetrahedron → cube → "
          + 'octahedron → dodecahedron → icosahedron — each time the loop unfolds.' }),
  renderMode: z.enum(['filled', 'wire']).default('filled')
    .meta({ section: 'Shape', ui: 'segmented', options: ['filled', 'wire'], label: 'Render',
      help: 'Filled: lit opaque faces with crisp edges — the fold reads as paper catching the '
          + 'light. Wire: a clean glowing wireframe, faces left transparent.' }),

  // ─── Motion ──────────────────────────────────────────────────────────────────
  foldDuration: z.number().min(1).max(8).default(3)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 8, step: 0.1, label: 'Fold duration',
      help: 'Seconds the net takes to fold shut (and, symmetrically, to unfold flat again). Low '
          + 'is a snappy origami snap; high is a slow, deliberate unfurl.' }),
  holdDuration: z.number().min(1).max(15).default(5)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 15, step: 0.5, label: 'Hold time',
      help: 'Seconds the fully-folded solid spends turning in place before it unfolds again.' }),
  rotationSpeed: z.number().min(0).max(1.5).default(0.4)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1.5, step: 0.01, label: 'Rotation speed',
      help: 'How fast the assembled solid tumbles (radians/second) during its hold. 0 = it sits '
          + 'still and just catches the light from one angle.' }),

  // ─── Style ───────────────────────────────────────────────────────────────────
  lineWidth: z.number().min(0.5).max(4).default(1.6)
    .meta({ section: 'Style', ui: 'slider', min: 0.5, max: 4, step: 0.1, label: 'Edge width',
      help: 'Thickness of the crisp edge stroke around each face (filled mode) or each wire '
          + '(wire mode).' }),
  glow: z.number().min(0).max(0.6).default(0.18)
    .meta({ section: 'Style', ui: 'slider', min: 0, max: 0.6, step: 0.01, label: 'Glow',
      help: 'Soft halo under each edge. 0 = plain hairlines; higher gives the fold a luminous, '
          + 'stained-glass edge.' }),

  // ─── Color ───────────────────────────────────────────────────────────────────
  background: hex6.default('#06070c')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
      help: 'The dark ground the solid folds against. Keep it dark for contrast.' }),
  palette: z.array(hex6).min(1).max(8)
    .default(['#ff6b6b', '#ffd166', '#06d6a0', '#118ab2', '#a06cd5'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Palette', min: 1, max: 8,
      help: "Face colors, assigned by each face's distance from the net's root face — cycling "
          + "if there are more faces than colors — so the fold reads as concentric color bands." }),
  lightContrast: z.number().min(0).max(1).default(0.7)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Light contrast',
      help: "How strongly each face's shade responds to a fixed key light as it turns. 0 = flat "
          + 'palette colors; 1 = dramatic — faces flash bright as they catch the light mid-fold.' }),

  // ─── Advanced ────────────────────────────────────────────────────────────────
  seed: z.number().int().default(1729)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed',
      randomizeOnFreshLoad: true,
      help: 'Any integer. Picks the starting solid (in cycle mode), which faces hinge to which '
          + '(the net layout), and the tumble direction. A fresh visit rolls a new one.' }),
})

export type PlatonicFoldingConfig = z.infer<typeof platonicFoldingSchema>
