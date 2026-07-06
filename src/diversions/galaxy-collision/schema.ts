import { z } from 'zod'

// Warm (galaxy A) and cool (galaxy B) disk ramps. A star's colour is sampled by
// its "coreness" (0 = faint outer disk → 1 = bright core), so order each ramp
// dim-outer → bright-core. 6-hex = opaque (no alpha slider). High contrast (UX #5).
const WARM = ['#2a0d02', '#ff7a1e', '#ffe6b0']
const COOL = ['#04121f', '#2f7bff', '#dbecff']

export const galaxyCollisionSchema = z.object({
  // ── Galaxies ── structural: any change here re-seeds the whole encounter.
  starCount: z.number().int().min(4000).max(24000).default(14000)
    .meta({ section: 'Galaxies', ui: 'slider', min: 4000, max: 24000, step: 1000, label: 'Star count',
            help: 'Total test stars, split evenly between the two galaxies. More = denser '
                + 'disks and richer tidal tails, at some cost to frame rate.' }),
  coreMass: z.number().min(0.3).max(3).default(1)
    .meta({ section: 'Galaxies', ui: 'slider', min: 0.3, max: 3, step: 0.1, label: 'Core mass',
            help: 'Mass of each galactic core (they are equal). Heavier cores pull harder — '
                + 'faster orbits and more violent tides.' }),
  softening: z.number().min(0.04).max(0.4).default(0.12)
    .meta({ section: 'Galaxies', ui: 'slider', min: 0.04, max: 0.4, step: 0.01, label: 'Softening',
            help: 'Smooths gravity near a core so stars do not slingshot to infinity. '
                + 'Lower = sharper, hotter cores; higher = a softer, calmer field.' }),

  // ── Encounter ── structural: initial trajectory of the two cores.
  impactParameter: z.number().min(0).max(2.5).default(0.9)
    .meta({ section: 'Encounter', ui: 'slider', min: 0, max: 2.5, step: 0.05, label: 'Impact parameter',
            help: 'How far off-centre the two cores pass. 0 = a head-on smash; larger = a '
                + 'grazing fly-by that draws out long, graceful tails.' }),
  approachSpeed: z.number().min(0.15).max(1.1).default(0.55)
    .meta({ section: 'Encounter', ui: 'slider', min: 0.15, max: 1.1, step: 0.05, label: 'Approach speed',
            help: 'Closing speed of the two cores. Slow = a bound, looping pass that shreds '
                + 'the disks; fast = a quick hyperbolic punch-through.' }),
  retrograde: z.boolean().default(false)
    .meta({ section: 'Encounter', ui: 'toggle', label: 'Retrograde',
            help: 'Spins the second galaxy against the orbit instead of with it. Prograde '
                + 'spin throws the grandest tails; retrograde makes a stubbier, choppier mess.' }),

  // ── Look ── all live-editable, no re-seed.
  pointSize: z.number().min(0.5).max(4).default(1.6)
    .meta({ section: 'Look', ui: 'slider', min: 0.5, max: 4, step: 0.1, label: 'Star size',
            help: 'Base size of each star in pixels. Bright cores are drawn a little larger.' }),
  trailFade: z.number().min(0).max(0.92).default(0.55)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 0.92, step: 0.02, label: 'Trail persistence',
            help: '0 = crisp stars wiped each frame; higher leaves glowing motion-trails that '
                + 'trace the tidal streams.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#01020a')
    .meta({ section: 'Look', ui: 'color', label: 'Background',
            help: 'Deep-space color behind the stars.' }),

  // ── Color ──
  colorsA: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(5).default(WARM)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 5, label: 'Galaxy A colors',
            help: 'Warm disk. Ordered faint-outer → bright-core; a star is tinted by how '
                + 'central it sits in its disk.' }),
  colorsB: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(5).default(COOL)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 5, label: 'Galaxy B colors',
            help: 'Cool disk. Ordered faint-outer → bright-core, mirroring Galaxy A.' }),

  seed: z.number().int().default(90210)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. The same seed reproduces the same encounter. A fresh visit '
                + 'rolls a new one.' }),
})

export type GalaxyCollisionConfig = z.infer<typeof galaxyCollisionSchema>
