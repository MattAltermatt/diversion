import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'raymarcher',
  title: 'Raymarcher',
  description: 'A cluster of signed-distance shapes sphere-traced, smooth-blended into one '
    + 'molten sculpture, and lit under a slowly orbiting camera.',
  kind: 'webgl',
} as const satisfies DiversionMeta
