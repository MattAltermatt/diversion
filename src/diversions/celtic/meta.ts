import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'celtic',
  title: 'Celtic',
  description: 'Endless interlaced Celtic knotwork — smooth jewel-toned ribbons weave over and under in a single '
    + 'consistent plait, blossoming out from the centre, resting, then fading as a fresh knot is woven.',
  kind: '2d',
} as const satisfies DiversionMeta
