import { z } from 'zod'
import { GROUP_IDS } from './groups'

// The wallpaper-group picker: 'auto' (default) lets the seed choose a fresh group
// each reseed; or pin one of the 17 crystallographic groups by name.
const GROUP_OPTIONS = ['auto', ...GROUP_IDS] as const

// Named motif palettes; 'auto' rolls a palette from the seed each reseed.
import { PALETTE_NAMES } from './palettes'
const PALETTE_OPTIONS = ['auto', ...PALETTE_NAMES] as const

export const crystalSchema = z.object({
  // ── Pattern ──
  group: z.enum(GROUP_OPTIONS).default('auto')
    .meta({ section: 'Pattern', ui: 'select', options: [...GROUP_OPTIONS], label: 'Wallpaper group',
            help: 'Which of the 17 plane-symmetry groups tiles the motif. '
                + 'p-numbers name the rotation order (p1 none, p2 half-turn, p3/p4/p6 three-/four-/six-fold); '
                + 'm = mirror, g = glide. "auto" picks a fresh group on every reseed.' }),
  cellSize: z.number().int().min(60).max(280).default(140)
    .meta({ section: 'Pattern', ui: 'slider', min: 60, max: 280, step: 5, label: 'Cell size',
            help: 'Edge length of the repeating cell in pixels — the scale of the motif. '
                + 'Smaller = a denser, finer wallpaper.' }),
  motifComplexity: z.number().int().min(1).max(8).default(4)
    .meta({ section: 'Pattern', ui: 'slider', min: 1, max: 8, step: 1, label: 'Motif complexity',
            help: 'How many shapes make up the motif stamped into each fundamental domain.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true, collapsed: true,
            help: 'Any integer — picks the group (when auto), the motif, and the palette (when auto). '
                + 'A shared link is seedless, so every visit opens on a fresh wallpaper; '
                + 'pass ?seed=N to reproduce an exact one.' }),
  // ── Motion ──
  driftSpeed: z.number().min(0).max(3).default(1)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 3, step: 0.05, label: 'Drift speed',
            help: 'How fast the whole lattice gently rotates and glides. 0 = perfectly still.' }),
  cycleSeconds: z.number().int().min(0).max(90).default(26)
    .meta({ section: 'Motion', ui: 'slider', min: 0, max: 90, step: 1, label: 'Reseed every (s)',
            help: 'Seconds before a fresh group + motif + palette fade in. 0 = never reseed.' }),
  // ── Color ──
  palette: z.enum(PALETTE_OPTIONS).default('auto')
    .meta({ section: 'Color', ui: 'select', options: [...PALETTE_OPTIONS], label: 'Palette',
            help: 'Motif colors. "auto" rolls a palette from the seed each reseed.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0c0a14')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Fills behind the wallpaper. Kept dark for high contrast.' }),
})

export type CrystalConfig = z.infer<typeof crystalSchema>
