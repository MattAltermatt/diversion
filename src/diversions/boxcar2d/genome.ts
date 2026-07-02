/**
 * genome.ts — the evolvable spring-truss car genome (#156).
 *
 * Fixed-length with present-toggles so the GA's uniform per-gene crossover keeps
 * working: 7 node slots, a 21-slot node-pair table (stiffness/damping), 6 wheel
 * slots. A car's actual node/wheel COUNT is how many slots are toggled on — random
 * at birth (3–7 nodes, 1–6 wheels), drifting via toggle mutation. Which node-pairs
 * are real members is NOT a gene — it's derived by Delaunay triangulation (car.ts);
 * the pair table is only consulted for pairs that end up as members.
 *
 * `repair` keeps every genome valid (≥3 nodes, ≥1 wheel, wheels on active nodes)
 * with NO rng, so crossover/mutation stay reproducible (share-link determinism).
 */
export const MAX_NODES = 7
export const MIN_NODES = 3
export const MAX_WHEELS = 6
export const MIN_WHEELS = 1
export const N_PAIRS = (MAX_NODES * (MAX_NODES - 1)) / 2 // 21

// Birth toggle probabilities (not user-facing; tuned for varied gen-1 junk).
const NODE_PRESENT_P = 0.7
const WHEEL_PRESENT_P = 0.55
const POWERED_P = 0.7

export interface NodeGene {
  present: boolean
  x: number
  y: number
  mass: number
  radius: number // collision-disc size (m) — was the fixed NODE_RADIUS
  friction: number // node-vs-terrain friction — was the fixed NODE_FRICTION
}
export interface PairGene { stiffness: number; damping: number } // both 0..1
export interface WheelGene {
  present: boolean
  node: number // slot index of the node it mounts to
  radius: number
  grip: number
  mass: number
  powered: boolean
  motorSpeed: number // forward drive speed (rad/s), always ≥ 0
  torque: number
  // suspension — previously the fixed WHEEL_HERTZ/DAMPING/TRAVEL + vertical axis.
  // Ranges stay inside the anti-jitter-safe band (see DEFAULT_RANGES) so widening
  // these into genes can't reintroduce the wobble/bounce the constants killed.
  suspensionHertz: number // spring stiffness (Hz)
  suspensionDamping: number // damping ratio (≥ 0.85 = never bouncy)
  suspensionAxis: number // rake angle (rad) off vertical; axis = (sin θ, cos θ)
  suspensionTravel: number // axle travel cap (m)
}
export interface Genome { nodes: NodeGene[]; pairs: PairGene[]; wheels: WheelGene[] }

export interface GenomeRanges {
  nodeXMin: number; nodeXMax: number
  nodeYMin: number; nodeYMax: number
  nodeMassMin: number; nodeMassMax: number
  nodeRadiusMin: number; nodeRadiusMax: number
  nodeFrictionMin: number; nodeFrictionMax: number
  wheelRMin: number; wheelRMax: number
  gripMin: number; gripMax: number
  wheelMassMin: number; wheelMassMax: number
  motorSpeedMin: number; motorSpeedMax: number // forward only (≥ 0)
  torqueMin: number; torqueMax: number
  // suspension — anti-jitter-safe bands (damping floor kept above the bouncy 0.7;
  // hertz capped under the truss buzz limit; axis a visible ±30° rake; travel a few cm).
  suspHertzMin: number; suspHertzMax: number
  suspDampingMin: number; suspDampingMax: number
  suspAxisMin: number; suspAxisMax: number // radians off vertical
  suspTravelMin: number; suspTravelMax: number
}

