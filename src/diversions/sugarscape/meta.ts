import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'sugarscape',
  title: 'Sugarscape',
  description: 'An agent economy: harvesters stream to two sugar mountains, and migration, boom-bust, and inequality emerge.',
  kind: '2d',
} as const satisfies DiversionMeta
