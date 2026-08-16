import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'firefly',
  title: 'Firefly',
  description: 'A meadow of pulse-coupled fireflies. Each charges up and flashes on its own, '
    + 'nudging its neighbours a hair closer to flashing — until chaotic flicker ripples into '
    + 'travelling waves of light and, finally, the whole swarm pulsing in hypnotic unison.',
  kind: '2d',
} as const satisfies DiversionMeta