// 🎚️ tunable defaults (meters / density / rad·s⁻¹). Wide ranges → varied, often
// absurd gen-1 cars so the junk→competent arc stays vivid.
export const DEFAULT_RANGES: GenomeRanges = {
  nodeXMin: -1.2, nodeXMax: 1.2,
  nodeYMin: -0.8, nodeYMax: 0.8,
  // node mass is DENSITY on a small (r≈0.1) disc, so the range must run high for a
  // chassis to outweigh the (much larger-area) wheels — otherwise the wheel-joint
  // motor's reaction just spins the light chassis instead of driving the wheels,
  // and no car can climb (measured: light chassis 25 m vs heavy chassis 619 m).
  nodeMassMin: 2, nodeMassMax: 40,
  nodeRadiusMin: 0.06, nodeRadiusMax: 0.16, // < typical node spacing → Delaunay stays sane
  nodeFrictionMin: 0.10, nodeFrictionMax: 1.00, // no resonance risk either end → fully open
  wheelRMin: 0.15, wheelRMax: 0.65,
  gripMin: 0.3, gripMax: 1.5,
  wheelMassMin: 0.3, wheelMassMax: 1.2, // lighter rims → the chassis can dominate the mass budget
  motorSpeedMin: 6, motorSpeedMax: 30,
  torqueMin: 50, torqueMax: 180,
  // Stiffness/damping floors + a short travel ceiling keep the SOFT extreme from
  // overshooting the (soft) joint limit under hard impacts — i.e. no wheel slides
  // off its node anchor (the fling-off the original 4Hz/1.0/0.06 config prevented).
  suspHertzMin: 3.5, suspHertzMax: 6, // sub-range of truss HERTZ; wheel buzz reads worse → narrow
  suspDampingMin: 0.85, suspDampingMax: 1.00, // floor above the bouncy 0.7; ceiling = critically damped
  suspAxisMin: -0.52, suspAxisMax: 0.52, // ±30° rake; beyond loses vertical compliance
  suspTravelMin: 0.03, suspTravelMax: 0.09, // non-zero floor (else shock → buzz); short ceiling = stays attached
}

