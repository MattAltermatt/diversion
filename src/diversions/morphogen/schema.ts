import { z } from 'zod'

// ── Defaults ──
// The hero (default) look is the distinct territory map, so the default ramp is a
// dark→light neutral that shades territory interiors well (the literal French-flag
// tricolor is one preset click away). Territory hues = a butterfly-wing palette.
// Both are colorList → they drive the form + URL codec for free (6-hex = opaque).
const RAMP = ['#0a0612', '#3b1d6e', '#e8d9ff']
const TERRITORY_HUES = ['#ffb300', '#ff4d6d', '#3ad1ff', '#7b2ff7']

export const morphogenSchema = z.object({
  // ── Simulation ──
  simSpeed: z.number().min(1).max(32).default(8)
    .meta({ section: 'Simulation', ui: 'slider', min: 1, max: 32, step: 1, label: 'Sim speed',
      help: 'Chemistry sub-steps per frame. Higher resolves the gradient into territories '
          + 'faster; the body plan then drifts and reorganizes on its own.' }),
  gridResolution: z.number().int().min(48).max(192).default(96)
    .meta({ section: 'Simulation', ui: 'slider', min: 48, max: 192, step: 8, label: 'Field detail',
      help: 'Size of the chemical grid. The smooth gradient upscales cleanly to any screen, '
          + 'so a small grid stays crisp — smaller also resolves faster and spreads broader.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
      help: 'Any integer — fixes the source placement and drift. A shared link is seedless, '
          + 'so every fresh visit grows a different body plan.' }),

  // ── Morphogen (the gradient) ──
  sourceLayout: z.enum(['scatter', 'poles', 'point', 'edge', 'triad']).default('scatter')
    // Select renders FROM meta.options — with none declared the dropdown was empty
    // and the controlled value unreachable (#304). Values mirror the enum exactly;
    // only the visible labels are title-cased, matching how the help text names them.
    .meta({ section: 'Morphogen', ui: 'select', label: 'Sources',
      options: [
        { value: 'scatter', label: 'Scatter' },
        { value: 'poles', label: 'Poles' },
        { value: 'point', label: 'Point' },
        { value: 'edge', label: 'Edge' },
        { value: 'triad', label: 'Triad' },
      ],
      help: 'Where chemical is emitted. Scatter = organic territory map · Poles = two '
          + 'opposing sources (a scale-invariant French flag) · Point = concentric rings · '
          + 'Edge = stripes down a gradient · Triad = three merged sources.' }),
  morphogenCount: z.number().int().min(1).max(4).default(4)
    .meta({ section: 'Morphogen', ui: 'slider', min: 1, max: 4, step: 1, label: 'Chemicals',
      help: 'How many distinct morphogens compete for territory. More = richer coat maps '
          + '(each chemical claims the region where it is strongest).' }),
  sourceCount: z.number().int().min(2).max(12).default(6)
    .meta({ section: 'Morphogen', ui: 'slider', min: 2, max: 12, step: 1, label: 'Source count',
      help: 'Number of emitters spread across the chemicals (Scatter layout).',
      showWhen: { field: 'sourceLayout', equals: 'scatter' } }),
  gradientReach: z.number().min(0.2).max(1.5).default(0.6)
    .meta({ section: 'Morphogen', ui: 'slider', min: 0.2, max: 1.5, step: 0.05, label: 'Gradient reach',
      help: 'How far each chemical spreads before it fades, as a fraction of the screen. '
          + 'Larger = broader, gentler gradients spanning more of the field.' }),

  // ── Fate ──
  fateMode: z.enum(['territories', 'bands']).default('territories')
    .meta({ section: 'Fate', ui: 'select', label: 'Fate rule',
      options: [
        { value: 'territories', label: 'Territories' },
        { value: 'bands', label: 'Bands' },
      ],
      help: 'Territories = each pixel takes the fate of its strongest local chemical '
          + '(a cell-fate map with negotiating borders). Bands = threshold one gradient '
          + 'into stacked territories (the classic French flag / rings / stripes).' }),
  bands: z.number().int().min(2).max(6).default(3)
    .meta({ section: 'Fate', ui: 'slider', min: 2, max: 6, step: 1, label: 'Territories',
      help: 'How many fates the gradient is carved into. 3 = the classic French flag.',
      showWhen: { field: 'fateMode', equals: 'bands' } }),
  banding: z.number().min(0).max(1).default(0.9)
    .meta({ section: 'Fate', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Fate sharpness',
      help: '0 shows the raw smooth gradient; 1 snaps it into crisp territories. Slide it to '
          + 'watch positional information become discrete fate.',
      showWhen: { field: 'fateMode', equals: 'bands' } }),
  territoryMix: z.number().min(0).max(1).default(0.65)
    .meta({ section: 'Fate', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Hue separation',
      help: '0 = every territory shares one color ramp (rings / eyespots) · 1 = each '
          + 'territory gets its own distinct hue (leopard coat).',
      showWhen: { field: 'fateMode', equals: 'territories' } }),
  edgeStrength: z.number().min(0).max(1).default(0.4)
    .meta({ section: 'Fate', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Border outline',
      help: 'A thin dark line drawn between territories / bands — the biggest "this is a map" cue.' }),
  gradientUnderlay: z.number().min(0).max(0.5).default(0.15)
    .meta({ section: 'Fate', ui: 'slider', min: 0, max: 0.5, step: 0.01, label: 'Gradient underlay',
      help: 'Keeps a faint sense of the underlying gradient visible inside each flat band.',
      showWhen: { field: 'fateMode', equals: 'bands' } }),

  // ── Advanced ──
  reactionCoupling: z.number().min(0).max(1).default(0)
    .meta({ section: 'Advanced', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Edge sharpening',
      help: 'Adds a little gene-like self-reinforcement that snaps and wiggles band edges '
          + '(organic giraffe cracks). 0 keeps the field a pure diffusion gradient — the '
          + 'honest textbook mechanism. It sharpens edges but never invents new spots.' }),
  bandGamma: z.number().min(0.5).max(2).default(1)
    .meta({ section: 'Advanced', ui: 'slider', min: 0.5, max: 2, step: 0.05, label: 'Band spacing',
      help: 'Reshapes the concentration→shade curve — below 1 widens the near-source bands '
          + '(and brightens territory interiors), above 1 widens the far ones (exp rings '
          + 'naturally thin outward).' }),

  // ── Motion ──
  driftSpeed: z.number().min(0).max(3).default(1)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 3, step: 0.05, label: 'Drift',
      help: 'How fast the sources wander. 0 freezes the body plan; higher makes territories '
          + 'continuously glide, rescale and re-partition.' }),
  reorganize: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Reorganize',
      help: 'How often a source fades away and a new one buds elsewhere — the visible '
          + '"the body plan just reorganized" events. 0 = a fixed cast of sources.' }),

  // ── Color ──
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(RAMP)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Band ramp',
      help: 'The gradient / band colors, low concentration → high — used by Bands mode and '
          + 'to shade the territory interiors. The French Flag palette is a preset.' }),
  territoryColors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(6).default(TERRITORY_HUES)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 6, label: 'Territory hues',
      help: 'One hue per chemical territory (leopard mode). Colors beyond the chemical count '
          + 'are ignored.' }),
})

export type MorphogenConfig = z.infer<typeof morphogenSchema>
