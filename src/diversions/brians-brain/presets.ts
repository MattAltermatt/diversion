import type { BriansBrainConfig } from './schema'

// A "Look" is a whole named world: the rule + its seed density + a matching
// palette, applied in one click. Colours for the other rule ride along in the
// patch (harmless — they sit hidden until you switch rules).
type Look = Pick<BriansBrainConfig,
  'rule' | 'density' | 'wireDensity'
  | 'background' | 'onColor' | 'dyingColor' | 'wireColor' | 'headColor' | 'tailColor'>

const bbColors = (bg: string, on: string, dying: string): Pick<Look, 'wireColor' | 'headColor' | 'tailColor'> & { background: string; onColor: string; dyingColor: string } => ({
  background: bg, onColor: on, dyingColor: dying,
  wireColor: '#3a2410', headColor: '#ffd84a', tailColor: '#ff5a2a',
})
const wwColors = (bg: string, wire: string, head: string, tail: string) => ({
  background: bg, wireColor: wire, headColor: head, tailColor: tail,
  onColor: '#5ffbff', dyingColor: '#0e5a74',
})

export const lookPresets: { name: string; patch: Look }[] = [
  { name: 'Neon Swarm',   patch: { rule: "Brian's Brain", density: 0.32, wireDensity: 0.5, ...bbColors('#04060b', '#5ffbff', '#0e5a74') } },
  { name: 'Ember Swarm',  patch: { rule: "Brian's Brain", density: 0.30, wireDensity: 0.5, ...bbColors('#0a0410', '#ffb14a', '#7a1f0e') } },
  { name: 'Phosphor',     patch: { rule: "Brian's Brain", density: 0.34, wireDensity: 0.5, ...bbColors('#020a06', '#7dff9e', '#0d5a2c') } },
  { name: 'Copper Circuit', patch: { rule: 'Wireworld', density: 0.32, wireDensity: 0.5, ...wwColors('#05060a', '#3a2410', '#ffd84a', '#ff5a2a') } },
  { name: 'Blue Signal',  patch: { rule: 'Wireworld', density: 0.32, wireDensity: 0.55, ...wwColors('#03060f', '#14324f', '#8fe3ff', '#2a6cff') } },
]
