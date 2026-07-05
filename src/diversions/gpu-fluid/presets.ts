import type { GpuFluidConfig } from './schema'

// Two independent preset axes (like Gray-Scott's Pattern + Color).
//
// Flow patches the motion character — curl (filament sharpness), injection rate
// (how busy the field is), and sim speed (how fast it boils). Same key-set per
// option (the preset-sweep #125 assumption). 'Billowing' == the schema defaults.
export const flowPresets: {
  name: string
  patch: Pick<GpuFluidConfig, 'curl' | 'injectionRate' | 'simSpeed'>
}[] = [
  { name: 'Wispy',     patch: { curl: 12, injectionRate: 1.0, simSpeed: 1 } },   // calm, soft threads
  { name: 'Billowing', patch: { curl: 30, injectionRate: 2.0, simSpeed: 1 } },   // default — rolling smoke
  { name: 'Turbulent', patch: { curl: 46, injectionRate: 2.6, simSpeed: 1.5 } }, // energetic, sharp vortices
]

// Palette = the hues injected into the dye field, drawn on black. Saturated
// stops (UX invariant #5, high contrast). 6-hex = opaque. 'Aurora' == defaults.
export const palettePresets: { name: string; patch: Pick<GpuFluidConfig, 'stops'> }[] = [
  { name: 'Aurora', patch: { stops: ['#0affc2', '#19d3fa', '#6a5cff', '#b14cff', '#39ffa6'] } },
  { name: 'Ink',    patch: { stops: ['#ff2d6b', '#ffb23f', '#31d96b', '#1fb6ff', '#a15cff'] } },
  { name: 'Fire',   patch: { stops: ['#ff2200', '#ff6a00', '#ffb300', '#ffe066', '#ff3d00'] } },
  { name: 'Neon',   patch: { stops: ['#ff00d4', '#00f0ff', '#b6ff00', '#ff0066', '#00ffa3'] } },
]
