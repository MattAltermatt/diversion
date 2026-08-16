import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'red-queen',
  title: 'Red Queen',
  description: 'Hosts and parasites chase each other’s genes forever — the common type gets targeted and crashes while a rare type rises, an endless out-of-phase wave of colour.',
  kind: '2d',
} as const satisfies DiversionMeta
