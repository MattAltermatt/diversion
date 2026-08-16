import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'substrate',
  title: 'Substrate',
  description: 'Cracks grow and branch at right angles into an organic network, '
    + 'each washing a soft watercolour cell beside it. After Jared Tarbell’s Substrate (complexification.net).',
  kind: '2d',
} as const satisfies DiversionMeta
