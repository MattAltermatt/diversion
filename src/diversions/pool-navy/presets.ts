import type { PresetGroup } from '../../framework/types'
import { DEFAULTS } from './config'
import type { PoolNavySchemaConfig } from './schema'

/**
 * Two independent axes.
 *
 * ⚠️ No field appears in both groups, or picking one silently flips the
 * other's dropdown to "Custom". Every option within a group patches the
 * IDENTICAL key set, and each group has one option equal to DEFAULTS so it
 * opens on a name rather than announcing "Custom" before anything is touched.
 * A single-field group is also avoided: it renders two controls with the same
 * name and the same effect.
 */
export const poolNavyPresets: PresetGroup<PoolNavySchemaConfig>[] = [
  {
    label: 'Engagement',
    options: [
      {
        // Landing look — matches DEFAULTS exactly.
        name: 'Backyard skirmish',
        patch: { pool: 'backyard', tempo: DEFAULTS.tempo, topSpeedMs: DEFAULTS.topSpeedMs, hullHp: DEFAULTS.hullHp },
      },
      {
        name: 'Knife fight',
        patch: { pool: 'kiddie', tempo: 0.75, topSpeedMs: 0.6, hullHp: 60 },
      },
      {
        name: 'Long patrol',
        patch: { pool: 'competition', tempo: 0.45, topSpeedMs: 0.4, hullHp: 140 },
      },
      {
        name: 'Open water',
        patch: { pool: 'olympic', tempo: 0.4, topSpeedMs: 0.45, hullHp: 180 },
      },
    ],
  },
  {
    label: 'Palette',
    options: [
      {
        name: 'Pool blue',
        patch: { background: DEFAULTS.background, palette: DEFAULTS.palette, showWakes: DEFAULTS.showWakes },
      },
      {
        name: 'Night harbour',
        patch: { background: '#0c2233', palette: ['#ff7b54', '#4ecdc4', '#ffe66d', '#c490d1'], showWakes: true },
      },
      {
        name: 'Chlorine',
        patch: { background: '#2ec4b6', palette: ['#e71d36', '#011627', '#ff9f1c', '#41337a'], showWakes: true },
      },
      {
        name: 'Bathwater',
        patch: { background: '#dfe8ec', palette: ['#2a4d69', '#8b1e3f', '#3e6b48', '#7a5c2e'], showWakes: false },
      },
    ],
  },
]
