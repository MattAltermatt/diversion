import { z } from 'zod'

const hex6 = z.string().regex(/^#[0-9a-fA-F]{6}$/)

// Pinion (xscreensaver `pinion` / `gears`, GH #113). A connected train of meshing
// gears grown deterministically from the seed: each new gear meshes with an existing
// one — its centre sits at the SUM of the two pitch radii, its tooth count sets the
// gear ratio, and its phase is solved so a tooth of one drops into a gap of the other.
// Meshing gears turn in OPPOSITE directions with angular speeds inversely proportional
// to tooth count (ω₁·T₁ = −ω₂·T₂), so the whole clockwork stays in perfect mesh
// forever. Brass / jewel / steel wheels of many sizes fill the screen. Calm defaults.
export const pinionSchema = z.object({
  // ── Gears ──
  gearCount: z.number().int().min(3).max(40).default(15)
    .meta({ section: 'Gears', ui: 'slider', min: 3, max: 40, step: 1, label: 'Gears',
            help: 'How many gears the train grows to. Each new gear meshes with one already placed, so the whole cluster is one connected, in-mesh mechanism. More gears pack the screen denser (and each reads smaller).' }),
  teethMin: z.number().int().min(6).max(60).default(9)
    .meta({ section: 'Gears', ui: 'slider', min: 6, max: 60, step: 1, label: 'Teeth — fewest',
            help: 'Lower bound on a gear\'s tooth count. Tooth count sets pitch radius (all gears share one module / tooth size), so this is the smallest wheel. Widen the gap to fewest↔most for a mechanism of visibly mixed sizes.' }),
  teethMax: z.number().int().min(6).max(60).default(26)
    .meta({ section: 'Gears', ui: 'slider', min: 6, max: 60, step: 1, label: 'Teeth — most',
            help: 'Upper bound on a gear\'s tooth count — the largest wheel. Big gears turn slowly and drive many small fast ones.' }),
  layout: z.enum(['chain', 'cluster', 'ring']).default('cluster')
    .meta({ section: 'Gears', ui: 'segmented', options: ['chain', 'cluster', 'ring'], label: 'Layout',
            help: 'Chain: a meandering train that snakes across the screen. Cluster: a dense packed field budding in every direction. Ring: a big sun gear ringed by planet gears, extra wheels budding off the planets.' }),
  fill: z.number().min(0.5).max(0.98).default(0.9)
    .meta({ section: 'Gears', ui: 'slider', min: 0.5, max: 0.98, step: 0.01, label: 'Fill',
            help: 'Fraction of the screen the whole mechanism fills — the effective zoom / gear size. The layout is generated once and re-fitted on resize, so this is how large the wheels read.' }),

  // ── Motion ──
  driveSpeed: z.number().min(0).max(2).default(0.45)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 2, step: 0.01, label: 'Drive speed',
            help: 'Rotation of the root gear, radians per second. Every other gear\'s speed is derived from it by the mesh ratio (small gears spin faster). 0 = frozen clockwork. Calm and slow reads best.' }),

  // ── Look ──
  style: z.enum(['brass', 'solid', 'line']).default('brass')
    .meta({ section: 'Look', ui: 'segmented', options: ['brass', 'solid', 'line'], label: 'Style',
            help: 'Brass: metallic shaded wheels with a highlight rim (steampunk). Solid: flat filled colour wheels with a dark outline. Line: blueprint line-art — outlines, hubs and spokes only.' }),
  toothDepth: z.number().min(0.5).max(1.15).default(1)
    .meta({ section: 'Look', ui: 'slider', min: 0.5, max: 1.15, step: 0.01, label: 'Tooth depth',
            help: 'How far the teeth stand out from the wheel (cosmetic — the mesh spacing is fixed by the module). 1 draws teeth at full height so neighbours visibly interlock; lower flattens toward a smooth disc.' }),

  // ── Color ──
  palette: z.enum(['brass', 'copper', 'jewel', 'steel', 'spectrum']).default('brass')
    .meta({ section: 'Color', ui: 'segmented', options: ['brass', 'copper', 'jewel', 'steel', 'spectrum'], label: 'Palette',
            help: 'Colour family cycled across the gears. Brass / copper / steel are metallic; jewel is saturated gem tones; spectrum sweeps the colour wheel by gear.' }),
  background: hex6.default('#0f0d0a')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The ground the gears sit on, painted every frame. A dark warm ground reads the metallic wheels best.' }),

  // ── Advanced ──
  seed: z.number().int().default(113)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed grows the same gear train — counts, sizes, positions and directions — every run. A fresh visit rolls a new one; add ?seed=N to pin an exact mechanism.' }),
})

export type PinionConfig = z.infer<typeof pinionSchema>
