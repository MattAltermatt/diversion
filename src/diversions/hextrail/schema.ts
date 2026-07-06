import { z } from 'zod'

// Hextrail: glowing arms grow outward along a hex lattice, branching hex→hex into a
// sparse tree, filling the field, then fading on a slow breath and reseeding. One
// schema drives the form, the URL codec, and the Config type. Two preset axes
// (Palette + Pace) live in presets.ts. After xscreensaver's hextrail by jwz.
export const hextrailSchema = z.object({
  // ─── Lattice ─────────────────────────────────────────────────────────────
  hexSize: z.number().min(12).max(60).default(16)
    .meta({ section: 'Lattice', ui: 'slider', min: 12, max: 60, step: 1, label: 'Hex size',
            help: 'Hexagon radius in pixels — sets lattice density. Bigger = fewer, chunkier '
                + 'cells and a calmer, more legible bloom. Rebuilds the lattice.' }),
  gridOpacity: z.number().min(0).max(0.5).default(0.17)
    .meta({ section: 'Lattice', ui: 'slider', min: 0, max: 0.5, step: 0.01, label: 'Hex grid',
            help: 'Visibility of the underlying hexagon mesh the arms grow across (as in the '
                + 'original). 0 hides it for pure floating trails.' }),

  // ─── Growth ──────────────────────────────────────────────────────────────
  growthSpeed: z.number().min(0.3).max(60).default(1.1)
    .meta({ section: 'Growth', ui: 'slider', min: 0.3, max: 60, step: 0.1, label: 'Growth speed',
            help: 'How fast each arm extends across a cell (frame-rate independent). Drag right '
                + 'down for a very slow, meditative unfurl; high = it fills and resets quickly.' }),
  branchiness: z.number().min(0).max(1).default(0.19)
    .meta({ section: 'Growth', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Branchiness',
            help: 'How eagerly a hex sprouts extra arms beyond one. Higher = bushier, faster-'
                + 'filling web; lower = thin, wandering tendrils.' }),
  maxDoing: z.number().int().min(40).max(800).default(220)
    .meta({ section: 'Growth', ui: 'slider', min: 40, max: 800, step: 10, label: 'Active-arm cap',
            help: 'Ceiling on simultaneously-growing arms — the master calm lever. Lower keeps a '
                + 'thin, meditative wavefront no matter the screen size.' }),
  seeds: z.number().int().min(1).max(6).default(1)
    .meta({ section: 'Growth', ui: 'slider', min: 1, max: 6, step: 1, label: 'Seeds',
            help: 'Simultaneous growth origins. 1 = one coherent bloom; more = colliding fronts.' }),
  fillFraction: z.number().min(0.3).max(1).default(0.9)
    .meta({ section: 'Growth', ui: 'slider', min: 0.3, max: 1, step: 0.05, label: 'Fill before rest',
            help: 'How much of the lattice fills before the field holds, then fades and reseeds.' }),

  // ─── Loop ────────────────────────────────────────────────────────────────
  holdSeconds: z.number().min(0).max(6).default(2)
    .meta({ section: 'Loop', ui: 'slider', min: 0, max: 6, step: 0.5, label: 'Hold',
            help: 'Seconds the finished bloom sits at full fill before dissolving.' }),
  fadeSeconds: z.number().min(1).max(6).default(3)
    .meta({ section: 'Loop', ui: 'slider', min: 1, max: 6, step: 0.5, label: 'Fade',
            help: 'Seconds the whole field takes to dissolve to the background — the exhale.' }),

  // ─── Render ──────────────────────────────────────────────────────────────
  glow: z.number().min(0).max(1).default(0.6)
    .meta({ section: 'Render', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Glow',
            help: 'Soft halo around each arm, tinted to its own color. 0 = crisp lines.' }),
  coreWidth: z.number().min(1).max(4).default(2.5)
    .meta({ section: 'Render', ui: 'slider', min: 1, max: 4, step: 0.1, label: 'Line width',
            help: 'Thickness of the bright core stroke in pixels.' }),

  // ─── Color ───────────────────────────────────────────────────────────────
  colorWrap: z.boolean().default(true)
    .meta({ section: 'Color', ui: 'toggle', label: 'Cyclic color',
            help: 'On = cyclic hue drift that never saturates — color keeps drifting around the '
                + 'palette over the whole spreading tree (jwz-authentic). Off = a ramp that clamps '
                + 'at the last color (the bloom saturates once it reaches the tip stop).' }),
  driftChance: z.number().min(0).max(0.6).default(0.14)
    .meta({ section: 'Color', ui: 'slider', min: 0, max: 0.6, step: 0.01, label: 'Color drift',
            help: 'How fast color moves along the palette as the tree branches — your "spread" '
                + 'control. Lower = the palette stretches slowly across the whole growth; higher = '
                + 'faster hue drift; 0 = one flat color.' }),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(6)
    .default(['#f65b6b', '#f6a24a', '#dfd85a', '#5fd68a', '#4bbce6', '#8a7bf0'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Palette', min: 2, max: 6,
            help: 'The hue loop the bloom drifts around. A smoothly-looping palette (last blends '
                + 'back to first) avoids a hard seam at the wrap.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#060608')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Canvas colour. The field fades toward this on each breath.' }),

  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. Same seed regrows the same sequence. A fresh visit rolls a new one.' }),
})

export type HextrailConfig = z.infer<typeof hextrailSchema>
