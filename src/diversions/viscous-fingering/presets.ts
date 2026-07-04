import type { ViscousFingeringConfig } from './schema'

// Two independent preset axes (like Gray-Scott / Physarum). A Fingering option
// patches the four interface knobs (equal key-set per option — required by
// matchPresets); a Color option patches the palette + background. simSpeed / seed /
// colorMode stay user-controlled, outside both groups.

type Finger = Pick<ViscousFingeringConfig, 'viscosityRatio' | 'surfaceTension' | 'injectionRate' | 'noise'>
type Color = Pick<ViscousFingeringConfig, 'palette' | 'background'>

export const fingeringPresets: { name: string; patch: Finger }[] = [
  // Balanced branching coral fingers — the signature look.
  { name: 'Coral',       patch: { viscosityRatio: 0.55, surfaceTension: 0.50, injectionRate: 0.85, noise: 0.25 } },
  // Thin, finely-dividing ferns (high viscosity ratio, low surface tension).
  { name: 'Ferns',       patch: { viscosityRatio: 0.82, surfaceTension: 0.32, injectionRate: 0.80, noise: 0.35 } },
  // Broad, smooth lobes (low ratio, high surface tension) — calm and rounded.
  { name: 'Broad Lobes', patch: { viscosityRatio: 0.30, surfaceTension: 0.72, injectionRate: 0.90, noise: 0.15 } },
  // Restless, chaotic tip-splitting (high perturbation).
  { name: 'Wild Splits', patch: { viscosityRatio: 0.62, surfaceTension: 0.44, injectionRate: 0.82, noise: 0.62 } },
]

// Palette (finger core) + background. 6-hex = opaque. High contrast (UX invariant #5).
export const colorPresets: { name: string; patch: Color }[] = [
  { name: 'Glacier Ink', patch: { palette: ['#050a14', '#0a4f7a', '#5fd0ff'], background: '#050a14' } },
  { name: 'Ferrofluid',  patch: { palette: ['#0a0a0f', '#3a2a6a', '#c9a6ff'], background: '#05050a' } },
  { name: 'Magma',       patch: { palette: ['#0a0400', '#b23a00', '#ffd27f'], background: '#0a0400' } },
  { name: 'Bone',        patch: { palette: ['#0c0c10', '#5a5a66', '#f0f0f5'], background: '#0c0c10' } },
]
