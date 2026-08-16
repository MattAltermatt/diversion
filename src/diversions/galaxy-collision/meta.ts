import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'galaxy-collision',
  title: 'Galaxy Collision',
  description: 'Two spiral galaxies fall together and tidally shred each other — a restricted N-body of thousands of stars flung into tails, bridges, and shells as the cores pass, then reborn as a fresh encounter.',
  kind: 'webgl',
} as const satisfies DiversionMeta
