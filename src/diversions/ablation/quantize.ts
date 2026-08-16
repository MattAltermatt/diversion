import { srgbToOklab, oklabToHex } from '../../framework/color'
import { mulberry32 } from '../../framework/rng'

// Turning a photograph into the same thing Ablation already eats: one palette
// INDEX per cell, plus the colours those indices mean.
//
// Clustering happens in OKLab, not sRGB — "like is grouped with like" is a
// statement about appearance, and sRGB distance does not measure appearance.
//
// Points are held as three parallel Float64Arrays rather than an array of
// {L,a,b} objects. At cellSize 2 on a 1080p canvas the grid is ~878x458, so the
// object form allocated 400k short-lived objects (~40MB) per call — and `colors`
// is a live slider with no debounce, so a single drag ran that nineteen times.

export interface Quantized {
  /** cols*rows palette indices. */
  idx: Uint8Array
  /** `colors` hex strings, ordered dark to light; idx[i] indexes this. */
  palette: string[]
}

const ITERATIONS = 15

/** Points the k-means itself runs over. Above this the centres are fitted to a
 *  decorrelated SAMPLE and then applied to every cell in one assignment pass.
 *
 *  This is not an approximation in any way that matters: the stored image is
 *  capped at 512px on its long edge (~175k pixels), so below cellSize 4 the
 *  "downsample" is really an UPSAMPLE — it manufactures cells carrying no
 *  information the source had, and then charges 15 Lloyd iterations for each of
 *  them. 20k points already over-samples the true colour distribution. */
const CLUSTER_SAMPLE = 20000

/** Stride through the grid for sampling. A plain `i += stride` walk aliases hard
 *  with row structure (every sample lands in the same few columns, so a picture
 *  with vertical banding trains on a slice of itself); stepping by a large prime
 *  modulo n decorrelates the walk from both dimensions. */
const WALK = 262147

/** The darkest band's floor in OKLab L.
 *
 *  Stretching centroid lightness across the full 0..1 puts the darkest band at
 *  L≈0 — at or below the ground (`#05070a` by default), so the cells that have
 *  NOT been destroyed yet are indistinguishable from the space where cells have.
 *  At `colors: 2` that is half the picture, and the turrets hunting that band are
 *  invisible too. It is the exact failure every hand-authored ramp is built to
 *  avoid (README: "every ramp deliberately stops short of the ground").
 *
 *  0.40 is not a taste pick. The shipped palettes' darkest stops span L 0.371
 *  (Ember) to 0.420 (Monochrome), mean 0.398 — so this sits exactly where the
 *  hand-authored ramps already sit. It was then checked the other way round: at
 *  L 0.40, the WORST case over the whole hue circle (chroma to 0.20) is WCAG
 *  1.955 against the default `#05070a` ground, which clears the 1.88 floor
 *  `render.ts` documents the parked-turret rows as depending on. Ember's own
 *  0.371 does NOT clear it here, because Ember is measured against its own
 *  darker `#070403`, and because a saturated centroid carries less relative
 *  luminance than a neutral at the same L (worst case is violet, ~#680395). */
const L_FLOOR = 0.40

interface Points {
  L: Float64Array
  a: Float64Array
  b: Float64Array
  n: number
}

/** Average every source pixel falling inside a cell. A hard reduction — a photo
 *  down to a few hundred cells across — so point-sampling would alias badly and
 *  drop any feature thinner than a cell. Averaging keeps a one-pixel stripe as a
 *  tint rather than losing it or letting it dominate. */
function downsample(
  img: { width: number; height: number; pixels: Uint8ClampedArray },
  cols: number,
  rows: number,
): Points {
  const n = cols * rows
  const p: Points = { L: new Float64Array(n), a: new Float64Array(n), b: new Float64Array(n), n }
  for (let row = 0; row < rows; row++) {
    const y0 = Math.floor((row * img.height) / rows)
    const y1 = Math.max(y0 + 1, Math.floor(((row + 1) * img.height) / rows))
    for (let col = 0; col < cols; col++) {
      const x0 = Math.floor((col * img.width) / cols)
      const x1 = Math.max(x0 + 1, Math.floor(((col + 1) * img.width) / cols))
      let r = 0, g = 0, bl = 0, k = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * img.width + x) * 4
          r += img.pixels[i]; g += img.pixels[i + 1]; bl += img.pixels[i + 2]
          k++
        }
      }
      const lab = srgbToOklab(r / k, g / k, bl / k)
      const at = row * cols + col
      p.L[at] = lab.L; p.a[at] = lab.a; p.b[at] = lab.b
    }
  }
  return p
}

/** Indices the clustering trains on — every point when the grid is small, a
 *  decorrelated walk when it is not. */
function trainingSet(n: number): Uint32Array {
  if (n <= CLUSTER_SAMPLE) {
    const all = new Uint32Array(n)
    for (let i = 0; i < n; i++) all[i] = i
    return all
  }
  const out = new Uint32Array(CLUSTER_SAMPLE)
  let at = 0
  for (let k = 0; k < CLUSTER_SAMPLE; k++) {
    at = (at + WALK) % n
    out[k] = at
  }
  return out
}

function dist2(p: Points, i: number, cL: number, ca: number, cb: number): number {
  const dL = p.L[i] - cL, da = p.a[i] - ca, db = p.b[i] - cb
  return dL * dL + da * da + db * db
}

