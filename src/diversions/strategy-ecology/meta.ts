import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'strategy-ecology',
  title: 'Strategy Ecology',
  description: 'A grid of agents plays repeated Prisoner’s Dilemma with its neighbours; cooperation blooms, defectors invade, and memory strategies keep the arms race turning forever.',
  kind: '2d',
} as const satisfies DiversionMeta
