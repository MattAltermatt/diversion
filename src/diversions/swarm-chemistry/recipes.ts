// recipes.ts — PURE data. Hiroki Sayama's Swarm Chemistry named recipes, transcribed
// verbatim from his Swift port (mitsuyoshi-yamazaki/SwarmChemistry, RecipeDefinitions
// .swift → Raw). Each species row is `count * (R, Vn, Vm, c1, c2, c3, c4, c5)`:
//   R  neighborhoodRadius (0..300)   Vn normalSpeed (0..20)   Vm maxSpeed (0..40)
//   c1 cohesive (0..1)   c2 aligning (0..1)   c3 separating (0..100)
//   c4 probRandomSteering (0..0.5)   c5 paceKeeping (0..1)
// The `count` is a RELATIVE weight — the diversion distributes the user's total
// particle budget across a recipe's species by these proportions (Sayama's field is
// fixed; only population scales). No WebGPU here → fully unit-testable.

/** One kinetic species: its relative population weight + 8-param genome. */
export interface Species {
  weight: number
  R: number
  Vn: number
  Vm: number
  c1: number
  c2: number
  c3: number
  c4: number
  c5: number
}

export interface Recipe {
  name: string
  species: Species[]
}

/** Longest recipe has 6 species (Cell With 2 Nuclei); the GPU recipe buffer is padded
 *  to this and species indices are always < MAX_SPECIES. */
export const MAX_SPECIES = 6

const sp = (
  weight: number, R: number, Vn: number, Vm: number,
  c1: number, c2: number, c3: number, c4: number, c5: number,
): Species => ({ weight, R, Vn, Vm, c1, c2, c3, c4, c5 })

