import { srgbToOklab, oklabToHex, hexToRgb } from '../../framework/color'
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
  /** cols*rows palette indices. Meaningless where `coverage` is 0. */
  idx: Uint8Array
  /** `colors` hex strings, ordered dark to light; idx[i] indexes this. */
  palette: string[]
  /** cols*rows flags; 1 = the source had opaque pixels here, 0 = void.
   *
   *  A void cell is not a colour — it is space. The field starts those cells
   *  already dead, so a turret's beam crosses them and strikes the first covered
   *  cell beyond. This is what lets a sprite with a transparent surround read as
   *  an object floating in the frame rather than as a rectangle with a
   *  background-coloured band around it. Fully opaque sources are all 1s. */
  coverage: Uint8Array
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

/** WCAG contrast the darkest band must clear against the ground. `render.ts`
 *  documents the parked-turret rows as depending on this. */
const MIN_CONTRAST = 1.88

/** Chroma the floor is probed at. Beyond the sRGB gamut on purpose — `oklabToHex`
 *  clamps, and the clamped hex is what actually gets drawn, so this measures the
 *  real worst case rather than a model of it. */
const PROBE_CHROMA = 0.32

/** Highest floor worth returning. Above this `stretch` has no range left to spread
 *  bands across and the picture flattens to one tone; better to accept a slightly
 *  low contrast than to destroy the picture entirely. */
const CEILING = 0.72

