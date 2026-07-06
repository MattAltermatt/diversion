import { z } from 'zod'

// One Zod object = the single source of truth for the config form, the URL codec,
// AND the Config type. The user's [0..1] sliders are mapped onto safe physics
// ranges inside the sim (see index.ts → deriveParams); the velocity clamp keeps
// even the most extreme combination bounded, so no setting can blow the fluid up.
export const sphFluidSchema = z.object({
  particleCount: z.number().int().min(400).max(3200).default(1800)
    .meta({ section: 'Fluid', ui: 'slider', min: 400, max: 3200, step: 100, label: 'Particles',
            help: 'How many droplets make up the liquid. More = a finer, heavier '
                + 'body (and more work per frame). Changing this re-pours the tank.' }),
  viscosity: z.number().min(0).max(1).default(0.35)
    .meta({ section: 'Fluid', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Viscosity',
            help: 'Thickness. Low = runny and splashy like water; high = syrupy, '
                + 'the surface wobbles slowly and settles like honey.' }),
  stiffness: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Fluid', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Stiffness',
            help: 'How hard the liquid resists being squashed. Low = soft and '
                + 'squishy; high = crisp, incompressible, more energetic splashes.' }),
  gravity: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Fluid', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Gravity',
            help: 'Pull toward the floor. Higher = the pool slams down harder and '
                + 'sloshes faster.' }),
  sloshAmount: z.number().min(0).max(1).default(0.5)
    .meta({ section: 'Slosh', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Slosh amount',
            help: 'How far the tank tips side to side. 0 = a still, level pool; '
                + 'higher tips gravity further so the liquid pours back and forth forever.' }),
  sloshSpeed: z.number().min(0.05).max(3).default(1)
    .meta({ section: 'Slosh', ui: 'slider', min: 0.05, max: 3, step: 0.05, label: 'Slosh speed',
            help: 'How quickly the tank rocks. Slow = long, hypnotic waves; '
                + 'fast = choppy sloshing.' }),
  renderMode: z.enum(['liquid', 'particles']).default('liquid')
    .meta({ section: 'Look', ui: 'segmented', options: ['liquid', 'particles'], label: 'Render',
            help: 'liquid: a cohesive glossy surface (metaball iso-surface). '
                + 'particles: soft glowing droplets you can see individually.' }),
  colorBy: z.enum(['depth', 'speed']).default('depth')
    .meta({ section: 'Look', ui: 'segmented', options: ['depth', 'speed'], label: 'Color by',
            help: 'depth: deep body vs. bright surface. speed: fast-moving splashes '
                + 'light up while the calm pool stays deep.' }),
  fluidColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1b6ef3')
    .meta({ section: 'Look', ui: 'color', label: 'Fluid',
            help: 'The deep body color of the liquid.' }),
  surfaceColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8fe9ff')
    .meta({ section: 'Look', ui: 'color', label: 'Surface',
            help: 'Bright highlight on the surface / fast splashes — pick something '
                + 'much lighter than Fluid for a glossy sheen.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070d')
    .meta({ section: 'Look', ui: 'color', label: 'Background',
            help: 'The empty tank behind the liquid. Keep it dark for contrast.' }),
  seed: z.number().int().default(4218)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed always re-pours the same tank. A fresh '
                + 'visit rolls a new one.' }),
})

export type SphFluidConfig = z.infer<typeof sphFluidSchema>
