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

export interface NodeGene { present: boolean; x: number; y: number; mass: number }
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
}
export interface Genome { nodes: NodeGene[]; pairs: PairGene[]; wheels: WheelGene[] }

export interface GenomeRanges {
  nodeXMin: number; nodeXMax: number
  nodeYMin: number; nodeYMax: number
  nodeMassMin: number; nodeMassMax: number
  wheelRMin: number; wheelRMax: number
  gripMin: number; gripMax: number
  wheelMassMin: number; wheelMassMax: number
  motorSpeedMin: number; motorSpeedMax: number // forward only (≥ 0)
  torqueMin: number; torqueMax: number
}

// 🎚️ tunable defaults (meters / density / rad·s⁻¹). Wide ranges → varied, often
// absurd gen-1 cars so the junk→competent arc stays vivid.
export const DEFAULT_RANGES: GenomeRanges = {
  nodeXMin: -1.2, nodeXMax: 1.2,
  nodeYMin: -0.8, nodeYMax: 0.8,
  nodeMassMin: 0.5, nodeMassMax: 3,
  wheelRMin: 0.15, wheelRMax: 0.65,
  gripMin: 0.3, gripMax: 1.5,
  wheelMassMin: 0.5, wheelMassMax: 2,
  motorSpeedMin: 6, motorSpeedMax: 30,
  torqueMin: 50, torqueMax: 180,
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Flat slot for the unordered node pair (i,j), i≠j, in the N_PAIRS upper triangle. */
export function pairIndex(i: number, j: number): number {
  if (i > j) { const t = i; i = j; j = t }
  return i * MAX_NODES - (i * (i + 1)) / 2 + (j - i - 1)
}

export function randomGenome(rng: () => number, r: GenomeRanges = DEFAULT_RANGES): Genome {
  const nodes: NodeGene[] = Array.from({ length: MAX_NODES }, () => ({
    present: rng() < NODE_PRESENT_P,
    x: lerp(r.nodeXMin, r.nodeXMax, rng()),
    y: lerp(r.nodeYMin, r.nodeYMax, rng()),
    mass: lerp(r.nodeMassMin, r.nodeMassMax, rng()),
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
    mass: lerp(r.wheelMassMin, r.wheelMassMax, rng()),
    powered: rng() < POWERED_P,
    motorSpeed: lerp(r.motorSpeedMin, r.motorSpeedMax, rng()),
    torque: lerp(r.torqueMin, r.torqueMax, rng()),
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

export function crossover(a: Genome, b: Genome, rng: () => number): Genome {
  const pick = <T,>(x: T, y: T) => (rng() < 0.5 ? x : y)
  const nodes = a.nodes.map((n, i) => ({
    present: pick(n.present, b.nodes[i].present),
    x: pick(n.x, b.nodes[i].x),
    y: pick(n.y, b.nodes[i].y),
    mass: pick(n.mass, b.nodes[i].mass),
  }))
  const pairs = a.pairs.map((p, i) => ({
    stiffness: pick(p.stiffness, b.pairs[i].stiffness),
    damping: pick(p.damping, b.pairs[i].damping),
  }))
  const wheels = a.wheels.map((w, i) => ({
    present: pick(w.present, b.wheels[i].present),
    node: pick(w.node, b.wheels[i].node),
    radius: pick(w.radius, b.wheels[i].radius),
    grip: pick(w.grip, b.wheels[i].grip),
    mass: pick(w.mass, b.wheels[i].mass),
    powered: pick(w.powered, b.wheels[i].powered),
    motorSpeed: pick(w.motorSpeed, b.wheels[i].motorSpeed),
    torque: pick(w.torque, b.wheels[i].torque),
  }))
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
  }))
  return repair({ nodes, pairs, wheels })
}
