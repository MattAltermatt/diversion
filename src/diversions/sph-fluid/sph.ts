// Smoothed-Particle Hydrodynamics (Müller 2003) — a weakly-compressible 2D liquid
// that pools under gravity, sloshes when the tank tilts, splashes and settles with
// a wobbling surface. Pure + framework-agnostic (no canvas/DOM) so it unit-tests
// headless. The renderer (render.ts) reads this state; index.ts wires the loop.
//
// Everything runs in a fixed SIM box (BOX_H tall, width = BOX_H·aspect) that the
// renderer scales to the canvas — SPH constants are radius-relative, so decoupling
// the sim from the pixel size keeps the physics identical at any resolution.
//
// STABILITY (SPH is finicky — see the headline probe test): fixed sub-timestep,
// non-negative pressure (no tensile → no clumping blowup), a hard velocity clamp
// (CFL: a particle never crosses more than ~⅓ of the smoothing radius per step),
// and reflecting walls with damping. Even the most violent user settings stay
// bounded because the clamp is unconditional.

import { mulberry32 } from '../../framework/rng'

// ── Fixed sim scale ────────────────────────────────────────────────────────
export const BOX_H = 600 // sim-space height; width derives from canvas aspect
const H = 22 // smoothing radius (sim units) — the fluid's "feature scale"
const H2 = H * H
const REST_SPACING = H * 0.5 // initial inter-particle spacing (well inside H)
const SIM_DT = 0.004 // fixed integration sub-step (seconds)
const MAX_SUBSTEPS = 6 // cap per frame → no spiral-of-death on a slow tab
const WALL_EPS = H * 0.35 // keep particle centres this far off the walls
const WALL_DAMP = 0.4 // normal-velocity retained on a wall bounce (0..1)

// 2D smoothing-kernel normalisation coefficients (poly6 density; spiky pressure
// gradient; viscosity laplacian). Precomputed from H.
const POLY6 = 4 / (Math.PI * Math.pow(H, 8))
const SPIKY_GRAD = 30 / (Math.PI * Math.pow(H, 5)) // |∇W_spiky| coefficient
const VISC_LAP = 40 / (Math.PI * Math.pow(H, 5))

// Rest density measured from a perfect lattice at REST_SPACING (mass=1), then MASS
// chosen so a well-packed region sits at ρ0 = 1 — keeps every downstream number ~1.
function latticeRestDensity(): number {
  let sum = 0
  const reach = Math.ceil(H / REST_SPACING)
  for (let gx = -reach; gx <= reach; gx++) {
    for (let gy = -reach; gy <= reach; gy++) {
      const r2 = (gx * REST_SPACING) ** 2 + (gy * REST_SPACING) ** 2
      if (r2 < H2) sum += POLY6 * (H2 - r2) ** 3
    }
  }
  return sum
}
const REST_DENSITY = 1
const MASS = REST_DENSITY / latticeRestDensity()

/** Tunable physics knobs the schema maps its sliders onto (per-frame live). */
export interface SphParams {
  stiffness: number // gas constant k: pressure = k·(ρ − ρ0)
  viscosity: number // μ: velocity-diffusion strength
  gravity: number // |g| in sim units/s²
  tiltAngle: number // current gravity tilt (radians); the loop sways this
}

export interface Fluid {
  n: number
  px: Float32Array
  py: Float32Array
  vx: Float32Array
  vy: Float32Array
  rho: Float32Array
  pressure: Float32Array
  speed: Float32Array // |v| per particle, for speed-coloured rendering
  boxW: number
  boxH: number
  // linked-list uniform spatial hash (cell = H); rebuilt each sub-step, no alloc
  gw: number
  gh: number
  heads: Int32Array
  next: Int32Array
  acc: number // fixed-step accumulator (seconds)
}

/** Max speed a particle may hold — CFL-style clamp so it never tunnels a cell. */
const VMAX = (H / SIM_DT) * 0.33

function makeGrid(fluid: Fluid) {
  fluid.gw = Math.max(1, Math.ceil(fluid.boxW / H) + 1)
  fluid.gh = Math.max(1, Math.ceil(fluid.boxH / H) + 1)
  const cells = fluid.gw * fluid.gh
  if (!fluid.heads || fluid.heads.length !== cells) fluid.heads = new Int32Array(cells)
}

