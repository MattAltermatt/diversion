import type { PresetOption } from '../../framework/types'
import type { MoireConfig } from './schema'

// One "Style" axis. Each option patches the ring shape (top-level) AND the whole
// `color` group — the group is nested, so it must be supplied complete (the
// framework spreads the patch at the top level). All options patch the SAME key
// set so matchPresets can flip to "Custom" the moment any of them drifts.
const BG = '#05060a'

export const stylePresets: PresetOption<MoireConfig>[] = [
  {
    // Soft luminous rings — the calm gallery default.
    name: 'Glow',
    patch: {
      ringSpacing: 38, ringSpeed: 18, softness: 0.6, ringWidth: 2,
      color: {
        mode: 'glow', background: BG,
        tints: ['#37d6ffff', '#8a7bffff', '#ff5fa2ff', '#5effc4ff', '#ffd166ff'],
        fg: '#9fe7ff', hueCycle: 6,
      },
    },
  },
  {
    // Filled-disc XOR parity — the centers' rings merge into one bold 2-colour
    // interference field. Two solid colours (background + fg) fill the whole
    // plane; ringWidth is unused (discs are filled), softness just feathers the
    // band edges.
    name: 'Op-Art',
    patch: {
      ringSpacing: 64, ringSpeed: 22, softness: 0.08, ringWidth: 2,
      color: {
        mode: 'solid', background: '#15564d',
        tints: ['#37d6ffff', '#8a7bffff', '#ff5fa2ff', '#5effc4ff', '#ffd166ff'],
        fg: '#ff5f8d', hueCycle: 6,
      },
    },
  },
  {
    // Duotone rings that cancel where they cross — hypnotic moire.
    name: 'Moire',
    patch: {
      ringSpacing: 32, ringSpeed: 18, softness: 0.5, ringWidth: 3,
      color: {
        mode: 'xor', background: BG,
        tints: ['#37d6ffff', '#8a7bffff', '#ff5fa2ff', '#5effc4ff', '#ffd166ff'],
        fg: '#9fe7ff', hueCycle: 6,
      },
    },
  },
]
