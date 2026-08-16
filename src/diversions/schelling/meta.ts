import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'schelling',
  title: 'Schelling Segregation',
  description: 'A grid of two or three groups sorts itself into large single-colour blocks — segregation '
    + 'emerging from nothing more than a mild preference to have a few like-minded neighbours.',
  kind: '2d',
} as const satisfies DiversionMeta