// 🎚️ Evolution ceilings: the mutation clamp table. Identical to the birth table
// EXCEPT the three genes measured to bind a fast car (torque / motorSpeed / wheel
// radius) get raised ceilings — so a car BORN tame can still EVOLVE far more
// powerful. randomGenome keeps drawing from DEFAULT_RANGES (slow, junky gen-1);
// only mutate()'s clamp uses this in the live GA. grip is untouched (it evolves
// DOWN — measured), and the anti-jitter suspension bands are untouched.
export const EVOLVE_RANGES: GenomeRanges = {
  ...DEFAULT_RANGES,
  torqueMax: 500,
  motorSpeedMax: 60,
  wheelRMax: 0.85,
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Flat slot for the unordered node pair (i,j), i≠j, in the N_PAIRS upper triangle. */
export function pairIndex(i: number, j: number): number {
  if (i > j) { const t = i; i = j; j = t }
  return i * MAX_NODES - (i * (i + 1)) / 2 + (j - i - 1)
}

// Informed-prior skews for the RANDOM genome only (mutation still roams the full
// range, so "everything evolvable" holds). Birth cars start physically plausible —
// a heavy chassis over light wheels — so most of gen 1 can actually drive/climb
// instead of being motor-spun blobs. `skewHi`/`skewLo` bias a uniform draw toward
// the top / bottom of a range without ever leaving it.
const skewHi = (rng: () => number) => 0.5 + 0.5 * rng() // → upper half of the range
const skewLo = (rng: () => number) => 0.5 * rng()       // → lower half of the range

export function randomGenome(rng: () => number, r: GenomeRanges = DEFAULT_RANGES): Genome {
  const nodes: NodeGene[] = Array.from({ length: MAX_NODES }, () => ({
    present: rng() < NODE_PRESENT_P,
    x: lerp(r.nodeXMin, r.nodeXMax, rng()),
    y: lerp(r.nodeYMin, r.nodeYMax, rng()),
    mass: lerp(r.nodeMassMin, r.nodeMassMax, skewHi(rng)), // heavy chassis (prior)
    radius: lerp(r.nodeRadiusMin, r.nodeRadiusMax, rng()),
    friction: lerp(r.nodeFrictionMin, r.nodeFrictionMax, rng()),
  }))
  const pairs: PairGene[] = Array.from({ length: N_PAIRS }, () => ({
    // skew stiffness toward 1 so MOST members are rigid bars and springs are a
    // rarity (≈1 in 7) — keeps cars from being jittery spring-balls. (rng**0.3)
    stiffness: rng() ** 0.3,
    damping: rng(),
  }))
  const wheels: WheelGene[] = Array.from({ length: MAX_WHEELS }, () => ({
    present: rng() < WHEEL_PRESENT_P,
    node: Math.floor(rng() * MAX_NODES),
    radius: lerp(r.wheelRMin, r.wheelRMax, rng()),
    grip: lerp(r.gripMin, r.gripMax, rng()),
    mass: lerp(r.wheelMassMin, r.wheelMassMax, skewLo(rng)), // light rims (prior)
    powered: rng() < POWERED_P,
    motorSpeed: lerp(r.motorSpeedMin, r.motorSpeedMax, rng()),
    torque: lerp(r.torqueMin, r.torqueMax, rng()),
    suspensionHertz: lerp(r.suspHertzMin, r.suspHertzMax, rng()),
    suspensionDamping: lerp(r.suspDampingMin, r.suspDampingMax, rng()),
    suspensionAxis: lerp(r.suspAxisMin, r.suspAxisMax, rng()),
    suspensionTravel: lerp(r.suspTravelMin, r.suspTravelMax, rng()),
  }))
  return repair({ nodes, pairs, wheels })
}

/** Force a genome valid: ≥MIN_NODES nodes, ≥MIN_WHEELS wheels, every active wheel
 *  on an active node. Pure + deterministic (no rng) so breeding stays reproducible. */
export function repair(g: Genome): Genome {
  let active = g.nodes.filter(n => n.present).length
  for (let i = 0; i < MAX_NODES && active < MIN_NODES; i++) {
    if (!g.nodes[i].present) { g.nodes[i].present = true; active++ }
  }
  let wActive = g.wheels.filter(w => w.present).length
  for (let i = 0; i < MAX_WHEELS && wActive < MIN_WHEELS; i++) {
    if (!g.wheels[i].present) { g.wheels[i].present = true; wActive++ }
  }
  const presentNodes = g.nodes.map((n, i) => (n.present ? i : -1)).filter(i => i >= 0)
  const nearest = (target: number, pool: number[]) =>
    pool.reduce((best, idx) => (Math.abs(idx - target) < Math.abs(best - target) ? idx : best), pool[0])
  const usedNodes = new Set<number>()
  for (const w of g.wheels) {
    if (!w.present) continue
    // snap to an active node if it points at an absent slot
    if (!g.nodes[w.node]?.present) w.node = nearest(w.node, presentNodes)
    // one wheel per node: if this node is taken, move to the nearest free active
    // node; if every active node already hosts a wheel, drop this wheel (so a car
    // never stacks concentric wheels on a single anchor).
    if (usedNodes.has(w.node)) {
      const free = presentNodes.filter(i => !usedNodes.has(i))
      if (free.length === 0) { w.present = false; continue }
      w.node = nearest(w.node, free)
    }
    usedNodes.add(w.node)
  }
  return g
}

/**
 * Subassembly-aware crossover. The truss is brutally epistatic — toggling one
 * node's `present` re-runs the Delaunay triangulation and rewires the whole
 * structure — so the old uniform per-gene pick routinely shattered good cars
 * (measured: 31/40 crossovers produced a child worse than BOTH parents). This
 * inherits coherent UNITS instead: a node's whole record, a strut tied to an
 * endpoint's source, and a wheel that travels with its mount node. Deterministic
 * (fixed rng-call order) and repair-compatible.
 */
export function crossover(a: Genome, b: Genome, rng: () => number): Genome {
  // Pass 1 — whole-NODE inheritance: each slot's entire record (incl. radius /
  // friction) comes from ONE parent, never split.
  const nodeFromA = a.nodes.map(() => rng() < 0.5)
  const nodes = a.nodes.map((n, i) => ({ ...(nodeFromA[i] ? n : b.nodes[i]) }))
  // Pass 2 — a strut (i,j) follows its LOWER-index endpoint's node source
  // (reuses nodeFromA, no extra rng), keeping its tuning coherent with a node it joins.
  const pairs = a.pairs.map(p => ({ ...p }))
  for (let i = 0; i < MAX_NODES; i++)
    for (let j = i + 1; j < MAX_NODES; j++) {
      const src = nodeFromA[i] ? a : b
      pairs[pairIndex(i, j)] = { ...src.pairs[pairIndex(i, j)] }
    }
  // Pass 3 — wheel SUBASSEMBLY: the wheel mounted on node i travels with node i's
  // source parent, so a tuned mount (motor + grip + suspension) survives as one unit.
  const wheels: WheelGene[] = []
  for (let i = 0; i < MAX_NODES && wheels.length < MAX_WHEELS; i++) {
    if (!nodes[i].present) continue
    const src = nodeFromA[i] ? a : b
    const w = src.wheels.find(w => w.present && w.node === i)
    if (w) wheels.push({ ...w, node: i })
  }
  // Pass 4 — fill any remaining slots by a per-slot coin flip over the raw parent
  // arrays (keeps wheel-count diversity; gives repair() raw material).
  let j = 0
  while (wheels.length < MAX_WHEELS) {
    wheels.push({ ...(rng() < 0.5 ? a.wheels[j] : b.wheels[j]) }); j++
  }
  return repair({ nodes, pairs, wheels })
}

export function mutate(g: Genome, rate: number, rng: () => number, r: GenomeRanges = DEFAULT_RANGES): Genome {
  const jit = (v: number, lo: number, hi: number) =>
    rng() < rate ? clamp(v + (rng() * 2 - 1) * (hi - lo) * 0.25, lo, hi) : v
  const flip = (b: boolean) => (rng() < rate ? !b : b)
  const nodes = g.nodes.map(n => ({
    present: flip(n.present),
    x: jit(n.x, r.nodeXMin, r.nodeXMax),
    y: jit(n.y, r.nodeYMin, r.nodeYMax),
    mass: jit(n.mass, r.nodeMassMin, r.nodeMassMax),
    radius: jit(n.radius, r.nodeRadiusMin, r.nodeRadiusMax),
    friction: jit(n.friction, r.nodeFrictionMin, r.nodeFrictionMax),
  }))
  const pairs = g.pairs.map(p => ({
    stiffness: jit(p.stiffness, 0, 1),
    damping: jit(p.damping, 0, 1),
  }))
  const wheels = g.wheels.map(w => ({
    present: flip(w.present),
    node: rng() < rate ? Math.floor(rng() * MAX_NODES) : w.node,
    radius: jit(w.radius, r.wheelRMin, r.wheelRMax),
    grip: jit(w.grip, r.gripMin, r.gripMax),
    mass: jit(w.mass, r.wheelMassMin, r.wheelMassMax),
    powered: flip(w.powered),
    motorSpeed: jit(w.motorSpeed, r.motorSpeedMin, r.motorSpeedMax),
    torque: jit(w.torque, r.torqueMin, r.torqueMax),
    suspensionHertz: jit(w.suspensionHertz, r.suspHertzMin, r.suspHertzMax),
    suspensionDamping: jit(w.suspensionDamping, r.suspDampingMin, r.suspDampingMax),
    suspensionAxis: jit(w.suspensionAxis, r.suspAxisMin, r.suspAxisMax),
    suspensionTravel: jit(w.suspensionTravel, r.suspTravelMin, r.suspTravelMax),
  }))
  return repair({ nodes, pairs, wheels })
}
