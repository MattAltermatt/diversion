/** The thickness field: a vorticity–streamfunction fluid, marginal-regeneration
 *  nucleation, and a conservative gravity flux. Pure — no GL, no `Math.random`, no
 *  wall clock.
 *
 *  ⚠️ Marginal regeneration, NOT gravity, is what thins a mobile soap film. Measured
 *  (arXiv 2401.03931), Poiseuille drainage predicts ~4000 s for a fringe that really
 *  takes ~10 s — 400x too slow, and alone it gives smooth bands with none of the
 *  character. Thin patches nucleate at the bottom and side Plateau borders and, being
 *  lighter per unit area, RISE. `mobility` interpolates to the rigid-interface regime,
 *  which is a real interface state (add a co-surfactant), not a tuning position.
 */

export interface FilmParams {
  /** 0 = rigid interface (smooth Poiseuille bands), 1 = mobile (rising plumes). */
  mobility: number
  drainRate: number
  /** nm. Also the normaliser for buoyancy, the flux and the thickness ceiling. */
  filmThickness: number
}

export interface Film {
  cols: number
  rows: number
  h: Float32Array
  w: Float32Array
  psi: Float32Array
  /** scratch, reused every step — the sim allocates nothing after `createFilm`. */
  h2: Float32Array
  w2: Float32Array
  psi2: Float32Array
  u: Float32Array
  v: Float32Array
  rng: () => number
  nucAcc: number
  age: number
}

/** nm. Below this the film reflects essentially nothing — Newton black film. */
export const BLACK_NM = 28

/** The grid is a fixed cell COUNT, not a fixed cell size (the Salvage #319 lesson), so
 *  the film's grain scales with the display like a vector drawing instead of getting
 *  finer on a 4K wall.
 *
 *  ⚠️ And there is deliberately NO user-facing detail knob. A `Coarse/Normal/Fine`
 *  control was specified and measured: even after nucleation was made area-based it
 *  still moved time-to-black by 1.6x (109 s / 93 s / 147 s), because a one-cell
 *  advection stencil and a one-cell smoothing kernel cover different physical distances
 *  at different resolutions. Salvage #319 settled this: a knob that exists only because
 *  the sim has a grid is not a knob — derive the count and delete the control. */
export const TARGET_CELLS = 41_000

/** ⚠️ `dt` is clamped at 50 ms by the framework and `tempo` reaches 6x, so a step can
 *  be asked for 0.30 s. Above this the smoothing term saturates its own clamp and
 *  framerate independence is gone, so split the step rather than trusting the clamps. */
export const MAX_SUBSTEP = 0.02

/** The grid every rate constant below is calibrated against. */
const REF_CELLS = 200 * 126

/** nm per second at drainRate 1. See step 6b. */
const EVAP_NM_PER_S = 1.1

const JACOBI = 14

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function gridFor(width: number, height: number): { cols: number; rows: number } {
  const target = TARGET_CELLS
  const aspect = width / height
  const rows = Math.max(8, Math.round(Math.sqrt(target / aspect)))
  const cols = Math.max(8, Math.round(target / rows))
  return { cols, rows }
}

export function createFilm(cols: number, rows: number, seed: number, p: FilmParams): Film {
  const n = cols * rows
  const f: Film = {
    cols,
    rows,
    h: new Float32Array(n),
    w: new Float32Array(n),
    psi: new Float32Array(n),
    h2: new Float32Array(n),
    w2: new Float32Array(n),
    psi2: new Float32Array(n),
    u: new Float32Array(n),
    v: new Float32Array(n),
    rng: mulberry32(seed),
    nucAcc: 0,
    age: 0,
  }
  formFilm(f, p)
  return f
}

export function formFilm(f: Film, p: FilmParams): void {
  const H0 = p.filmThickness
  for (let y = 0; y < f.rows; y++) {
    const fy = y / (f.rows - 1)
    for (let x = 0; x < f.cols; x++) {
      const i = y * f.cols + x
      f.h[i] = H0 * (0.88 + 0.17 * fy) * (0.98 + 0.05 * f.rng())
      f.w[i] = 0
      f.psi[i] = 0
    }
  }
  f.nucAcc = 0
  f.age = 0
}

export function stepFilm(f: Film, p: FilmParams, dtSeconds: number): void {
  if (!(dtSeconds > 0)) return
  const n = Math.max(1, Math.ceil(dtSeconds / MAX_SUBSTEP))
  const sub = dtSeconds / n
  for (let i = 0; i < n; i++) subStep(f, p, sub)
  f.age += dtSeconds
}

