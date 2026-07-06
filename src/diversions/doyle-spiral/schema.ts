import { z } from 'zod'

// Doyle spiral — a hexagonal packing of mutually-tangent circles whose radii
// scale geometrically, forming logarithmic-spiral arms that flow forever in a
// seamless loxodromic zoom. One schema drives the form, the URL codec, and the
// Config type. Presets (Spiral / Look / Motion) live in presets.ts.
const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const doyleSchema = z.object({
  // ─── Structure ───────────────────────────────────────────────────────────────
  // ★ hero knobs. q ("Arms") = spiral density (higher → finer, more circles per
  // turn); p ("Twist") winds the arms. Kept in the dense regime (q≥6) where the
  // packing reads as the classic Doyle spiral; small values blow the circles up.
  q: z.number().int().min(6).max(32).default(20)
    .meta({ section: 'Structure', ui: 'slider', min: 6, max: 32, step: 1, label: 'Arms',
            help: 'How many interlocking spiral arms wind the packing. Higher = a denser, finer '
                + 'spiral with more and smaller circles per turn; lower = bold, open arms of big '
                + 'circles. Regrows the spiral.' }),
  p: z.number().int().min(1).max(20).default(8)
    .meta({ section: 'Structure', ui: 'slider', min: 1, max: 20, step: 1, label: 'Twist',
            help: 'Winds the arms — swept one way for low values, the other for high (kept below '
                + 'Arms). Near half of Arms the spiral opens most; toward the ends it tightens and '
                + 'reverses handedness. Regrows the spiral.' }),
  detail: z.number().int().min(1).max(100).default(60)
    .meta({ section: 'Structure', ui: 'slider', min: 1, max: 100, step: 1, label: 'Detail',
            help: 'How deep toward the core the packing resolves. Low = a few big circles with an '
                + 'empty eye; high = the arms spiral down to ever-finer specks at the centre. '
                + 'Regrows the spiral.' }),

  // ─── Look ─────────────────────────────────────────────────────────────────────
  style: z.enum(['filled', 'rings', 'ink']).default('filled')
    .meta({ section: 'Look', ui: 'segmented', options: ['filled', 'rings', 'ink'], label: 'Style',
            help: 'filled → solid kissing discs · rings → line-art outlines only · ink → single-'
                + 'color silhouette.' }),
  colorBy: z.enum(['radius', 'arm', 'angle']).default('radius')
    .meta({ section: 'Look', ui: 'segmented', options: ['radius', 'arm', 'angle'], label: 'Color by',
            help: 'radius → still concentric color bands the circles flow through as they zoom · '
                + 'arm → each spiral arm a solid hue that sweeps round · angle → a color wheel by '
                + 'direction from centre.' }),
  lineWidth: z.number().min(0.4).max(4).default(1.2)
    .meta({ section: 'Look', ui: 'slider', min: 0.4, max: 4, step: 0.1, label: 'Line width',
            help: 'Stroke thickness for the rings / ink outline styles.' }),
  glow: z.number().min(0).max(1).default(0.3)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Glow',
            help: 'Soft bloom around the circles. 0 = crisp; high = neon / stained glass. '
                + 'Costs a little framerate (the piece moves, so the bloom re-blurs each frame).' }),

  // ─── Color ─────────────────────────────────────────────────────────────────────
  background: hex6.default('#07040c')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Canvas color behind the spiral.' }),
  colors: z.array(hex6).min(1).max(8)
    .default(['#3a1a5e', '#7a2f8f', '#c8781f', '#f0b24a', '#ffe6a8', '#fff7e6'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Palette', min: 1, max: 8,
            help: 'Sampled by the Color-by mode: a smooth ramp across radius / angle, or one hue '
                + 'per arm (cycling).' }),

  // ─── Motion ─────────────────────────────────────────────────────────────────────
  flowSpeed: z.number().min(-0.5).max(0.5).default(0.06)
    .meta({ section: 'Motion', ui: 'slider', min: -0.5, max: 0.5, step: 0.005, label: 'Flow speed',
            help: 'The endless loxodromic zoom — circles are born at the core, grow, and drift out '
                + 'along their arms in a perfectly seamless loop. Positive flows outward, negative '
                + 'inward, 0 freezes. Low = a slow, zen descent.' }),
  rotateSpeed: z.number().min(-0.4).max(0.4).default(0.03)
    .meta({ section: 'Motion', ui: 'slider', min: -0.4, max: 0.4, step: 0.005, label: 'Rotate speed',
            help: 'Extra rigid spin of the whole spiral on top of the flow. 0 = none; negative '
                + 'spins the other way.' }),
})

export type DoyleConfig = z.infer<typeof doyleSchema>
