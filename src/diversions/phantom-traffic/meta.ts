import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'phantom-traffic',
  title: 'Phantom Traffic',
  description: 'Stop-and-go jams that nucleate from nothing and crawl backward against the flow.',
  kind: '2d',
} as const satisfies DiversionMeta