function subStep(f: Film, p: FilmParams, dt: number): void {
  const { cols, rows, h, w, u, v } = f
  const H0 = p.filmThickness
  const mob = Math.max(0, Math.min(1, p.mobility))
  const cells = cols * rows
  const areaScale = cells / REF_CELLS

  // 1. Baroclinic vorticity. Thin film is LIGHT, so a horizontal thickness gradient
  //    tips the fluid over and plumes grow. This one line is the whole difference
  //    between sliding bands and a swirling film.
  const buoy = 58 * mob
  const decay = Math.pow(0.5, dt / 9)
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x
      const dbdx = (h[i - 1] - h[i + 1]) / (2 * H0)
      w[i] = (w[i] + dt * buoy * dbdx) * decay
    }
  }

  // 2. Poisson solve for the stream function.
  let psi = f.psi
  let psi2 = f.psi2
  for (let k = 0; k < JACOBI; k++) {
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x
        psi2[i] = 0.25 * (psi[i - 1] + psi[i + 1] + psi[i - cols] + psi[i + cols] + w[i])
      }
    }
    const t = psi
    psi = psi2
    psi2 = t
    for (let x = 0; x < cols; x++) {
      psi[x] = 0
      psi[(rows - 1) * cols + x] = 0
    }
    for (let y = 0; y < rows; y++) {
      psi[y * cols] = 0
      psi[y * cols + cols - 1] = 0
    }
  }
  f.psi = psi
  f.psi2 = psi2

  // 3. Velocity from the stream function. ⚠️ Gravity is NOT added here: as a velocity
  //    it slides the whole field down, clamps it at the bottom, and FLATTENS the
  //    thickness gradient instead of steepening it — and a flat film is one colour
  //    everywhere. It belongs in the conservative flux at step 6.
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x
      u[i] = (psi[i + cols] - psi[i - cols]) * 0.5
      v[i] = -(psi[i + 1] - psi[i - 1]) * 0.5
    }
  }

  // 4. Semi-Lagrangian advection of thickness and vorticity.
  const { h2, w2 } = f
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      let sx = x - dt * u[i] * 9
      let sy = y - dt * v[i] * 9
      sx = sx < 0.5 ? 0.5 : sx > cols - 1.5 ? cols - 1.5 : sx
      sy = sy < 0.5 ? 0.5 : sy > rows - 1.5 ? rows - 1.5 : sy
      const x0 = sx | 0
      const y0 = sy | 0
      const fx = sx - x0
      const fy = sy - y0
      const a = y0 * cols + x0
      const b = a + 1
      const c = a + cols
      const d = c + 1
      const w00 = (1 - fx) * (1 - fy)
      const w10 = fx * (1 - fy)
      const w01 = (1 - fx) * fy
      const w11 = fx * fy
      h2[i] = h[a] * w00 + h[b] * w10 + h[c] * w01 + h[d] * w11
      w2[i] = w[a] * w00 + w[b] * w10 + w[c] * w01 + w[d] * w11
    }
  }
  h.set(h2)
  w.set(w2)

  // 5. Marginal regeneration: thin patches nucleate at the bottom and side Plateau
  //    borders and step 1 carries them up.
  //
  //    ⚠️ Rate and radius are specified per unit AREA, not per cell. With a fixed
  //    `24/s` and a radius in cells the thinned fraction per second is inversely
  //    proportional to the cell count — measured at the three shipped grid settings,
  //    the film reached black at 227 s / 489 s / never, so a control labelled "detail"
  //    was silently a pace control and on the finest grid the piece never ended.
  if (mob > 0) {
    // ⚠️ The RATE must NOT scale with the cell count now that the radius is a frame
    //    fraction. A patch covers pi*k^2*cols/rows of the frame regardless of
    //    resolution, so scaling the rate as well over-corrects — measured, it inverted
    //    the bug rather than fixing it: time-to-black went 98 s / 54 s / 26 s across
    //    Coarse / Normal / Fine instead of 227 / 489 / never.
    f.nucAcc += dt * 24 * mob
    while (f.nucAcc > 1) {
      f.nucAcc -= 1
      const edge = f.rng()
      let cx: number
      let cy: number
      if (edge < 0.62) {
        cx = 2 + f.rng() * (cols - 4)
        cy = rows - 2 - f.rng() * 3
      } else if (edge < 0.81) {
        cx = 1 + f.rng() * 3
        cy = rows * (0.35 + 0.65 * f.rng())
      } else {
        cx = cols - 5 + f.rng() * 3
        cy = rows * (0.35 + 0.65 * f.rng())
      }
      const rad = (0.017 + 0.027 * f.rng()) * cols
      const thin = 0.34 + 0.3 * f.rng()
      const x0 = Math.max(1, Math.floor(cx - rad))
      const x1 = Math.min(cols - 2, Math.ceil(cx + rad))
      const y0 = Math.max(1, Math.floor(cy - rad))
      const y1 = Math.min(rows - 2, Math.ceil(cy + rad))
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx
          const dy = y - cy
          const d2 = dx * dx + dy * dy
          if (d2 > rad * rad) continue
          const i = y * cols + x
          const g = 1 - Math.sqrt(d2) / rad
          h[i] *= 1 - (1 - thin) * g
          if (h[i] < BLACK_NM * 0.5) h[i] = BLACK_NM * 0.5
        }
      }
    }
  }

  // 6. Gravity drainage as a CONSERVATIVE vertical flux. Poiseuille flow between the
  //    two surfaces gives q proportional to h^3, so thick film drains far faster than
  //    thin — which is why the gradient sharpens instead of averaging out. A uniform
  //    sink does the opposite and the screen ends up one flat colour.
  //
  //    ⚠️ `mobility` interpolates this constant too. The mockup's mode toggle switched
  //    THREE things — buoyancy, nucleation rate and the drain coefficient — and mapping
  //    only the first two leaves the rigid regime draining 2.5x too slowly.
  const K = dt * p.drainRate * (0.06 + (0.024 - 0.06) * mob)
  const ceiling = 4 * H0
  for (let x = 0; x < cols; x++) {
    let qPrev = 0
    for (let y = 0; y < rows; y++) {
      const i = y * cols + x
      const r = h[i] / H0
      let q = K * r * r * r * H0
      // ⚠️ CFL: an unclamped q can exceed a cell's whole contents in one step.
      const cap = 0.2 * h[i]
      if (q > cap) q = cap
      h[i] += qPrev - q
      if (!(h[i] > 0.5)) h[i] = 0.5 // also catches NaN
      else if (h[i] > ceiling) h[i] = ceiling
      qPrev = q
    }
  }

  // 6b. Evaporation. ⚠️ Not decoration — it is what gives a RIGID film a finite life.
  //     Measured without it, at mobility 0 the film never reached any ending condition
  //     in 30 simulated minutes: Poiseuille drainage alone really is ~400x too slow, so
  //     the rigid preset would have run until an age ceiling cut it off, which is the
  //     same "a gate that cannot be reached" bug the rupture trigger already had once.
  //     It is also the literature's own answer: for large films evaporation, not
  //     drainage, sets the lifetime, at a measured 1-10 nm/s.
  const evap = dt * EVAP_NM_PER_S * p.drainRate
  for (let i = 0; i < h.length; i++) {
    h[i] -= evap
    if (h[i] < 0.5) h[i] = 0.5
  }

  // 7. Surface-tension smoothing. ⚠️ Scaled by dt, never per frame — at a flat 0.10
  //    per frame this ran 60x a second and homogenised the field inside half a minute,
  //    which reads as "the screen is one flat colour". And scaled by the cell count,
  //    because a one-cell stencil diffuses a shorter PHYSICAL distance on a finer grid.
  const sm = Math.min(0.2, 0.4 * dt * Math.sqrt(areaScale))
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x
      h2[i] = h[i] + sm * (0.25 * (h[i - 1] + h[i + 1] + h[i - cols] + h[i + cols]) - h[i])
    }
  }
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x
      h[i] = h2[i]
    }
  }
}

