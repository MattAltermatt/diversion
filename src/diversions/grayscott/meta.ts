import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'grayscott',
  title: 'Gray-Scott',
  description: 'Two chemicals react and diffuse into coral, mitosis, and maze patterns that never settle.',
  kind: 'webgl',
} as const satisfies DiversionMeta
