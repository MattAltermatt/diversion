import { z } from 'zod'

// Canopy — phototropic plants racing for light. Branching L-system plants, each
// parameterized by evolvable genes (chiefly a HEIGHT gene), compete for sunlight
// that rains from the top and is occluded by whatever grows above. A plant's energy
// is the light its leaves catch minus a height-squared maintenance cost; energy buys
// growth and, at maturity, mutated seeds. A shaded plant starves and dies, a gap
// opens, and a fast low seedling scrambles up — a real biological arms race made
// visible (leaves glow with the light they capture).

export const canopySchema = z.object({
  maxPlants: z.number().int().min(20).max(160).default(80)
    .meta({ section: 'Forest', ui: 'slider', min: 20, max: 160, step: 5, label: 'Max plants',
            help: 'Population ceiling. The forest fills to here, then turnover keeps it churning.' }),
  seedSpread: z.number().min(20).max(240).default(90)
    .meta({ section: 'Forest', ui: 'slider', min: 20, max: 240, step: 5, label: 'Seed spread',
            help: 'How far a seed lands from its parent, in pixels. Wider = faster colonization of gaps.' }),
  sunlight: z.number().min(0.4).max(1).default(1)
    .meta({ section: 'Forest', ui: 'slider', min: 0.4, max: 1, step: 0.05, label: 'Sunlight',
            help: 'Light arriving at the top of the frame. Less sun = a sparser, slower forest.' }),

  growthSpeed: z.number().min(0.2).max(3).default(1)
    .meta({ section: 'Growth', ui: 'slider', min: 0.2, max: 3, step: 0.1, label: 'Growth speed',
            help: 'How fast plants grow and the whole succession turns over.' }),
  heightCost: z.number().min(0.2).max(3).default(1)
    .meta({ section: 'Growth', ui: 'slider', min: 0.2, max: 3, step: 0.1, label: 'Height cost',
            help: 'Maintenance penalty for being tall (grows with height²). This is what reins the '
                + 'arms race in: low cost → runaway giants; high cost → a short, stable turf.' }),
  mutationRate: z.number().min(0).max(0.4).default(0.12)
    .meta({ section: 'Growth', ui: 'slider', min: 0, max: 0.4, step: 0.01, label: 'Mutation',
            help: 'How much a seedling’s genes drift from its parent. Drives the evolution.' }),

  branchAngle: z.number().min(0.2).max(1).default(0.5)
    .meta({ section: 'Shape', ui: 'slider', min: 0.2, max: 1, step: 0.02, label: 'Branch spread',
            help: 'Base angle between a branch and its children (radians). Wider = bushier crowns.' }),
  leafSize: z.number().min(1).max(6).default(2.6)
    .meta({ section: 'Shape', ui: 'slider', min: 1, max: 6, step: 0.1, label: 'Leaf size',
            help: 'Radius of each leaf, in pixels.' }),
  lightShafts: z.boolean().default(true)
    .meta({ section: 'Shape', ui: 'toggle', label: 'Light shafts',
            help: 'On: soft sun rays fall through the gaps in the canopy.' }),

  color: z.object({
    skyTop: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a1420')
      .meta({ ui: 'color', label: 'Sky (top)' }),
    skyBottom: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05080c')
      .meta({ ui: 'color', label: 'Sky (ground)' }),
    trunk: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3a2a1c')
      .meta({ ui: 'color', label: 'Wood' }),
    leafShade: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#123a24')
      .meta({ ui: 'color', label: 'Leaf (shaded)' }),
    leafSun: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#b6f05a')
      .meta({ ui: 'color', label: 'Leaf (sunlit)',
              help: 'Leaves are tinted between shaded and sunlit by how much light they catch.' }),
  }).default({ skyTop: '#0a1420', skyBottom: '#05080c', trunk: '#3a2a1c', leafShade: '#123a24', leafSun: '#b6f05a' })
    .meta({ section: 'Color', ui: 'group', label: 'Palette' }),

  showHud: z.boolean().default(true)
    .meta({ section: 'HUD', ui: 'toggle', label: 'Show readout',
            help: 'Overlay live tree count and mean canopy height.' }),

  simSpeed: z.number().min(1).max(60).default(30)
    .meta({ section: 'Sim', ui: 'slider', min: 1, max: 60, step: 1, label: 'Sim speed',
            help: 'Simulation steps per second.' }),

  seed: z.number().int().default(17)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. The same seed reproduces the same forest. A fresh visit rolls a new one.' }),
})

export type CanopyConfig = z.infer<typeof canopySchema>