function relLum(hex: string): number {
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = hexToRgb(hex) // 0..1 floats
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The darkest band's floor in OKLab L, DERIVED from the ground it will sit on.
 *
 *  This used to be the constant `L_FLOOR = 0.40`, which was calibrated against the
 *  near-black `#05070a` the piece shipped with — and only against that. Warm the
 *  ground up and a band at 0.40 sinks into it: measured 1.47 against `#2a2520`,
 *  well under the 1.88 floor, which is exactly the vanishing-darkest-band failure
 *  every hand-authored ramp is built to avoid. Solving per-background instead
 *  keeps the guarantee whatever ground the viewer picks.
 *
 *  Binary search over L at worst-case chroma across the hue circle: a saturated
 *  violet carries the least relative luminance at a given OKLab L, so testing the
 *  whole circle rather than a neutral is what makes this a bound rather than an
 *  average. ~1400 cheap ops, once per quantization. */
export function contrastFloor(background: string): number {
  // A LINEAR SCAN, not a bisection. Contrast against a fixed ground is V-shaped in
  // L — it falls to 1.0 at the ground's own luminance and rises on both sides — so
  // the predicate "clears 1.88" is not monotone and bisection is only valid for a
  // dark ground. On a light-grey ground it converged to L = 1.0, which collapsed
  // every band into the top of the range and made the matte BRIGHTER than the
  // artwork: a white slab. Scanning up from black and taking the first L that
  // clears is correct on both sides, and on a light ground it correctly returns a
  // DARK floor rather than a light one.
  const STEP = 0.002
  let first = -1
  for (let L = 0; L <= CEILING; L += STEP) {
    if (clearsAt(L, background)) { first = L; break }
  }
  if (first < 0) return CEILING
  if (first >= L_FLOOR) return first
  // The dark side clears before the historical floor is reached, which happens on
  // a light ground. Prefer L_FLOOR when it ALSO clears — that keeps the shipped
  // look on dark grounds unchanged — but do not clamp blindly: on a genuinely
  // light ground L_FLOOR sits in the dead zone around the ground's own luminance,
  // and clamping to it would return a floor that fails the very test this solves.
  return clearsAt(L_FLOOR, background) ? L_FLOOR : first
}

/** The lightest band's CEILING in OKLab L, the mirror of `contrastFloor`.
 *
 *  On a dark ground this is 1 and nothing changes — white is maximally legible on
 *  black. On a light ground it is the floor problem inverted: `stretch` spreads
 *  bands up to L 1, and a near-white band on a near-white ground is exactly as
 *  invisible as a near-black one on black. Pre-existing (the shipped `stretch`
 *  always ran to 1), but reachable from the free colour picker, so it is closed
 *  here rather than left as a trap for whoever next warms the ground. */
export function contrastCeiling(background: string): number {
  const STEP = 0.002
  for (let L = 1; L >= 0; L -= STEP) {
    if (clearsAt(L, background)) return L
  }
  return 1
}

/** Does a band at this lightness clear the contrast floor at every hue? */
function clearsAt(L: number, background: string): boolean {
  for (let d = 0; d < 360; d += 15) {
    const h = (d * Math.PI) / 180
    // Probe at a chroma beyond the sRGB gamut and let `oklabToHex` clamp: the
    // emitted hex is what actually gets drawn, so measuring THAT makes this a real
    // bound. Probing at 0.20 did not — sRGB primaries reach C ≈ 0.31 in OKLab and
    // `stretch` moves only L, leaving a/b untouched, so a saturated centroid
    // (exactly what pixel art produces) could land under the promised floor.
    const c = oklabToHex({ L, a: PROBE_CHROMA * Math.cos(h), b: PROBE_CHROMA * Math.sin(h) })
    if (contrast(c, background) < MIN_CONTRAST) return false
  }
  return true
}

interface Points {
  L: Float64Array
  a: Float64Array
  b: Float64Array
  n: number
}

/** Alpha at or above which a source pixel counts as picture rather than as void.
 *  A hard cut rather than a blend: a cell is either something a turret can shoot
 *  or it is empty space, and there is no half-alive cell in the simulation. */
const ALPHA_CUT = 128

/** Where the source sits inside the cell grid.
 *
 *  `fit` preserves the source's aspect and centres it, which is what a SPRITE
 *  wants — a 16×16 character stretched to a 1.65:1 grid would be unrecognisable,
 *  and the surround is transparent anyway, so it costs nothing. `fit: false`
 *  stretches to fill, which is the behaviour the upload path shipped with and
 *  what a photograph wants. */
function fitRect(imgW: number, imgH: number, cols: number, rows: number, fit: boolean) {
  if (!fit) return { x0: 0, y0: 0, w: cols, h: rows }
  const s = Math.min(cols / imgW, rows / imgH)
  const w = Math.max(1, Math.min(cols, Math.round(imgW * s)))
  const h = Math.max(1, Math.min(rows, Math.round(imgH * s)))
  return { x0: Math.floor((cols - w) / 2), y0: Math.floor((rows - h) / 2), w, h }
}

/** Average every source pixel falling inside a cell. A hard reduction — a photo
 *  down to a few hundred cells across — so point-sampling would alias badly and
 *  drop any feature thinner than a cell. Averaging keeps a one-pixel stripe as a
 *  tint rather than losing it or letting it dominate.
 *
 *  Note the inverse case, which is what a small sprite hits: when the source is
 *  SMALLER than the grid, each cell spans exactly one source pixel (the `x0 + 1`
 *  floor below), so the average IS that pixel and the artist's palette survives
 *  intact. That is also why turning `cellSize` down on a 16×16 sprite reveals no
 *  new detail — there is none to reveal, only more cells per sprite pixel.
 *
 *  Transparent pixels are excluded from the average AND from coverage: a cell
 *  with no opaque source pixel is void, not a colour. Without this the void would
 *  be handed to k-means as a real colour, win itself a cluster, and become a band
 *  the turrets hunt. */
function downsample(
  img: { width: number; height: number; pixels: Uint8ClampedArray },
  cols: number,
  rows: number,
  fit: boolean,
): { p: Points; coverage: Uint8Array } {
  const n = cols * rows
  const p: Points = { L: new Float64Array(n), a: new Float64Array(n), b: new Float64Array(n), n }
  const coverage = new Uint8Array(n)
  const rect = fitRect(img.width, img.height, cols, rows, fit)

  for (let row = rect.y0; row < rect.y0 + rect.h; row++) {
    const ry = row - rect.y0
    const y0 = Math.floor((ry * img.height) / rect.h)
    const y1 = Math.max(y0 + 1, Math.floor(((ry + 1) * img.height) / rect.h))
    for (let col = rect.x0; col < rect.x0 + rect.w; col++) {
      const rx = col - rect.x0
      const x0 = Math.floor((rx * img.width) / rect.w)
      const x1 = Math.max(x0 + 1, Math.floor(((rx + 1) * img.width) / rect.w))
      let r = 0, g = 0, bl = 0, k = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * img.width + x) * 4
          if (img.pixels[i + 3] < ALPHA_CUT) continue
          r += img.pixels[i]; g += img.pixels[i + 1]; bl += img.pixels[i + 2]
          k++
        }
      }
      if (k === 0) continue // void: coverage stays 0, L/a/b stay 0 and are never read
      const lab = srgbToOklab(r / k, g / k, bl / k)
      const at = row * cols + col
      p.L[at] = lab.L; p.a[at] = lab.a; p.b[at] = lab.b
      coverage[at] = 1
    }
  }
  return { p, coverage }
}

/** Indices the clustering trains on — every COVERED point when there are few, a
 *  decorrelated walk over the covered list when there are many. Training on void
 *  cells would drag every centroid toward whatever colour the transparent pixels
 *  happen to carry. */