/** k-means++ seeding: pick the first centre at random, then bias each subsequent
 *  pick toward points far from everything chosen so far. Uniform-random seeding
 *  regularly lands two centres inside one dominant mass and leaves a whole region
 *  of the image unrepresented. */
function seedCentres(p: Points, set: Uint32Array, k: number, rand: () => number) {
  const cL = new Float64Array(k), ca = new Float64Array(k), cb = new Float64Array(k)
  const first = set[Math.floor(rand() * set.length)]
  cL[0] = p.L[first]; ca[0] = p.a[first]; cb[0] = p.b[first]
  const best = new Float64Array(set.length).fill(Infinity)
  for (let c = 1; c < k; c++) {
    let total = 0
    for (let j = 0; j < set.length; j++) {
      const d = dist2(p, set[j], cL[c - 1], ca[c - 1], cb[c - 1])
      if (d < best[j]) best[j] = d
      total += best[j]
    }
    // A flat image has zero spread, so every candidate is distance 0 and the
    // roulette below never advances. Duplicate a point instead of looping forever.
    let pick: number
    if (total <= 0) {
      pick = set[Math.floor(rand() * set.length)]
    } else {
      let target = rand() * total
      let j = set.length - 1
      for (let t = 0; t < set.length; t++) {
        target -= best[t]
        if (target <= 0) { j = t; break }
      }
      pick = set[j]
    }
    cL[c] = p.L[pick]; ca[c] = p.a[pick]; cb[c] = p.b[pick]
  }
  return { cL, ca, cb }
}

/** Lift the centroid lightnesses into [L_FLOOR, 1], hue and chroma untouched.
 *  See L_FLOOR for why the bottom of the range is not 0. */
function stretch(cL: Float64Array): void {
  let lo = Infinity, hi = -Infinity
  for (const v of cL) { if (v < lo) lo = v; if (v > hi) hi = v }
  const span = hi - lo
  if (span < 1e-6) {
    // A single-tone image has nothing to spread. Put it at the top of the range
    // rather than leaving it wherever it fell — a uniformly dark photo would
    // otherwise render as an invisible picture on an invisible ground.
    cL.fill(1)
    return
  }
  for (let i = 0; i < cL.length; i++) {
    cL[i] = L_FLOOR + ((cL[i] - lo) / span) * (1 - L_FLOOR)
  }
}

export function quantize(
  img: { width: number; height: number; pixels: Uint8ClampedArray },
  cols: number,
  rows: number,
  colors: number,
  seed: number,
): Quantized {
  const p = downsample(img, cols, rows)
  const k = Math.max(1, Math.min(colors, 255))
  const rand = mulberry32(seed)
  const set = trainingSet(p.n)
  const { cL, ca, cb } = seedCentres(p, set, k, rand)

  const owner = new Uint8Array(set.length)
  for (let it = 0; it < ITERATIONS; it++) {
    for (let j = 0; j < set.length; j++) {
      let bestD = Infinity
      let bestK = 0
      for (let c = 0; c < k; c++) {
        const d = dist2(p, set[j], cL[c], ca[c], cb[c])
        if (d < bestD) { bestD = d; bestK = c }
      }
      owner[j] = bestK
    }
    const sL = new Float64Array(k), sA = new Float64Array(k)
    const sB = new Float64Array(k), count = new Uint32Array(k)
    for (let j = 0; j < set.length; j++) {
      const c = owner[j], i = set[j]
      sL[c] += p.L[i]; sA[c] += p.a[i]; sB[c] += p.b[i]; count[c]++
    }
    for (let c = 0; c < k; c++) {
      // An empty cluster keeps its previous centre rather than becoming NaN. It
      // stays in the palette: the viewer asked for k colours, and silently
      // returning fewer would make the band count a lie.
      if (count[c] === 0) continue
      cL[c] = sL[c] / count[c]; ca[c] = sA[c] / count[c]; cb[c] = sB[c] / count[c]
    }
  }

  // Order dark to light BEFORE stretching, matching the hand-authored ramps'
  // convention (outermost/darkest value first).
  const order = Array.from({ length: k }, (_, i) => i).sort((x, y) => cL[x] - cL[y])
  const rank = new Uint8Array(k)
  order.forEach((from, to) => { rank[from] = to })
  const oL = new Float64Array(k), oA = new Float64Array(k), oB = new Float64Array(k)
  order.forEach((from, to) => { oL[to] = cL[from]; oA[to] = ca[from]; oB[to] = cb[from] })
  stretch(oL)

  // One assignment pass over EVERY cell, using the fitted centres. This is what
  // makes the sampling above invisible in the output: the centres come from a
  // subset, but no cell is ever left unclassified.
  const idx = new Uint8Array(p.n)
  for (let i = 0; i < p.n; i++) {
    let bestD = Infinity
    let bestK = 0
    for (let c = 0; c < k; c++) {
      const d = dist2(p, i, cL[c], ca[c], cb[c])
      if (d < bestD) { bestD = d; bestK = c }
    }
    idx[i] = rank[bestK]
  }

  const palette: string[] = []
  for (let c = 0; c < k; c++) palette.push(oklabToHex({ L: oL[c], a: oA[c], b: oB[c] }))
  return { idx, palette }
}
