import { z } from 'zod'

// Differential growth: a closed self-avoiding polyline that buckles into
// brain-coral folds. One schema drives the form, the URL codec, and the type.
// Two preset axes (Growth = sim feel, Style = render+palette) live in presets.ts.
export const differentialGrowthSchema = z.object({
  // ─── The Growth (simulation) ───────────────────────────────────────────────
  // ★ hero knob: repulsionRadius / splitLength is the fold lever. Below ~2× the
  // curve only feels its chain-neighbors and inflates into a smooth balloon;
  // long-range repulsion between non-adjacent strands is what forces the folds.
  repulsionRadius: z.number().min(6).max(60).default(22)
    .meta({ section: 'The Growth', ui: 'slider', min: 6, max: 60, step: 1, label: 'Fold spacing',
            help: 'Wrinkle wavelength — how far apart separate folds sit. The single biggest lever. '
                + 'Keep it comfortably above the split length (≈2–3×) or the curve just inflates '
                + 'into a smooth blob instead of folding.' }),
  splitLength: z.number().min(4).max(20).default(9)
    .meta({ section: 'The Growth', ui: 'slider', min: 4, max: 20, step: 0.5, label: 'Detail (split length)',
            help: 'Longest an edge grows before a new node is inserted. Smaller = finer, more '
                + 'intricate curve; larger = coarser, chunkier folds.' }),
  speed: z.number().min(5).max(120).default(40)
    .meta({ section: 'The Growth', ui: 'slider', min: 5, max: 120, step: 1, label: 'Speed',
            help: 'Growth / relaxation sub-steps per second. Frame-rate independent. '
                + 'Low = zen slow unfurl; high = it develops (and resets) faster.' }),
  repulsionStrength: z.number().min(0).max(1).default(0.55)
    .meta({ section: 'The Growth', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Repulsion',
            help: 'How hard separate folds push each other apart. Higher folds tighter.' }),
  attractionStrength: z.number().min(0).max(1).default(0.45)
    .meta({ section: 'The Growth', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Attraction',
            help: 'How tightly the curve holds itself together (keeps even spacing).' }),
  alignment: z.number().min(0).max(0.5).default(0.12)
    .meta({ section: 'The Growth', ui: 'slider', min: 0, max: 0.5, step: 0.01, label: 'Smoothing',
            help: 'Eases each node toward its neighbors. Higher rounds the folds smooth; '
                + 'lower keeps them crinkly. Too high rounds everything back to a circle.' }),
  growthBias: z.number().min(0).max(1).default(0.2)
    .meta({ section: 'The Growth', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Organic bias',
            help: 'Extra node injection at the most-curved spots, amplifying existing bumps into '
                + 'irregular, intestinal asymmetry. 0 = even, uniform folds.' }),
  maxNodes: z.number().int().min(200).max(6000).default(2500)
    .meta({ section: 'The Growth', ui: 'slider', min: 200, max: 6000, step: 100, label: 'Complexity cap',
            help: 'Node ceiling. Growth stops here and the curve keeps gently breathing, then '
                + 'the piece fades and re-grows a fresh world.' }),

  // ─── Render ────────────────────────────────────────────────────────────────
  renderStyle: z.enum(['line', 'fill', 'fillEdge', 'membrane']).default('line')
    .meta({ section: 'Render', ui: 'segmented', options: ['line', 'fill', 'fillEdge', 'membrane'],
            label: 'Style',
            help: 'line: the self-avoiding curve as a drawn line · fill: solid filled shape · '
                + 'fillEdge: filled with a bright rim · membrane: filled with soft inner volume.' }),
  smoothing: z.boolean().default(true)
    .meta({ section: 'Render', ui: 'toggle', label: 'Smooth curve',
            help: 'Round the curve through segment midpoints. Off = faceted, woodcut look.' }),
  lineWidth: z.number().min(0.5).max(3).default(1.25)
    .meta({ section: 'Render', ui: 'slider', min: 0.5, max: 3, step: 0.05, label: 'Line width',
            help: 'Stroke thickness in pixels. Thin keeps dense folds legible.' }),
  glow: z.number().min(0).max(1).default(0.4)
    .meta({ section: 'Render', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Glow',
            help: 'Soft bloom around the line. 0 = crisp, no glow. High glow costs framerate at '
                + 'large node counts.' }),
  history: z.number().min(0).max(1).default(0.85)
    .meta({ section: 'Render', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Persistence',
            help: 'How long past frames linger. 1 = live curve only (clean) · ~0.85 = trailing '
                + 'ghost · 0 = accumulate, growth silts into layered topographic strata.' }),

  // ─── Color ───────────────────────────────────────────────────────────────
  colorMode: z.enum(['ink', 'age', 'sweep', 'curvature', 'depth']).default('age')
    .meta({ section: 'Color', ui: 'segmented', options: ['ink', 'age', 'sweep', 'curvature', 'depth'],
            label: 'Color by',
            help: 'ink: one color · age: growth front glows (newest nodes brightest) · '
                + 'sweep: palette cycled around the curve (marbling) · curvature: tight folds pop · '
                + 'depth: distance from the center.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#04060a')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Canvas / fade color. Trails fade toward this.' }),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(8)
    .default(['#0e3b32', '#1f9e6b', '#5ff0c8', '#eafff8'])
    .meta({ section: 'Color', ui: 'colorList', label: 'Palette', min: 1, max: 8,
            help: 'Ordered oldest → youngest. In "age" mode the last color is the freshly-grown '
                + 'front; "ink" uses the last color; "sweep" cycles the whole list around the curve.' }),

  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. Same seed regrows the same world. A fresh visit rolls a new one.' }),
})

export type DifferentialGrowthConfig = z.infer<typeof differentialGrowthSchema>
