// The catalogue of REAL periodic three-body choreographies. Verified initial
// conditions from the equal-mass, zero-angular-momentum planar problem
// (G = m1 = m2 = m3 = 1):
//   • Šuvakov & Dmitrašinović, PRL 110, 114301 (2013) — most orbits.
//   • Simó's figure-eight (Chenciner–Montgomery 2000; Simó's high-precision state).
//
// Šuvakov convention: r1 = (−1,0), r2 = (1,0), r3 = (0,0); v1 = v2 = (vx,vy),
// v3 = (−2·vx, −2·vy). That gives zero net momentum and zero angular momentum,
// so each such orbit is fully described by just (vx, vy, T). The figure-eight is
// its OWN self-consistent state and does NOT use the ±1 convention.
//
// State layout matches integrator.ts: [x1,y1, x2,y2, x3,y3, vx1,vy1, vx2,vy2, vx3,vy3].
//
// CURATION NOTE: several published Šuvakov orbits (Yin-Yang II, Butterfly IV,
// and both long Li–Liao families) have genuine near-collision passages
// (min body-body separation < 5e-4) that a fixed-step RK4 cannot hold — they
// eject a body within one period at every timestep we can afford per frame. They
// are deliberately EXCLUDED so every catalogued orbit integrates cleanly and
// looks right. The 12 kept here conserve energy to < 1e-2 over a full period at
// the sim's 3e-5 step (verified in three-body.test.ts + an offline sweep).
//
// `bbox` is the [minX, minY, maxX, maxY] the orbit sweeps over one period,
// precomputed offline (a fine full-period integration) so the viewport-fit is
// instant and never re-integrates on orbit-enter / resize.

export interface OrbitDef {
  name: string
  /** Period in the natural time units (G = m = 1). */
  T: number
  /** Šuvakov-convention initial velocity (present unless `explicit` is given). */
  vx?: number
  vy?: number
  /** A full explicit 12-component initial state (figure-eight uses this). */
  explicit?: readonly number[]
  /** Precomputed one-period bounding box: [minX, minY, maxX, maxY]. */
  bbox: readonly [number, number, number, number]
}

// Ordered figure-eight first (the iconic one), then by ascending period so the
// short, quick-reading choreographies lead the screensaver cycle.
export const ORBITS: readonly OrbitDef[] = [
  {
    name: 'Figure-8',
    T: 6.32591398,
    explicit: [
      0.97000436, -0.24308753, // r1
      -0.97000436, 0.24308753, // r2
      0, 0, // r3
      0.4662036850, 0.4323657300, // v1
      0.4662036850, 0.4323657300, // v2
      -0.9324073700, -0.8647314600, // v3
    ],
    bbox: [-1.081, -0.358, 1.081, 0.358],
  },
  { name: 'Butterfly I', T: 6.2356, vx: 0.30689, vy: 0.12551, bbox: [-1.042, -0.175, 1.042, 0.175] },
  { name: 'Butterfly II', T: 7.0039, vx: 0.39295, vy: 0.09758, bbox: [-1.074, -0.174, 1.074, 0.174] },
  { name: 'Goggles', T: 10.4668, vx: 0.08330, vy: 0.12789, bbox: [-1.05, -0.738, 1.05, 0.738] },
  { name: 'Butterfly III', T: 13.8658, vx: 0.40592, vy: 0.23016, bbox: [-1.081, -0.477, 1.081, 0.477] },
  { name: 'Moth I', T: 14.8939, vx: 0.46444, vy: 0.39606, bbox: [-1.115, -1.137, 1.115, 1.137] },
  { name: 'Yin-Yang I', T: 17.3284, vx: 0.51394, vy: 0.30474, bbox: [-1.275, -1.064, 1.275, 1.064] },
  { name: 'Dragonfly', T: 21.2710, vx: 0.08058, vy: 0.58844, bbox: [-1.031, -0.895, 1.031, 0.902] },
  { name: 'Moth III', T: 25.8406, vx: 0.38344, vy: 0.37736, bbox: [-1.087, -0.887, 1.087, 0.887] },
  { name: 'Moth II', T: 28.6703, vx: 0.43917, vy: 0.45297, bbox: [-1.101, -1.16, 1.101, 1.16] },
  { name: 'Yarn', T: 55.5018, vx: 0.55906, vy: 0.34919, bbox: [-1.452, -1.498, 1.452, 1.497] },
  { name: 'Bumblebee', T: 63.5345, vx: 0.18428, vy: 0.58719, bbox: [-1.048, -1.159, 1.048, 1.159] },
] as const

// Literal-typed name tuple for the schema's `orbit` enum. Kept in lockstep with
// ORBITS by a co-located test (ORBITS.map(name) must deep-equal this).
export const ORBIT_NAMES = [
  'Figure-8',
  'Butterfly I',
  'Butterfly II',
  'Goggles',
  'Butterfly III',
  'Moth I',
  'Yin-Yang I',
  'Dragonfly',
  'Moth III',
  'Moth II',
  'Yarn',
  'Bumblebee',
] as const

export const CYCLE_ALL = 'Cycle all'

/** Expand a Šuvakov-convention (vx, vy) into the 12-component initial state. */
export function suvakovState(vx: number, vy: number): number[] {
  return [
    -1, 0, // r1
    1, 0, // r2
    0, 0, // r3
    vx, vy, // v1
    vx, vy, // v2
    -2 * vx, -2 * vy, // v3
  ]
}

/** The full initial state for an orbit as a fresh Float64Array (length 12). */
export function initialState(o: OrbitDef): Float64Array {
  if (o.explicit) return Float64Array.from(o.explicit)
  return Float64Array.from(suvakovState(o.vx as number, o.vy as number))
}

/** Index of an orbit by its display name, or -1. */
export function orbitIndexByName(name: string): number {
  return ORBITS.findIndex((o) => o.name === name)
}