/** Bilinear resample onto a new grid. A resize must not re-form the film. */
export function resampleFilm(f: Film, cols: number, rows: number): Film {
  const out: Film = {
    ...f,
    cols,
    rows,
    h: new Float32Array(cols * rows),
    w: new Float32Array(cols * rows),
    psi: new Float32Array(cols * rows),
    h2: new Float32Array(cols * rows),
    w2: new Float32Array(cols * rows),
    psi2: new Float32Array(cols * rows),
    u: new Float32Array(cols * rows),
    v: new Float32Array(cols * rows),
  }
  for (let y = 0; y < rows; y++) {
    const sy = rows === 1 ? 0 : (y / (rows - 1)) * (f.rows - 1)
    const y0 = Math.min(f.rows - 1, sy | 0)
    const y1 = Math.min(f.rows - 1, y0 + 1)
    const fy = sy - y0
    for (let x = 0; x < cols; x++) {
      const sx = cols === 1 ? 0 : (x / (cols - 1)) * (f.cols - 1)
      const x0 = Math.min(f.cols - 1, sx | 0)
      const x1 = Math.min(f.cols - 1, x0 + 1)
      const fx = sx - x0
      out.h[y * cols + x] =
        f.h[y0 * f.cols + x0] * (1 - fx) * (1 - fy) +
        f.h[y0 * f.cols + x1] * fx * (1 - fy) +
        f.h[y1 * f.cols + x0] * (1 - fx) * fy +
        f.h[y1 * f.cols + x1] * fx * fy
    }
  }
  return out
}

export function meanThickness(f: Film): number {
  let s = 0
  for (let i = 0; i < f.h.length; i++) s += f.h[i]
  return s / f.h.length
}

export function blackFraction(f: Film, thresholdNm: number): number {
  let n = 0
  for (let i = 0; i < f.h.length; i++) if (f.h[i] < thresholdNm) n++
  return n / f.h.length
}

/** Mean over rows of the within-row variance of `h`, normalised by that row's mean.
 *  The regime metric: a rigid film is stratified into horizontal bands and has almost
 *  none; a mobile one is stirred and has a lot. */
export function horizontalVar(f: Film): number {
  let total = 0
  for (let y = 0; y < f.rows; y++) {
    let m = 0
    for (let x = 0; x < f.cols; x++) m += f.h[y * f.cols + x]
    m /= f.cols
    if (m <= 0) continue
    let s = 0
    for (let x = 0; x < f.cols; x++) {
      const d = f.h[y * f.cols + x] - m
      s += d * d
    }
    total += s / f.cols / m
  }
  return total / f.rows
}
