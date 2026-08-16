import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'wa-tor',
  title: 'Wa-Tor',
  description: 'Dewdney’s predator-prey ocean: fish bloom, a shark front culls them, sharks starve back down, and the population waves roll on forever.',
  kind: '2d',
} as const satisfies DiversionMeta
