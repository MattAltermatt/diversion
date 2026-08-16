import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'flock-vs-hunter',
  title: 'Flock vs Hunter',
  description: 'A shimmering flock and its predators co-evolve — the selfish herd tightens, the hunters learn to lead. An endless Red-Queen arms race.',
  kind: '2d',
} as const satisfies DiversionMeta