function trainingSet(covered: Uint32Array): Uint32Array {
  const n = covered.length
  if (n <= CLUSTER_SAMPLE) return covered
  const out = new Uint32Array(CLUSTER_SAMPLE)
  let at = 0
  for (let k = 0; k < CLUSTER_SAMPLE; k++) {
    at = (at + WALK) % n
    out[k] = covered[at]
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
function stretch(cL: Float64Array, floor: number, ceiling: number): void {
  let lo = Infinity, hi = -Infinity
  for (const v of cL) { if (v < lo) lo = v; if (v > hi) hi = v }
  const span = hi - lo
  if (span < 1e-6) {
    // A single-tone image has nothing to spread. Put it at the top of the range
    // rather than leaving it wherever it fell — a uniformly dark photo would
    // otherwise render as an invisible picture on an invisible ground.
    cL.fill(ceiling)
    return
  }
  for (let i = 0; i < cL.length; i++) {
    cL[i] = floor + ((cL[i] - lo) / span) * (ceiling - floor)
  }
}

export function quantize(
  img: { width: number; height: number; pixels: Uint8ClampedArray },
  cols: number,
  rows: number,
  colors: number,
  seed: number,
  /** Preserve the source's aspect and centre it, rather than stretching to fill.
   *  A sprite wants this; a photograph does not. */
  fit = false,
  /** The ground the picture will sit on. The darkest band's floor is solved
   *  against it, so a warmer or lighter background does not swallow the band. */
  background = '#05070a',
  /** Fill the void with a MATTE band rather than leaving it empty, so the picture
   *  is a solid rectangle the turrets have to clear rather than a floating
   *  silhouette. The matte becomes band 0 and every image colour shifts up one, so
   *  the band count is `colors + 1`.
   *
   *  The matte is a NEUTRAL at the contrast floor: neutral so it reads as a card
   *  behind the sprite rather than as another of its colours, and at the floor so
   *  it is the darkest thing above the ground — clearing it has to be visible, or
   *  the turrets would be doing invisible work over most of the frame. */
  matte = false,
): Quantized {
  const { p, coverage } = downsample(img, cols, rows, fit)
  const k = Math.max(1, Math.min(colors, 255))
  const rand = mulberry32(seed)

  // Clustering runs over covered cells only. A fully transparent source would
  // leave this empty, which would make the k-means++ seed read undefined — return
  // an all-void picture instead, which `newPicture` treats as no picture at all.
  // Two passes into a typed array rather than pushing into a boxed JS array and
  // copying. On a fully opaque source at cellSize 2 the grid is ~400k cells, and
  // the boxed form cost 6.8ms and ~5MB of transient garbage per call — on a slider
  // with no debounce, so a single `colors` drag paid it nineteen times.
  let coveredCount = 0
  for (let i = 0; i < p.n; i++) if (coverage[i]) coveredCount++
  if (coveredCount === 0) {
    return { idx: new Uint8Array(p.n), palette: Array.from({ length: k }, () => '#000000'), coverage }
  }
  const covered = new Uint32Array(coveredCount)
  for (let i = 0, at = 0; i < p.n; i++) if (coverage[i]) covered[at++] = i

  const set = trainingSet(covered)
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
  // With a matte, the image bands are lifted clear of it: the matte sits AT the
  // floor and the artwork starts above, so the sprite's own dark outline cannot
  // land on the same tone as the card behind it and dissolve into it. Without the
  // gap the silhouette blurs into the matte and the picture stops reading.
  const floor = contrastFloor(background)
  const ceiling = contrastCeiling(background)
  const MATTE_GAP = 0.14
  // Both ends are clamped so a pathological ground can never invert the range.
  const lowEnd = matte ? Math.min(ceiling - 0.05, floor + MATTE_GAP) : floor
  stretch(oL, Math.min(lowEnd, ceiling - 0.02), ceiling)

  // One assignment pass over every COVERED cell, using the fitted centres. This is
  // what makes the sampling above invisible in the output: the centres come from a
  // subset, but no covered cell is ever left unclassified. Void cells keep index 0
  // and are never drawn — `coverage` is what decides that, not the index.
  const idx = new Uint8Array(p.n)
  for (let j = 0; j < covered.length; j++) {
    const i = covered[j]
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

  if (!matte) return { idx, palette, coverage }

  // Shift every image colour up one and put the matte at index 0, so a void cell
  // becomes a real band instead of a hole. Coverage goes all-1s: the whole
  // rectangle is now alive and has to be cleared.
  const shifted = new Uint8Array(p.n)
  for (let i = 0; i < p.n; i++) shifted[i] = coverage[i] ? idx[i] + 1 : 0
  const matteHex = oklabToHex({ L: floor, a: 0, b: 0 })
  return {
    idx: shifted,
    palette: [matteHex, ...palette],
    coverage: new Uint8Array(p.n).fill(1),
  }
}
