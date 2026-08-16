import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'labyrinth',
  title: 'Labyrinth',
  description: 'A slime mold explores a maze, grows to the far corner, and lights the shortest path.',
  kind: 'webgl',
} as const satisfies DiversionMeta
