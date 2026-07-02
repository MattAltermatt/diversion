import { z } from 'zod'

export const gravityWellsSchema = z.object({
  particles: z.number().int().min(100).max(20000).default(10600)
    .meta({ section: 'Particles', ui: 'slider', min: 100, max: 20000, step: 100, label: 'Particles',
            help: 'How many drifting test particles. More = denser orbits.' }),
  particleSize: z.number().min(0.3).max(5).default(1.6)
    .meta({ section: 'Particles', ui: 'slider', min: 0.3, max: 5, step: 0.1, label: 'Particle size',
            help: 'Thickness of each particle stroke, in pixels.' }),
  noiseScale: z.number().min(0.0004).max(0.01).default(0.0016)
    .meta({ section: 'The Flow', ui: 'slider', min: 0.0004, max: 0.01, step: 0.0001, label: 'Flow scale',
            help: 'Feature size of the base flow. Lower = broad sweeping currents; '
                + 'higher = tight, turbulent detail.' }),
  fieldDrift: z.number().min(0).max(1).default(0.35)
    .meta({ section: 'The Flow', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Flow drift',
            help: 'How fast the base flow slowly morphs over time. 0 = frozen flow.' }),
  gravityInfluence: z.number().min(0).max(2).default(1.6)
    .meta({ section: 'Gravity Wells', ui: 'slider', min: 0, max: 2, step: 0.05, label: 'Gravity influence',
            help: 'How strongly the gravity fields drive the flow. 0 = pure flow field '
                + '(faint base current only); higher = the wells dominate the whole field.' }),
  swirl: z.number().min(0).max(1).default(1)
    .meta({ section: 'Gravity Wells', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Swirl',
            help: 'How each field curves the flow around itself vs straight in/out. '
                + '0 = pure drain/fountain (flow sinks into attractors); '
                + '1 = pure whirlpool (flow orbits around them).' }),
  speed: z.number().min(0).max(3).default(0.2)
    .meta({ section: 'The Flow', ui: 'slider', min: 0, max: 3, step: 0.05, label: 'Speed',
            help: 'Flow speed. 0 freezes motion.' }),
  maxWells: z.number().int().min(1).max(12).default(5)
    .meta({ section: 'Gravity Wells', ui: 'slider', min: 1, max: 12, step: 1, label: 'Max gravity fields',
            help: 'The most gravity fields active at once. New ones appear as old ones expire.' }),
  wellLifespan: z.number().min(1).max(60).default(60)
    .meta({ section: 'Gravity Wells', ui: 'slider', min: 1, max: 60, step: 0.5, label: 'Field lifespan',
            help: 'Seconds each gravity field lasts. Over its life its pull ramps from the '
                + 'force floor up to the peak and back down. New ones appear as old ones expire.' }),
  forceMin: z.number().min(0).max(2).default(0.1)
    .meta({ section: 'Gravity Wells', ui: 'slider', min: 0, max: 2, step: 0.1, label: 'Force floor',
            help: 'Each field’s pull at the start and end of its life. It ramps from here up '
                + 'to the peak at mid-life, then back down. Set low for a gentle fade in/out.' }),
  forceMax: z.number().min(0).max(2).default(1.5)
    .meta({ section: 'Gravity Wells', ui: 'slider', min: 0, max: 2, step: 0.1, label: 'Force peak',
            help: 'The strongest each field pulls, reached at the middle of its life. '
                + 'All fields attract (pull in) — none repel.' }),
  fadeTrails: z.boolean().default(true)
    .meta({ section: 'Trails', ui: 'toggle', label: 'Motion trails',
            help: 'On: particles leave trails that fade out. Off: each frame is wiped clean.' }),
  trailLength: z.number().min(0).max(100).default(95)
    .meta({ section: 'Trails', ui: 'slider', min: 0, max: 100, step: 1, label: 'Trail length',
            help: 'How long trails persist before fading. Higher = longer orbital ribbons.' }),
  blend: z.enum(['lighten', 'screen', 'normal']).default('lighten')
    .meta({ section: 'Trails', ui: 'segmented', options: ['lighten', 'screen', 'normal'], label: 'Blend',
            help: 'How overlapping trails combine:\n'
                + '- lighten (default): colored glow that keeps its hue — no white-out\n'
                + '- screen: glows and mixes; dense areas wash to white\n'
                + '- normal: each particle’s true color' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05060f')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Trails fade toward this colour.' }),
  color: z.object({
    mode: z.enum(['palette', 'gradient']).default('palette')
      .meta({ ui: 'segmented', options: ['palette', 'gradient'], label: 'Color mode',
              help: 'Palette: each particle keeps one random color from the list. '
                  + 'Gradient: color is sampled along a source — flow direction, '
                  + 'field strength, or screen position.' }),
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(8)
      .default(['#3bd2ffaa', '#4d9bffaa', '#ffd23baa', '#ff7a3baa'])
      .meta({ ui: 'colorList', label: 'Colors', min: 1, max: 8,
              showWhen: { field: 'mode', equals: 'palette' },
              help: 'Each particle picks one color at random when it spawns and keeps it for life. '
                  + 'Per-color alpha controls how fast trails build up.' }),
    source: z.enum(['flow-angle', 'field', 'x', 'y']).default('flow-angle')
      .meta({ ui: 'segmented', options: ['flow-angle', 'field', 'x', 'y'], label: 'Gradient source',
              showWhen: { field: 'mode', equals: 'gradient' },
              help: 'What maps onto the gradient: flow-angle (current direction — cyclic), '
                  + 'field (gravity bend strength — particles near wells flare), '
                  + 'or x / y screen position.' }),
    stops: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(8)
      .default(['#1b3a8aaa', '#3bd2ffaa', '#ffd23baa', '#ff3b3baa'])
      .meta({ ui: 'colorList', label: 'Gradient stops', min: 2, max: 8,
              showWhen: { field: 'mode', equals: 'gradient' },
              help: 'Colors are evenly spaced and sampled along the source; per-stop alpha '
                  + 'controls trail buildup.' }),
  }).default({
    mode: 'palette',
    colors: ['#3bd2ffaa', '#4d9bffaa', '#ffd23baa', '#ff7a3baa'],
    source: 'flow-angle',
    stops: ['#1b3a8aaa', '#3bd2ffaa', '#ffd23baa', '#ff3b3baa'],
  }).meta({ section: 'Color', ui: 'group', label: 'Palette / Gradient' }),
  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed regenerates the same initial layout and overall character. A fresh visit rolls a new one.' }),
})

export type GravityWellsConfig = z.infer<typeof gravityWellsSchema>
