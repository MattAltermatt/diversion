import type { PresetGroup } from '../../framework/types'
import type { PhantomTrafficConfig } from './schema'

// Two independent axes. Scene bundles the layout + density + trail combos that
// read well together (including the two "match the phenomenon" extremes);
// Palette swaps the speed-color ramp.
export const phantomPresets: PresetGroup<PhantomTrafficConfig>[] = [
  {
    // Every option patches the SAME key-set (layout, density, dawdle, fadeTrails,
    // trailLength, carSize) so matchPresets can flip to "Custom" on any manual drift.
    label: 'Scene',
    options: [
      { name: 'Ring road', patch: { layout: 'rings', density: 0.16, dawdle: 0.25, fadeTrails: true, trailLength: 78, carSize: 3 } },
      { name: 'Night highway', patch: { layout: 'highway', density: 0.18, dawdle: 0.25, fadeTrails: true, trailLength: 88, carSize: 2.5 } },
      { name: 'Phase transition', patch: { layout: 'highway', density: 0.12, dawdle: 0.3, fadeTrails: true, trailLength: 70, carSize: 3 } },
      { name: 'Gridlock', patch: { layout: 'rings', density: 0.42, dawdle: 0.2, fadeTrails: true, trailLength: 60, carSize: 3 } },
      { name: 'Free flow', patch: { layout: 'rings', density: 0.06, dawdle: 0.12, fadeTrails: true, trailLength: 82, carSize: 3 } },
      { name: 'Crisp dots', patch: { layout: 'rings', density: 0.16, dawdle: 0.25, fadeTrails: false, trailLength: 78, carSize: 3.5 } },
    ],
  },
  {
    label: 'Palette',
    options: [
      { name: 'Taillights', patch: { colorBySpeed: true, background: '#05060a', color: { slow: '#ff2d2d', fast: '#39d7ff' } } },
      { name: 'Amber sodium', patch: { colorBySpeed: true, background: '#080503', color: { slow: '#ff5a1e', fast: '#ffe39a' } } },
      { name: 'Toxic', patch: { colorBySpeed: true, background: '#04080a', color: { slow: '#ff2e88', fast: '#8dff1a' } } },
      { name: 'Ice', patch: { colorBySpeed: true, background: '#04070d', color: { slow: '#6a5cff', fast: '#8ff0ff' } } },
      { name: 'Mono', patch: { colorBySpeed: false, background: '#05060a', color: { slow: '#e8eefc', fast: '#e8eefc' } } },
    ],
  },
]