/** Seed N particles as a packed block against the left wall (a dam) so the first
 *  seconds collapse into a splashing wave, then settle into a sloshing pool.
 *  Deterministic: positions + jitter come from the seeded stream. */
export function createFluid(count: number, seed: number, boxW: number, boxH: number): Fluid {
  const rng = mulberry32((seed ^ 0x5f356495) >>> 0)
  const n = count
  const fluid: Fluid = {
    n,
    px: new Float32Array(n), py: new Float32Array(n),
    vx: new Float32Array(n), vy: new Float32Array(n),
    rho: new Float32Array(n), pressure: new Float32Array(n),
    speed: new Float32Array(n),
    boxW, boxH,
    gw: 0, gh: 0, heads: new Int32Array(0), next: new Int32Array(n),
    acc: 0,
  }
  // Dam block: left ~48% of the box, as tall as needed to hold N at REST_SPACING.
  const blockW = boxW * 0.48
  const cols = Math.max(1, Math.floor(blockW / REST_SPACING))
  const s = REST_SPACING
  for (let i = 0; i < n; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const jx = (rng() - 0.5) * s * 0.2
    const jy = (rng() - 0.5) * s * 0.2
    fluid.px[i] = WALL_EPS + col * s + s * 0.5 + jx
    // stack upward from the floor so it starts as a settled column, not mid-air
    fluid.py[i] = boxH - WALL_EPS - row * s - s * 0.5 + jy
  }
  makeGrid(fluid)
  return fluid
}

/** Resize the sim box (aspect change). Keep particles inside the new width. */
export function resizeFluid(fluid: Fluid, boxW: number, boxH: number) {
  fluid.boxW = boxW
  fluid.boxH = boxH
  const maxX = boxW - WALL_EPS
  for (let i = 0; i < fluid.n; i++) {
    if (fluid.px[i] > maxX) fluid.px[i] = maxX
    if (fluid.py[i] > boxH - WALL_EPS) fluid.py[i] = boxH - WALL_EPS
  }
  makeGrid(fluid)
}

function cellOf(fluid: Fluid, x: number, y: number): number {
  let cx = Math.floor(x / H)
  let cy = Math.floor(y / H)
  if (cx < 0) cx = 0; else if (cx >= fluid.gw) cx = fluid.gw - 1
  if (cy < 0) cy = 0; else if (cy >= fluid.gh) cy = fluid.gh - 1
  return cy * fluid.gw + cx
}

function rebuildGrid(fluid: Fluid) {
  fluid.heads.fill(-1)
  const { px, py, next, heads } = fluid
  for (let i = 0; i < fluid.n; i++) {
    const c = cellOf(fluid, px[i], py[i])
    next[i] = heads[c]
    heads[c] = i
  }
}

