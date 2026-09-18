// presets.ts — declared data (framework renders one dropdown per group).
//
// Two INDEPENDENT axes (#363): Ground governs the courtyard surface the
// kolam is drawn on; Palette governs the chalk itself. No field appears in
// both, or picking one silently flips the other's dropdown to "Custom"
// (#311/#363).
import type { PresetGroup } from '../../framework/types'
import type { KolamConfig } from './config'
import { DEFAULTS } from './config'

export const kolamPresets: PresetGroup<KolamConfig>[] = [
  {
    label: 'Ground',
    options: [
      // Landing look — matches DEFAULTS exactly so the group opens on a name.
      { name: 'Swept concrete', patch: { background: DEFAULTS.background, groundGrain: DEFAULTS.groundGrain } },
      { name: 'Ochre courtyard', patch: { background: '#a98c5c', groundGrain: 30 } },
      { name: 'Red earth', patch: { background: '#9a6f4e', groundGrain: 32 } },
      { name: 'Courtyard at dusk', patch: { background: '#3a2c22', groundGrain: 24 } },
      { name: 'Wet slate', patch: { background: '#2b3034', groundGrain: 20 } },
    ],
  },
  {
    label: 'Palette',
    options: [
      // Landing look — matches DEFAULTS exactly so the group opens on a name.
      { name: 'Turmeric & clay', patch: {
          palette: DEFAULTS.palette, kaaviColor: DEFAULTS.kaaviColor, colouredChalk: DEFAULTS.colouredChalk } },
      { name: 'Temple brights', patch: {
          palette: ['#e63946', '#f4a300', '#2a9d8f', '#264653', '#e9c46a'],
          kaaviColor: '#7a1f1f', colouredChalk: 0.65 } },
      { name: 'Rice & indigo', patch: {
          palette: ['#f7f3ea', '#3d5a80', '#98c1d9', '#ee6c4d'],
          kaaviColor: '#1d3557', colouredChalk: 0.15 } },
      { name: 'Festival pastel', patch: {
          palette: ['#f7cad0', '#fbf8cc', '#90dbf4', '#b9fbc0', '#cfbaf0'],
          kaaviColor: '#6a4c93', colouredChalk: 0.5 } },
    ],
  },
]
