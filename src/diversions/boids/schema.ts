// schema.ts — single source of truth (form + URL codec + Config type). Reynolds
// flocking: separation/alignment/cohesion weights + perception radius + speed are
// the whole mechanism; edgeMode picks toroidal wrap vs a margin steer-back. Units
// are world coordinates in the fixed 760×460 virtual world (sim.ts WORLD_W/WORLD_H).
import { z } from 'zod'

export const EDGE_MODES = ['wrap', 'steer'] as const

export const boidsSchema = z.object({
  count: z.number().int().min(50).max(2000).default(400)
    .meta({ section: 'Flock', ui: 'slider', min: 50, max: 2000, step: 10, label: 'Boids',
            help: 'How many boids flock together. More reads as a denser murmuration but costs more per frame.' }),
  separation: z.number().min(0).max(2).default(1.45)
    .meta({ section: 'Flock', ui: 'slider', min: 0, max: 2, step: 0.05, label: 'Separation',
            help: 'How hard each boid avoids crowding its nearest neighbors. Too low and the flock collapses into a clump; too high and it scatters into a gas.' }),
  alignment: z.number().min(0).max(2).default(1.0)
    .meta({ section: 'Flock', ui: 'slider', min: 0, max: 2, step: 0.05, label: 'Alignment',
            help: "How hard each boid matches its neighbors' heading. This is what makes the flock fly as one body instead of a swarm of independent points." }),
  cohesion: z.number().min(0).max(2).default(0.55)
    .meta({ section: 'Flock', ui: 'slider', min: 0, max: 2, step: 0.05, label: 'Cohesion',
            help: 'How hard each boid steers toward the center of its nearby neighbors. Keeps sub-flocks from drifting apart for good.' }),
  perception: z.number().min(10).max(120).default(36)
    .meta({ section: 'Flock', ui: 'slider', min: 10, max: 120, step: 5, label: 'Perception',
            help: 'How far (world units) each boid can see its neighbors. Bigger radius = bigger, slower-forming flocks; too small and boids barely notice each other.' }),
  maxSpeed: z.number().min(40).max(220).default(95)
    .meta({ section: 'Flock', ui: 'slider', min: 40, max: 220, step: 5, label: 'Max speed',
            help: 'Top cruising speed of a boid, in world units per second.' }),
  edgeMode: z.enum(EDGE_MODES).default('steer')
    .meta({ section: 'Flock', ui: 'segmented', options: EDGE_MODES as unknown as string[], label: 'Edges',
            help: 'Wrap = boids fly off one edge and reappear on the other, an endless sky. Steer = boids gently turn back before they reach the edge.' }),
  predator: z.boolean().default(false)
    .meta({ section: 'Flock', ui: 'toggle', label: 'Predator',
            help: 'Adds one slow-wandering predator the flock scatters away from when it gets close — a gentle scare, not a hunt.' }),
  predatorSpeed: z.number().min(30).max(220).default(70)
    .meta({ section: 'Flock', ui: 'slider', min: 30, max: 220, step: 5, label: 'Predator speed',
            help: 'How fast the predator wanders, when Predator is on.' }),
  boidSize: z.number().min(2).max(14).default(6)
    .meta({ section: 'Look', ui: 'slider', min: 2, max: 14, step: 0.5, label: 'Boid size' }),
  fadeTrails: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Trails',
            help: 'Leave soft fading streaks behind each boid instead of clearing to a crisp frame every tick.' }),
  trailLength: z.number().min(0).max(0.9).default(0.35)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 0.9, step: 0.02, label: 'Trail length',
            help: 'How slowly the previous frame fades, when Trails is on. Higher = longer, dreamier streaks.' }),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(6)
    .default(['#4d7fffcc', '#8f5bffcc', '#d65bffcc', '#ff5ba0cc', '#ffb15bcc'])
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 6, label: 'Palette',
            help: "Boids tint by flight heading across these colors, so a turning flock ripples through the palette like light on feathers." }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#060814')
    .meta({ section: 'Color', ui: 'color', label: 'Background' }),
  seed: z.number().int().default(8271)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer. The same seed + settings always replays the same flock. A fresh visit rolls a new one.' }),
})

export type BoidsConfig = z.infer<typeof boidsSchema>
