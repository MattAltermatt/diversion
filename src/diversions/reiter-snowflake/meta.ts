import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'reiter-snowflake',
  title: 'Snowflake',
  description: 'A single frozen speck grows a six-fold ice crystal by Clifford Reiter’s snow-growth rule — vapor diffuses in from the air and freezes onto the tips, sculpting dendrites, ferns, and plates that are each unique. When the crystal fills the frame the field clears and a fresh speck begins to grow.',
  kind: '2d',
} as const satisfies DiversionMeta
