import { z } from 'zod'

// Trail-density ramp. Default Bioluminescence (deep-blue → cyan → white).
const BIOLUM = ['#020814', '#0a3b66', '#1bd6ff', '#eaffff']

export const labyrinthSchema = z.object({
  // ── Maze ──
  mazeSize: z.number().int().min(6).max(60).default(28)
    .meta({ section: 'Maze', ui: 'slider', min: 6, max: 60, step: 1, label: 'Maze size',
            help: 'Cells across the short edge. Higher = finer, more intricate labyrinth and a '
                + 'longer solve. Changing this generates a new maze.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Maze', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed always grows the same sequence of mazes. A fresh visit rolls a new one.' }),
  // ── Behavior ──
  sensorAngle: z.number().min(5).max(60).default(22.5)
    .meta({ section: 'Behavior', ui: 'slider', min: 5, max: 60, step: 0.5, label: 'Sensor angle',
            help: 'Angle of the left/right sensors off an agent’s heading. Wider = bushier '
                + 'exploration; narrower = straighter probing.' }),
  sensorDist: z.number().min(1).max(20).default(9)
    .meta({ section: 'Behavior', ui: 'slider', min: 1, max: 20, step: 0.5, label: 'Sensor distance',
            help: 'How far ahead (trail texels) agents taste the pheromone.' }),
  turnSpeed: z.number().min(5).max(90).default(40)
    .meta({ section: 'Behavior', ui: 'slider', min: 5, max: 90, step: 1, label: 'Turn speed',
            help: 'How sharply agents steer toward the strongest trail (degrees/step). Higher = '
                + 'twitchier; helps agents round tight corners.' }),
  deposit: z.number().min(0.1).max(5).default(0.7)
    .meta({ section: 'Behavior', ui: 'slider', min: 0.1, max: 5, step: 0.1, label: 'Deposit',
            help: 'Trail laid by each agent per step. Higher = bolder, brighter corridors.' }),
  // Min is a small positive floor, not 0: the diffuse box-blur conserves energy, so
  // ×(1−decay) is the field's only sink. At decay 0 the half-float trail grows
  // unbounded to the R16F ceiling and saturates over a long run.
  decay: z.number().min(0.005).max(0.3).default(0.12)
    .meta({ section: 'Behavior', ui: 'slider', min: 0.005, max: 0.3, step: 0.005, label: 'Decay',
            help: 'Fraction of the trail lost each step. Lower = persistent, slowly-built '
                + 'corridors; higher = restless, fading exploration.' }),
  diffuse: z.number().min(0).max(1).default(0.6)
    .meta({ section: 'Behavior', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Diffuse',
            help: 'How much the trail spreads into neighbours each step (within walls). '
                + '0 = sharp, wiry; 1 = soft, smoky.' }),
  exploration: z.number().min(0).max(0.6).default(0.12)
    .meta({ section: 'Behavior', ui: 'slider', min: 0, max: 0.6, step: 0.05, label: 'Exploration',
            help: 'Fraction of agents that PIONEER — they flee their own trail to push into '
                + 'unexplored corridors instead of reinforcing the network. Higher = the colony '
                + 'expands outward faster to fill the maze and reach the exit; 0 = it consolidates '
                + 'near the start and may never get there.' }),
  goalPull: z.number().min(0).max(1).default(0.25)
    .meta({ section: 'Behavior', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Goal pull',
            help: 'How strongly the following agents are drawn along the maze toward the exit '
                + '(a faint chemical gradient from the goal). Gentle = it still wanders and probes '
                + 'dead-ends on the way; 0 = no pull, pure exploration; high = beelines to the exit.' }),
  // ── Simulation ──
  agents: z.number().int().min(20000).max(800000).default(160000)
    .meta({ section: 'Simulation', ui: 'slider', min: 20000, max: 800000, step: 20000,
            label: 'Agents',
            help: 'Number of slime agents exploring. More = faster, denser flooding. '
                + 'Changing this restarts the run.' }),
  speed: z.number().min(0.1).max(3).default(1)
    .meta({ section: 'Simulation', ui: 'slider', min: 0.1, max: 3, step: 0.05, label: 'Speed',
            help: 'Simulation steps per frame. Below 1 runs a step every few frames for a calm '
                + 'drift; above 1 explores faster.' }),
  // ── Solve ──
  holdAfterSolve: z.number().min(1).max(15).default(4)
    .meta({ section: 'Solve', ui: 'slider', min: 1, max: 15, step: 0.5, label: 'Hold after solve',
            help: 'Seconds the lit shortest path lingers before a fresh maze generates.' }),
  // ── Color ──
  stops: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(BIOLUM)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Trail colors',
            help: 'Trail density maps along these colors — lowest is the corridor background, '
                + 'highest is where the slime is thickest.' }),
  wallColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#46597a')
    .meta({ section: 'Color', ui: 'color', label: 'Wall color',
            help: 'The maze walls. Keep it high-contrast against the trail.' }),
  pathColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffd34d')
    .meta({ section: 'Color', ui: 'color', label: 'Solved-path glow',
            help: 'The shortest path lights up in this color when the maze is solved.' }),
})

export type LabyrinthConfig = z.infer<typeof labyrinthSchema>
