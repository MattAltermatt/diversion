import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'rain-on-glass',
  title: 'Rain on Glass',
  description: 'Droplets condense, merge, and slide down a rain-streaked window over blurred city lights.',
  kind: '2d',
} as const satisfies DiversionMeta
