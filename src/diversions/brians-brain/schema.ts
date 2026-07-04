import { z } from 'zod'

// Two related 3/4-state excitable cellular automata, both by Brian Silverman.
// The rule field swaps between them; showWhen reveals only the active rule's
// controls so the form never carries dead knobs.
export const RULES = ["Brian's Brain", 'Wireworld'] as const
export type Rule = (typeof RULES)[number]

export const briansBrainSchema = z.object({
  // ── Rule ──
  rule: z.enum(RULES).default("Brian's Brain")
    .meta({ section: 'Rule', ui: 'segmented', options: RULES as unknown as string[], label: 'Automaton',
            help: 'Brian’s Brain: OFF cells wake when exactly 2 neighbours are ON, every ON cell '
                + 'flashes then dies — a restless field of streaming diagonal spaceships. Wireworld: '
                + 'electrons flow along wire paths like current through a circuit.' }),
  density: z.number().min(0.05).max(0.6).default(0.32)
    .meta({ section: 'Rule', ui: 'slider', min: 0.05, max: 0.6, step: 0.01, label: 'Seed density',
            help: 'Fraction of cells switched ON when the field is (re)seeded. '
                + 'Brian’s Brain soups stay alive across almost the whole range.',
            showWhen: { field: 'rule', equals: "Brian's Brain" } }),
  wireDensity: z.number().min(0.1).max(0.9).default(0.5)
    .meta({ section: 'Rule', ui: 'slider', min: 0.1, max: 0.9, step: 0.01, label: 'Wire density',
            help: 'How much of the field is conductive wire. Denser wire carries more, busier signals.',
            showWhen: { field: 'rule', equals: 'Wireworld' } }),
  // ── Grid ──
  cellSize: z.number().int().min(2).max(16).default(5)
    .meta({ section: 'Grid', ui: 'slider', min: 2, max: 16, step: 1, label: 'Cell size',
            help: 'Pixel size of each cell. Small = fine, dense swarms; large = bold and chunky.' }),
  speed: z.number().int().min(1).max(40).default(14)
    .meta({ section: 'Grid', ui: 'slider', min: 1, max: 40, step: 1, label: 'Speed',
            help: 'Cellular-automaton steps per second. Lower is a calm, watchable flow.' }),
  // ── Color ──
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#04060b')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'The dark ground the swarm streams across.' }),
  onColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#5ffbff')
    .meta({ section: 'Color', ui: 'color', label: 'ON cell',
            help: 'The bright, freshly-woken cells — the leading edge of every spaceship.',
            showWhen: { field: 'rule', equals: "Brian's Brain" } }),
  dyingColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0e5a74')
    .meta({ section: 'Color', ui: 'color', label: 'Dying cell',
            help: 'The dim ember an ON cell fades to for one step before it goes dark — the trailing glow.',
            showWhen: { field: 'rule', equals: "Brian's Brain" } }),
  wireColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3a2410')
    .meta({ section: 'Color', ui: 'color', label: 'Wire',
            help: 'The idle conductor the signals travel along.',
            showWhen: { field: 'rule', equals: 'Wireworld' } }),
  headColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffd84a')
    .meta({ section: 'Color', ui: 'color', label: 'Electron head',
            help: 'The bright leading spark of a signal.',
            showWhen: { field: 'rule', equals: 'Wireworld' } }),
  tailColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff5a2a')
    .meta({ section: 'Color', ui: 'color', label: 'Electron tail',
            help: 'The fading trail one step behind each head — this is what makes a signal flow one way.',
            showWhen: { field: 'rule', equals: 'Wireworld' } }),
  // ── Advanced ──
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed replays the same field. A shared link is seedless — '
                + 'every visit seeds a fresh world.' }),
})

export type BriansBrainConfig = z.infer<typeof briansBrainSchema>
