import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'pool-navy',
  title: 'Pool Navy',
  description:
    'Toy warships in a swimming pool, fighting a war that never ends — every sinking draws in a faction that has never fought before.',
  kind: '2d',
} as const satisfies DiversionMeta
