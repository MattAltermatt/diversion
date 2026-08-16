import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'logarithmic-circles',
  title: 'Logarithmic Circles',
  description: 'An endless zoom through rings of black-and-white circles — '
    + 'log-spaced, self-similar, hypnotic. Faithful op-art with a gallery color mode.',
  kind: 'webgl',
} as const satisfies DiversionMeta
