import { z } from 'zod'

// Phantom Traffic — the Nagel–Schreckenberg traffic CA. Each lane is an
// independent 1-D ring of cells; cars accelerate / brake / dawdle / move by four
// trivial rules, and jams nucleate from nowhere and crawl *backward* against the
// flow. The two big aesthetic calls — ring road vs straight highway, and clean
// dots vs long-exposure light-trails — are exposed as knobs rather than picked.

export const phantomTrafficSchema = z.object({
  layout: z.enum(['rings', 'highway']).default('rings')
    .meta({ section: 'Road', ui: 'segmented', options: ['rings', 'highway'], label: 'Layout',
            help: 'Rings: concentric ring-roads, cars orbit and jams rotate backward as arcs. '
                + 'Highway: straight stacked lanes, jams slide backward as red bands — the '
                + 'clearest read of the phenomenon.' }),
  lanes: z.number().int().min(1).max(14).default(7)
    .meta({ section: 'Road', ui: 'slider', min: 1, max: 14, step: 1, label: 'Lanes',
            help: 'Number of independent ring-roads (or stacked highway lanes). Each runs its '
                + 'own traffic, so more lanes = more simultaneous jams to watch.' }),
  roadLength: z.number().int().min(60).max(600).default(260)
    .meta({ section: 'Road', ui: 'slider', min: 60, max: 600, step: 10, label: 'Road length',
            help: 'Cells per lane (outermost ring; inner rings scale down). Longer roads fit more '
                + 'cars and longer jam waves. With the Arcs car style, fewer cells = bigger cells '
                + '= chunkier blocks — drop this to ~90 for the fat Binary-Ring look.' }),
  density: z.number().min(0.02).max(0.6).default(0.16)
    .meta({ section: 'Road', ui: 'slider', min: 0.02, max: 0.6, step: 0.01, label: 'Density',
            help: 'Fraction of the road filled with cars. Below the critical density (~0.1–0.15) '
                + 'traffic flows free; above it, stop-and-go jams spontaneously appear.' }),
  laneDirection: z.enum(['uniform', 'alternate']).default('uniform')
    .meta({ section: 'Road', ui: 'segmented', options: ['uniform', 'alternate'], label: 'Lane direction',
            help: 'Uniform: every lane runs the same way. Alternate: neighbouring lanes counter-rotate '
                + '(ring 0 clockwise, ring 1 anticlockwise…; on the highway, lanes flow right / left / '
                + 'right — opposing traffic). Purely which way a lane is drawn; the traffic itself is '
                + 'unchanged, so each jam still crawls backward against its own lane.' }),

  maxSpeed: z.number().int().min(1).max(8).default(5)
    .meta({ section: 'Traffic', ui: 'slider', min: 1, max: 8, step: 1, label: 'Max speed',
            help: 'Top speed in cells per tick. The classic model uses 5.' }),
  dawdle: z.number().min(0).max(0.6).default(0.25)
    .meta({ section: 'Traffic', ui: 'slider', min: 0, max: 0.6, step: 0.01, label: 'Dawdle chance',
            help: 'Chance each car randomly taps the brake. This is the seed of every jam — '
                + 'one driver’s hesitation cascades into a standing wave. 0 = perfectly '
                + 'disciplined drivers, no phantom jams.' }),
  simSpeed: z.number().min(1).max(24).default(6)
    .meta({ section: 'Traffic', ui: 'slider', min: 1, max: 24, step: 0.5, label: 'Sim speed',
            help: 'Traffic ticks per second. Lower is calmer and more hypnotic.' }),

  carStyle: z.enum(['dots', 'arcs']).default('dots')
    .meta({ section: 'Look', ui: 'segmented', options: ['dots', 'arcs'], label: 'Car style',
            help: 'Dots: each car is a round glyph. Arcs: each car is a thick rounded segment swept '
                + 'along its lane, so bumper-to-bumper cars fuse into one solid band — a jam reads as '
                + 'a fat arc, free flow as spaced segments.' }),
  carSize: z.number().min(1).max(8).default(3)
    .meta({ section: 'Look', ui: 'slider', min: 1, max: 8, step: 0.5, label: 'Car size',
            help: 'Radius of each dot, in pixels (Dots style). Arc blocks size themselves to fill '
                + 'the disc, so this only affects Dots.' }),
  blockFill: z.number().min(0.3).max(1).default(0.82)
    .meta({ section: 'Look', ui: 'slider', min: 0.3, max: 1, step: 0.02, label: 'Block fill',
            help: 'How much of each car’s slot its block fills (Arcs style only). Blocks never '
                + 'overlap — 1.0 = bumper-to-bumper blocks touch, lower leaves a clean gap between '
                + 'cars. Block size itself follows Road length: fewer cells = chunkier blocks.' }),
  colorBySpeed: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Color by speed',
            help: 'On: cars are colored fast→slow so jams light up. Off: every car is the '
                + 'fast color.' }),
  fadeTrails: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Light trails',
            help: 'On: cars leave fading streaks — a long-exposure highway-at-night look. '
                + 'Off: crisp dots, each frame wiped clean.' }),
  trailLength: z.number().min(0).max(100).default(78)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 100, step: 1, label: 'Trail length',
            help: 'How long the light trails linger. Higher = longer, slower-fading streaks. '
                + 'Only affects the look when Light trails is on.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05060a')
    .meta({ section: 'Look', ui: 'color', label: 'Background',
            help: 'Trails fade toward this color.' }),
  color: z.object({
    slow: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff2d2d')
      .meta({ ui: 'color', label: 'Jam (stopped)',
              help: 'Color of a stopped car. Jams glow in this hue.' }),
    fast: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#39d7ff')
      .meta({ ui: 'color', label: 'Free (top speed)',
              help: 'Color of a car at full speed. Speed is interpolated between the two.' }),
  }).default({ slow: '#ff2d2d', fast: '#39d7ff' })
    .meta({ section: 'Look', ui: 'group', label: 'Speed colors' }),

  showHud: z.boolean().default(true)
    .meta({ section: 'HUD', ui: 'toggle', label: 'Show readout',
            help: 'Overlay live density and mean flow.' }),

  seed: z.number().int().default(7)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed reproduces the same initial layout. A fresh visit '
                + 'rolls a new one.' }),
})

export type PhantomTrafficConfig = z.infer<typeof phantomTrafficSchema>
