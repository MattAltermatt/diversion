import type { PresetGroup } from '../../framework/types'
import type { SubstrateConfig } from './schema'

// Shape fronts the Straight % slider (#323): the all-circles look existed since
// #50 behind straightPct 0 and nobody could tell. One click each.
export const shapePresets: PresetGroup<SubstrateConfig> = {
  label: 'Shape',
  options: [
    { name: 'Lines',       patch: { straightPct: 100 } },
    { name: 'Classic',     patch: { straightPct: 80 } },
    { name: 'Half & half', patch: { straightPct: 50 } },
    { name: 'Circles',     patch: { straightPct: 0 } },
  ],
}

// Style combines the three start knobs. Every option carries all three keys —
// matchPresets assumes one key-set per group. Classic must equal the schema
// defaults so the picker opens on a name (#311, presetSweep).
export const stylePresets: PresetGroup<SubstrateConfig> = {
  label: 'Style',
  options: [
    { name: 'Classic',     patch: { orientation: 'free', origin: 'scatter', startDelay: 0 } },
    { name: 'Grid city',   patch: { orientation: 'grid', origin: 'corner',  startDelay: 1 } },
    { name: 'Corner city', patch: { orientation: 'free', origin: 'corner',  startDelay: 1 } },
    { name: 'Bloom',       patch: { orientation: 'free', origin: 'centre',  startDelay: 0.5 } },
  ],
}