/** One fixed-dt SPH sub-step: density/pressure → forces → integrate → walls. */
function substep(fluid: Fluid, p: SphParams) {
  const { px, py, vx, vy, rho, pressure, next, heads, gw, gh } = fluid
  const n = fluid.n
  rebuildGrid(fluid)

  // (1) density + pressure. poly6 over the 3×3 cell neighbourhood.
  for (let i = 0; i < n; i++) {
    const xi = px[i], yi = py[i]
    const cx = Math.min(gw - 1, Math.max(0, Math.floor(xi / H)))
    const cy = Math.min(gh - 1, Math.max(0, Math.floor(yi / H)))
    let dens = 0
    for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox
      if (gx < 0 || gx >= gw) continue
      for (let oy = -1; oy <= 1; oy++) {
        const gy = cy + oy
        if (gy < 0 || gy >= gh) continue
        let j = heads[gy * gw + gx]
        while (j !== -1) {
          const dx = px[j] - xi, dy = py[j] - yi
          const r2 = dx * dx + dy * dy
          if (r2 < H2) dens += MASS * POLY6 * (H2 - r2) ** 3
          j = next[j]
        }
      }
    }
    rho[i] = dens
    // non-negative pressure: no tensile stress → no free-surface clumping blowup
    const pr = p.stiffness * (dens - REST_DENSITY)
    pressure[i] = pr > 0 ? pr : 0
  }

  // (2) forces → acceleration → integrate (semi-implicit Euler).
  const gx0 = Math.sin(p.tiltAngle) * p.gravity
  const gy0 = Math.cos(p.tiltAngle) * p.gravity // +y is down; tilt sways it
  for (let i = 0; i < n; i++) {
    const xi = px[i], yi = py[i], vxi = vx[i], vyi = vy[i]
    const rhoi = rho[i], pi = pressure[i]
    const cx = Math.min(gw - 1, Math.max(0, Math.floor(xi / H)))
    const cy = Math.min(gh - 1, Math.max(0, Math.floor(yi / H)))
    let fx = 0, fy = 0
    for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox
      if (gx < 0 || gx >= gw) continue
      for (let oy = -1; oy <= 1; oy++) {
        const gy = cy + oy
        if (gy < 0 || gy >= gh) continue
        let j = heads[gy * gw + gx]
        while (j !== -1) {
          if (j !== i) {
            const dx = xi - px[j], dy = yi - py[j] // from j → i
            const r2 = dx * dx + dy * dy
            if (r2 < H2 && r2 > 1e-6) {
              const r = Math.sqrt(r2)
              const rhoj = rho[j]
              // pressure (repulsive along j→i)
              const grad = SPIKY_GRAD * (H - r) * (H - r)
              const pforce = (MASS * (pi + pressure[j]) / (2 * rhoj)) * grad
              fx += (dx / r) * pforce
              fy += (dy / r) * pforce
              // viscosity (velocity diffusion toward neighbour)
              const vlap = p.viscosity * MASS * VISC_LAP * (H - r) / rhoj
              fx += (vx[j] - vxi) * vlap
              fy += (vy[j] - vyi) * vlap
            }
          }
          j = next[j]
        }
      }
    }
    // accel = pressure+visc force / ρ  +  gravity (body force → direct accel)
    let ax = fx / rhoi + gx0
    let ay = fy / rhoi + gy0
    let nvx = vxi + ax * SIM_DT
    let nvy = vyi + ay * SIM_DT
    // hard velocity clamp (CFL) — unconditional, keeps every run bounded
    const sp2 = nvx * nvx + nvy * nvy
    if (sp2 > VMAX * VMAX) {
      const s = VMAX / Math.sqrt(sp2)
      nvx *= s; nvy *= s
    }
    vx[i] = nvx; vy[i] = nvy
  }

  // (3) advect + reflect off walls.
  const maxX = fluid.boxW - WALL_EPS
  const maxY = fluid.boxH - WALL_EPS
  for (let i = 0; i < n; i++) {
    let x = px[i] + vx[i] * SIM_DT
    let y = py[i] + vy[i] * SIM_DT
    if (x < WALL_EPS) { x = WALL_EPS; vx[i] = -vx[i] * WALL_DAMP }
    else if (x > maxX) { x = maxX; vx[i] = -vx[i] * WALL_DAMP }
    if (y < WALL_EPS) { y = WALL_EPS; vy[i] = -vy[i] * WALL_DAMP }
    else if (y > maxY) { y = maxY; vy[i] = -vy[i] * WALL_DAMP }
    px[i] = x; py[i] = y
    fluid.speed[i] = Math.hypot(vx[i], vy[i])
  }
}

/** Advance by real elapsed `dtMs` using a fixed-step accumulator (deterministic
 *  + frame-rate independent). Returns the number of sub-steps taken. */
export function stepFluid(fluid: Fluid, p: SphParams, dtMs: number): number {
  fluid.acc += Math.min(dtMs, 100) / 1000 // clamp huge dt (tab refocus) to 100ms
  let steps = 0
  while (fluid.acc >= SIM_DT && steps < MAX_SUBSTEPS) {
    substep(fluid, p)
    fluid.acc -= SIM_DT
    steps++
  }
  if (steps === MAX_SUBSTEPS) fluid.acc = 0 // drop backlog, never spiral
  return steps
}

/** Deterministic fixed-step advance for tests (no accumulator, no dt clamp). */
export function stepFluidFixed(fluid: Fluid, p: SphParams, subSteps: number) {
  for (let k = 0; k < subSteps; k++) substep(fluid, p)
}

export const _internals = { H, MASS, REST_DENSITY, VMAX, SIM_DT, latticeRestDensity }
