import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity (#288): eager-globbed, no imports beyond the type. */
export const meta = {
  id: 'salvage',
  title: 'Salvage',
  description: 'A drone colony takes a sprite apart from the edges in and carries it home, piece by piece.',
  kind: '2d',
} as const satisfies DiversionMeta