// Verbatim from Sayama's Raw strings ("count * (R, Vn, Vm, c1, c2, c3, c4, c5)").
export const RECIPES: Recipe[] = [
  { name: 'Jelly Fish', species: [
    sp(134, 262.65, 12.01, 25.87, 0.97, 1.0, 56.35, 0.26, 0.61),
    sp(67, 288.17, 6.19, 23.37, 0.95, 1.0, 1.31, 0.1, 0.9),
    sp(68, 150.5, 12.97, 15.87, 0.46, 0.39, 57.95, 0.17, 0.48),
  ] },
  { name: 'Pulsating Eye', species: [
    sp(102, 293.86, 17.06, 38.3, 0.81, 0.05, 0.83, 0.2, 0.9),
    sp(124, 226.18, 19.27, 24.57, 0.95, 0.84, 13.09, 0.07, 0.8),
    sp(74, 49.98, 8.44, 4.39, 0.92, 0.14, 96.92, 0.13, 0.51),
  ] },
  { name: 'Cell With 2 Nuclei', species: [
    sp(41, 249.84, 4.85, 28.73, 0.34, 0.45, 14.44, 0.09, 0.82),
    sp(26, 277.87, 15.02, 35.48, 0.68, 0.05, 82.96, 0.46, 0.9),
    sp(30, 277.87, 15.02, 24.44, 0.68, 0.05, 82.96, 0.43, 0.9),
    sp(28, 110.8, 16.12, 38.6, 0.18, 0.34, 14.3, 0.01, 0.01),
    sp(48, 83.79, 13.29, 7.54, 0.08, 0.79, 1.07, 0.15, 0.45),
    sp(74, 269.64, 6.62, 34.69, 0.36, 0.5, 30.2, 0.03, 0.23),
  ] },
  { name: 'Multicellularity', species: [
    sp(99, 19.8, 15.73, 2.61, 0.85, 0.64, 10.51, 0.17, 0.06),
    sp(48, 300.0, 14.63, 0.0, 0.48, 0.81, 90.27, 0.25, 0.78),
    sp(37, 275.18, 16.9, 7.05, 0.48, 0.81, 90.27, 0.17, 0.85),
    sp(8, 159.59, 2.09, 24.19, 0.96, 0.59, 76.03, 0.01, 0.07),
    sp(42, 73.07, 1.82, 2.36, 0.27, 0.61, 40.55, 0.22, 0.86),
  ] },
  { name: 'Slicer', species: [
    sp(12, 86.89, 1.8, 22.26, 0.57, 0.35, 80.8, 0.35, 0.64),
    sp(1, 140.55, 2.52, 20.39, 0.97, 0.45, 35.51, 0.45, 0.06),
  ] },
  { name: 'Oscillator', species: [
    sp(500, 200.0, 20.0, 40.0, 0.64, 0.01, 0.29, 0.08, 0.97),
    sp(120, 300.0, 7.19, 15.51, 1.0, 0.33, 32.65, 0.34, 0.56),
  ] },
  { name: 'Insurmountable Wall', species: [
    sp(42, 52.57, 9.91, 20.42, 0.32, 0.76, 1.8, 0.01, 0.64),
    sp(25, 84.87, 8.82, 24.98, 0.91, 0.44, 40.97, 0.18, 0.6),
    sp(45, 220.42, 4.65, 7.53, 0.96, 0.35, 46.18, 0.25, 1.0),
    sp(49, 279.64, 10.29, 35.95, 0.37, 0.49, 38.09, 0.32, 0.89),
  ] },
  { name: 'No, Wait — This Way', species: [
    sp(60, 262.68, 2.82, 38.32, 0.21, 0.01, 54.93, 0.11, 0.19),
    sp(40, 78.58, 5.7, 33.23, 0.89, 0.18, 45.44, 0.04, 0.05),
    sp(40, 257.27, 14.96, 35.66, 0.2, 0.8, 47.81, 0.13, 0.13),
  ] },
  { name: 'Recombining Blobs', species: [
    sp(132, 45.91, 10.82, 21.11, 0.86, 0.13, 42.48, 0.32, 0.74),
    sp(84, 113.26, 3.41, 25.71, 0.4, 0.39, 49.53, 0.13, 0.24),
  ] },
  { name: 'Playing Catch', species: [
    sp(76, 84.06, 0.09, 9.89, 0.33, 0.32, 15.66, 0.22, 0.68),
    sp(100, 158.86, 18.4, 24.98, 0.3, 0.3, 1.72, 0.06, 0.37),
  ] },
  { name: 'Chaos Cells', species: [
    sp(144, 109.03, 6.71, 12.7, 0.47, 0.6, 61.43, 0.02, 0.21),
    sp(89, 117.15, 16.33, 31.88, 0.39, 0.13, 12.96, 0.48, 0.8),
    sp(67, 76.3, 8.59, 26.57, 0.7, 0.64, 28.39, 0.3, 0.35),
  ] },
  { name: 'Aggressive Predator', species: [
    sp(18, 211.92, 12.59, 19.37, 0.09, 0.21, 57.92, 0.0, 0.95),
    sp(41, 257.27, 14.96, 35.66, 0.2, 0.8, 47.81, 0.13, 0.13),
    sp(35, 262.68, 2.82, 38.32, 0.21, 0.01, 54.93, 0.11, 0.19),
    sp(31, 78.58, 5.7, 33.23, 0.89, 0.18, 45.44, 0.04, 0.05),
    sp(7, 194.21, 12.88, 21.68, 0.97, 0.19, 99.21, 0.5, 0.13),
  ] },
  { name: 'Fast Walker & Slow Follower', species: [
    sp(67, 216.35, 11.75, 7.7, 0.83, 0.97, 97.31, 0.02, 0.38),
    sp(29, 254.64, 7.28, 7.0, 0.95, 0.11, 22.41, 0.43, 0.31),
    sp(13, 105.4, 3.55, 5.24, 0.34, 0.18, 23.53, 0.39, 0.24),
  ] },
  { name: 'Swinger', species: [
    sp(48, 150.39, 15.89, 23.54, 0.74, 0.45, 62.65, 0.33, 0.13),
    sp(152, 217.14, 12.13, 12.42, 0.59, 0.98, 14.06, 0.04, 0.65),
    sp(14, 248.54, 5.85, 22.26, 0.43, 0.11, 17.14, 0.06, 0.68),
    sp(31, 141.53, 2.91, 4.86, 0.92, 0.03, 21.87, 0.28, 0.2),
  ] },
  { name: 'Rotary', species: [
    sp(29, 122.13, 19.19, 17.98, 0.65, 0.44, 19.88, 0.46, 0.2),
    sp(51, 299.13, 0.79, 38.71, 0.25, 0.18, 86.49, 0.38, 0.43),
    sp(10, 252.92, 19.99, 10.21, 0.23, 0.17, 1.22, 0.28, 0.92),
  ] },
  { name: 'Wedding Ring', species: [
    sp(24, 220.51, 13.88, 3.47, 0.46, 0.38, 6.23, 0.19, 0.68),
    sp(13, 64.07, 1.4, 19.7, 0.88, 0.27, 0.36, 0.47, 0.72),
    sp(35, 117.53, 7.31, 21.72, 0.3, 0.5, 98.69, 0.03, 0.29),
  ] },
  { name: 'Turbulent Runner', species: [
    sp(131, 177.1, 9.71, 30.06, 0.8, 0.43, 19.65, 0.45, 0.91),
    sp(169, 277.3, 14.67, 37.71, 0.68, 0.23, 77.01, 0.02, 0.31),
  ] },
  { name: 'Blobs', species: [
    sp(300, 20.8, 1.95, 20.75, 0.95, 0.99, 9.31, 0.05, 0.68),
  ] },
  { name: 'Linear Oscillator', species: [
    sp(133, 214.41, 17.93, 35.14, 0.64, 0.13, 0.29, 0.08, 0.97),
    sp(24, 253.6, 7.19, 15.51, 0.82, 0.33, 32.65, 0.34, 0.56),
  ] },
]

export const RECIPE_NAMES = RECIPES.map((r) => r.name) as [string, ...string[]]

/** The evolutionary sim seeds from a recipe OR a random "Primordial Soup". */
export const PRIMORDIAL_SOUP = 'Primordial Soup'
export const SEED_NAMES = [PRIMORDIAL_SOUP, ...RECIPE_NAMES] as [string, ...string[]]

/** Per-parameter maxima (Sayama's ranges), in genome order R,Vn,Vm,c1,c2,c3,c4,c5.
 *  Used to clamp mutation and to scale the random-soup genomes. */
export const PARAM_MAX = [300, 20, 40, 1, 1, 100, 0.5, 1] as const

export const recipeByName = (name: string): Recipe =>
  RECIPES.find((r) => r.name === name) ?? RECIPES[0]

/** Sayama's self-documenting species colour: (c1,c2,c3)→RGB, each scaled to its param
 *  max × 0.8. Used by the 'Recipe' colour mode. Returns 0..1 floats. */
export function recipeColor(s: Species): { r: number; g: number; b: number } {
  return {
    r: (s.c1 / 1.0) * 0.8,
    g: (s.c2 / 1.0) * 0.8,
    b: (s.c3 / 100.0) * 0.8,
  }
}
