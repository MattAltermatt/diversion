import type { PresetGroup } from '../../framework/types'
import type { AblationConfig } from './schema'

// Two independent axes: colour (Palette) and turret-crew feel (Demolition).
//
// Every Palette option also sets `source: 'Contours'`. Picking a named ramp is a
// statement that you want the generated map — the ramp is inert against an
// imported picture, whose colours come out of its own pixels, so without this a
// pick would silently do nothing and `matchPresets` would then show a group label
// for a palette that is not on screen. Demolition is left alone: turret feel is
// genuinely orthogonal to where the picture came from.
// Every option within a group patches the SAME key-set (framework matchPresets
// rule — see src/framework/presets.ts).
//
// Every ramp deliberately STOPS SHORT of the ground. Quantization is by quantile,
// so each band is an equal share of the picture — a near-black darkest stop would
// make a sixth of every map indistinguishable from destroyed space, and the turrets
// hunting that band invisible too (UX invariants #1 and #5). Measured WCAG ratios:
// darkest stop vs its own background is >= 1.88 in every palette here, and every
// adjacent pair is >= 1.31 apart.
export const ablationPresets: PresetGroup<AblationConfig>[] = [
  {
    label: 'Palette',
    options: [
      { name: 'Bathymetric', patch: { source: 'Contours', palette: ['#1b4f6b', '#247091', '#2f8b9b', '#67b8ab', '#b2d18d', '#f2e2b0'], background: '#05070a' } },
      { name: 'Ember',       patch: { source: 'Contours', palette: ['#6b2810', '#963a12', '#c25518', '#e08128', '#f4ad46', '#ffe0a3'], background: '#070403' } },
      { name: 'Monochrome',  patch: { source: 'Contours', palette: ['#4d4d4d', '#f2f2f2'], background: '#050505' } },
      { name: 'Verdigris',   patch: { source: 'Contours', palette: ['#18543d', '#217a58', '#33a074', '#6fc298', '#a9dcb8', '#e6f2d9'], background: '#040806' } },
      { name: 'Ultraviolet', patch: { source: 'Contours', palette: ['#4d2694', '#6b34b3', '#8b4cd1', '#ac72e0', '#cd9bee', '#f0d9ff'], background: '#050210' } },
      // Old-school Seattle Mariners (1977–86 trident era): royal blue → gold, the
      // same brand identity Flow Field, Squiral and Particle Life carry, and the
      // same #4d9bff / gold anchors. Re-spaced for contour work — a straight
      // navy→royal→sky→gold→cream ramp bunches at the light end (gold, cream and
      // silver sit within 1.2 of each other), so the blues carry three of the six
      // bands and silver is dropped entirely.
      { name: 'Mariners',    patch: { source: 'Contours', palette: ['#1a3d9e', '#2350d0', '#3d72f0', '#4d9bff', '#f0b429', '#ffe9b0'], background: '#050810' } },
    ],
  },
  {
    label: 'Demolition',
    options: [
      // `queued` is the reserve, NOT the total — every option below keeps the same
      // fleet it shipped with (Steady is still 20 turrets: 12 riding, 8 waiting).
      // One qualification: `Strip Mine` is Unison, whose floor is now 1 rather than the
      // band count, so at a 23- or 24-colour palette it crews 22 where the old build
      // crewed 23-24. Identical at every palette up to 22, and deliberate.
      { name: 'Patient',    patch: { capacity: 5,  queued: 4,  charge: 30,  speed: 70,  targetingBias: 1,   spacing: 1, targeting: 'Mixed'  } },
      { name: 'Steady',     patch: { capacity: 12, queued: 8,  charge: 60,  speed: 140, targetingBias: 1,   spacing: 1, targeting: 'Mixed'  } },
      { name: 'Sentinels',  patch: { capacity: 2,  queued: 4,  charge: 90,  speed: 90,  targetingBias: 1,   spacing: 1, targeting: 'Mixed'  } },
      { name: 'Ring',       patch: { capacity: 16, queued: 10, charge: 50,  speed: 120, targetingBias: 1,   spacing: 1, targeting: 'Mixed'  } },
      { name: 'Swarm',      patch: { capacity: 40, queued: 24, charge: 45,  speed: 200, targetingBias: 1,   spacing: 1, targeting: 'Mixed'  } },
      { name: 'Relentless', patch: { capacity: 14, queued: 10, charge: 120, speed: 160, targetingBias: 2.2, spacing: 1, targeting: 'Mixed'  } },
      { name: 'Strip Mine', patch: { capacity: 14, queued: 8,  charge: 70,  speed: 150, targetingBias: 1,   spacing: 1, targeting: 'Unison' } },
    ],
  },
]
