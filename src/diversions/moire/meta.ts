import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'moire',
  title: 'Moire',
  description: 'Concentric rings expand from drifting centers and interfere into '
    + 'shifting moire — glowing, filled op-art parity, or thin cancelling lines.',
  kind: '2d',
} as const satisfies DiversionMeta
