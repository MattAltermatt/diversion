import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'outbreak',
  title: 'Outbreak',
  description: 'A three-faction arena: fighters recruit and the horde bites, both draining a crowd of civilians. Watch who wins — then it reseeds into a fresh outbreak.',
  kind: '2d',
} as const satisfies DiversionMeta
