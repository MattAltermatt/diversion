import { mulberry32 } from '../../framework/rng'
import type { Size } from '../../framework/types'
import { buildField, type Field } from './field'
import { buildFront, frontCell, killCell, exposedHistogram, type Front } from './front'
import { temperedPick, resolveFleet, allocateFleet } from './scheduler'
import { makeGeom, makeTurret, resetTurret, advance, trackPoint, type Geom, type Turret } from './turrets'
import type { AblationConfig } from './schema'

// State assembly and the per-frame step. No drawing happens here — render.ts owns
// the canvas, this owns what is true.

/** A cell mid-death: it shrinks toward its own centre while draining to black. */
export interface Dying {
  cell: number
  col: number
  row: number
  band: number
  /** seconds elapsed */
  t: number
}

/** A strike, drawn as a brief hard line from the turret to the cell it killed. */
export interface Bolt {
  x0: number
  y0: number
  x1: number
  y1: number
  band: number
  /** the firing turret's charge fraction — a nearly-spent turret lands a dim bolt */
  intensity: number
  t: number
}

export interface AblationState {
  cfg: AblationConfig
  geom: Geom
  field: Field
  front: Front
  /** turrets riding right now */
  track: Turret[]
  /** turrets waiting at the gate for a free slot, FIFO, all at full charge */
  queue: Turret[]
  /** turrets whose colour is gone for this picture — out of rotation until the next */
  retired: Turret[]
  /** alive cells per band. Maintained incrementally on every kill: a recount is
   *  O(cells) and `rotate` needs the answer on every gate crossing. */
  bandAlive: Uint32Array
  /** the colour the whole crew is hunting in Unison mode; -1 in Mixed */
  lockBand: number
  dying: Dying[]
  bolts: Bolt[]
  hist: Uint32Array
  rand: () => number
  /** how many pictures have been fully consumed */
  pictures: number
  /** turrets minted since this picture was crewed. Only ever used to keep the
   *  sub-cell entry jitter unique — see `makeTurret`. A turret added by a live fleet
   *  resize must continue the sequence rather than restart it, or it lands on an
   *  existing turret's jitter and the two weld together for the rest of the run. */
  minted: number
  /** distance the last-released turret still has to travel before the gate reopens */
  gateClear: number
  /** cells killed since render last synced the picture buffer */
  patches: number[]
  buffer: HTMLCanvasElement | null
  size: Size
}

const DYING_S = 0.26
const BOLT_S = 0.11
/** Backstop only. `frame()` calls step() and render() in the same tick and render
 *  always drains the list, so in the shipped host this holds one frame of kills
 *  (measured max 17) and never trips. It exists so a future caller that steps
 *  without rendering degrades to one rebuild instead of growing without bound —
 *  note that rebuild is not free, so this is a safety net, not a cheap valve. */
const PATCH_LIMIT = 20000

function newField(cfg: AblationConfig, geom: Geom, generation: number): Field {
  return buildField({
    seed: cfg.seed + generation,
    cols: geom.cols,
    rows: geom.rows,
    bands: cfg.palette.length,
    featureSize: cfg.featureSize,
    roughness: cfg.roughness,
  })
}

export function createState(cfg: AblationConfig, size: Size): AblationState {
  const geom = makeGeom(size, cfg.cellSize, cfg.trackOffset)
  const field = newField(cfg, geom, 0)
  const s: AblationState = {
    cfg,
    geom,
    field,
    front: buildFront(field),
    track: [],
    queue: [],
    retired: [],
    bandAlive: new Uint32Array(field.bands),
    lockBand: -1,
    dying: [],
    bolts: [],
    hist: new Uint32Array(field.bands),
    rand: mulberry32(cfg.seed),
    pictures: 0,
    minted: 0,
    gateClear: 0,
    patches: [],
    buffer: null,
    size,
  }
  crew(s)
  return s
}

const PHI = 0.618033988749895

/** How many turrets should exist right now: the two counts the viewer controls,
 *  floored per targeting mode. See `resolveFleet` for why the floor is Mixed-only. */
function fleetTarget(s: AblationState): number {
  const minTotal = s.cfg.targeting === 'Mixed' ? s.field.bands : 1
  return resolveFleet(s.cfg.capacity, s.cfg.queued, minTotal)
}

/** Mints one turret at the back of the queue. The jitter walks a golden-ratio
 *  sequence keyed on a counter that survives a live fleet resize — two turrets
 *  sharing a jitter and released in the same frame (which is every release at
 *  Spacing 0) would be welded together for life. */
function mint(s: AblationState, band: number): Turret {
  const t = makeTurret(((++s.minted * PHI) % 1) * s.geom.cell, band, s.cfg.charge)
  s.queue.push(t)
  return t
}

/** Builds the fleet for the picture now in `s.field` and puts all of it in the
 *  queue. A turret is never used up, so this runs once per picture rather than once
 *  per arrival.
 *
 *  Colour is allocated in proportion to the WHOLE picture rather than to what is
 *  currently exposed: 50% of the map blue means 50% of the turrets blue. Measured
 *  over 5 seeds at both 6 and 12 bands, every band is exposed at picture start — the
 *  picture is several nested stacks side by side, so every band reaches the border
 *  somewhere — which is what makes a whole-picture allocation safe. No turret starts
 *  with nothing to shoot. */
function crew(s: AblationState): void {
  const bands = s.field.bands
  const total = new Uint32Array(bands)
  // Count only cells that are still ALIVE. At picture start that is every cell, so
  // the opening is unchanged — but `crew()` also runs on a live Fleet/Targeting edit
  // and on resize, and counting dead cells there resurrects extinct bands in
  // `bandAlive`. Both retirement tests (`rotate`, and the queue sweep in `step`) key
  // on `bandAlive[band] === 0`, so a single mid-picture slider drag would switch
  // retirement off for the rest of the picture AND allocate turrets to bands that
  // are already gone — turrets that can never fire, and so cycle forever holding
  // track slots. Filtering here fixes the allocation and the retirement test at once.
  for (let i = 0; i < s.field.idx.length; i++) if (s.field.alive[i]) total[s.field.idx[i]]++
  s.bandAlive = total.slice()

  s.track.length = 0
  s.queue.length = 0
  s.retired.length = 0
  s.minted = 0
  const size = fleetTarget(s)

  if (s.cfg.targeting === 'Unison') {
    // Unison crews the WHOLE fleet onto one exposed band immediately. The lock is
    // otherwise only applied in `rotate`, which means a freshly crewed picture would
    // wear the proportional Mixed split and converge only as turrets cycle — so the
    // mode looks exactly like Mixed on load and, at low Track speed, effectively
    // forever (a lap at speed 2 is ~25 minutes). Picking the lock here is what makes
    // "all the turrets are that colour" true from the first frame.
    const hist = new Uint32Array(bands)
    exposedHistogram(s.field, s.front, hist)
    s.lockBand = temperedPick(hist, s.cfg.targetingBias, s.rand)
    for (let n = 0; n < size; n++) mint(s, Math.max(0, s.lockBand))
  } else {
    const alloc = allocateFleet(total, s.cfg.targetingBias, size)
    for (let b = 0; b < bands; b++) {
      for (let i = 0; i < alloc[b]; i++) mint(s, b)
    }
    // Shuffle, or the gate releases every turret of band 0 before any of band 1 and
    // the opening minutes of a picture are monochrome. Unison needs no shuffle — the
    // crew is one colour by construction.
    for (let i = s.queue.length - 1; i > 0; i--) {
      const j = Math.floor(s.rand() * (i + 1))
      ;[s.queue[i], s.queue[j]] = [s.queue[j], s.queue[i]]
    }
    s.lockBand = -1
  }
  s.gateClear = 0
}

/** How many turrets are still hunting `band` — riding the track or waiting in the
 *  queue. The retired row does not count: those are out of rotation for this picture
 *  and cover nothing. */
function covering(s: AblationState, band: number): number {
  let n = 0
  for (const t of s.track) if (t.band === band) n++
  for (const t of s.queue) if (t.band === band) n++
  return n
}

/** Reconciles the fleet to `fleetTarget` after a live "Turrets on track" / "In queue"
 *  edit, WITHOUT clearing the track. A full `crew()` is simpler but empties the ring
 *  back to the gate, and "Turrets on track" is the slider most likely to be dragged —
 *  a pop there is the one place that is unaffordable.
 *
 *  The two modes reconcile differently, for the same reason their floors differ: Mixed
 *  must preserve per-band coverage and Unison has none to preserve. Both cases are
 *  argued at their branch below.
 *
 *  Surplus comes off the QUEUE and the retired row only. A turret already riding
 *  keeps its shift and sheds at the gate instead (see `rotate`), which means the
 *  total can sit above target for a shift — harmless, and it converges. */
function resizeCrew(s: AblationState): void {
  // The picture is already gone and the track is draining for the quiet beat. There is
  // no live band to allocate against — `allocateFleet` returns all zeros when nothing
  // is alive, which would mint nothing and trim the whole queue away — and there is
  // nothing to reallocate FOR, since `crew()` rebuilds the fleet for the next picture
  // moments later. Leave it alone. The drain is not always brief: it lasts until the
  // last turret crosses the gate, which at Track speed 2 is a lap, ~25 minutes.
  if (s.field.aliveCount === 0) return

  const bands = s.field.bands
  const target = fleetTarget(s)

  // Retired turrets hunt colours that are gone from this picture, and `rotate` can
  // never shed them since they are not on the track. They are pure surplus, so they
  // go before anything still in rotation is touched.
  while (s.track.length + s.queue.length + s.retired.length > target && s.retired.length > 0) {
    s.retired.pop()
  }

  if (s.cfg.targeting === 'Unison') {
    // No per-band coverage to respect — one lock band covers everything — so a plain
    // tail trim is safe here, and it is also the RIGHT thing: reallocating the queue
    // onto the current lock would teleport the colour transition that the mode sells
    // as its tell ("a crew converts as its turrets rotate, so a switch shows up in the
    // queue before it reaches the track", `schema.ts`). Dragging a SIZE slider must not
    // recolour turrets that are merely surplus. New turrets take the lock; existing
    // ones keep their colour and convert on their own rotation, as documented.
    while (s.track.length + s.queue.length > target && s.queue.length > 0) s.queue.pop()
    for (let i = s.track.length + s.queue.length; i < target; i++) mint(s, Math.max(0, s.lockBand))
    return
  }

  // Mixed reconciles PER BAND rather than trimming a tail. An arbitrary tail trim can
  // take the last turret hunting a live colour, and nothing else destroys that
  // colour's cells, so the picture would never finish and the piece would hang — the
  // exact failure `resolveFleet`'s floor exists to prevent, reached by the back door.
  // Reusing `allocateFleet` gets coverage for free: it reserves one turret per
  // surviving band before sharing the rest out. The basis is the same one `crew` uses
  // minus the cells already destroyed, so the split still describes what is on screen.
  const want = allocateFleet(s.bandAlive, s.cfg.targetingBias, target)
  const have = new Uint32Array(bands)
  for (const t of s.track) have[t.band]++
  for (const t of s.queue) have[t.band]++

  for (let i = s.queue.length - 1; i >= 0; i--) {
    const b = s.queue[i].band
    if (have[b] > want[b]) {
      s.queue.splice(i, 1)
      have[b]--
    }
  }
  for (let b = 0; b < bands; b++) for (let i = have[b]; i < want[b]; i++) mint(s, b)
}

/** A turret leaving the track. It is NEVER destroyed: it goes back to the gate at
 *  full charge and joins the BACK of the queue — or the retired row, if the colour
 *  it hunts no longer exists anywhere in this picture and it would otherwise ride
 *  shift after shift with nothing to shoot. */
function rotate(s: AblationState, t: Turret): void {
  // …unless the fleet has been shrunk under it. A live "Turrets on track" / "In
  // queue" edit sheds its surplus HERE rather than deleting turrets where they ride:
  // nothing may ever appear or disappear mid-track (spec §4), so a surplus turret
  // finishes its shift and then simply does not rejoin. `t` is already out of
  // `s.track` at this point, hence the +1.
  //
  // It must never shed the LAST turret covering a colour that is still standing:
  // nothing else destroys that colour's cells, so the picture would never finish and
  // the piece would hang (see `resolveFleet`). Riding one shift over target is
  // harmless by comparison — the surplus comes off at the next rotation that is safe.
  if (s.track.length + s.queue.length + s.retired.length + 1 > fleetTarget(s)
      && (s.bandAlive[t.band] === 0 || covering(s, t.band) > 0)) return
  resetTurret(t, s.cfg.charge)
  // Unison: a rotating turret takes the engine's current target. Applied HERE and
  // nowhere else, so a switch shows up first as a new colour entering the back of
  // the queue while the track still works the old one.
  if (s.cfg.targeting === 'Unison' && s.lockBand >= 0) t.band = s.lockBand
  if (s.bandAlive[t.band] === 0) s.retired.push(t)
  else s.queue.push(t)
}

export function step(s: AblationState, dt: number): void {
  const { cfg, geom, field, front } = s

  // 1. Age the short-lived visual lists.
  ageOut(s.dying, dt, DYING_S)
  ageOut(s.bolts, dt, BOLT_S)

  // 2. Advance every turret; a turret that crossed its lane's centre while armed
  //    gets one look at that lane's outermost survivor, and strikes only on a
  //    palette-index match. A miss costs nothing and makes no light.
  const ds = cfg.speed * dt
  // Sub-step so a turret never traverses more than half a cell per `advance`.
  // `advance` tests only the lane it ENDS in, so a single long step silently drops
  // every lane centre it flew over: measured 31 shots per 100 lanes passed at
  // cell 4 / speed 400, and exactly ZERO at cell 2 / speed 600, where the step
  // length and the lane pitch resonate so the centre is always just out of reach.
  // Sub-stepping restores the documented rule — one shot per cell passed.
  const maxStep = Math.max(0.5, geom.cell * 0.5)
  for (const l of s.track) {
    let remaining = ds
    while (remaining > 1e-9) {
      const d = Math.min(remaining, maxStep)
      remaining -= d
      const lapsBefore = l.laps
      const fired = advance(geom, l, d)
      // A spent turret is not removed where it happens to run dry — it rides on,
      // dark, until it next crosses the gate (spec §4 rule 6). That limp back to
      // the gate is the visible half of discharge. Once the picture is gone there
      // is nothing left to wait for, so a straggler leaves at its next crossing
      // rather than burning down the lap cap over an empty screen.
      //
      // A lap that landed NOTHING ejects too (#280). A turret sees every lane of the
      // picture once per lap, so a blank lap means its colour is no longer reachable
      // anywhere — and measured across a full picture, 76-90% of turrets that have one
      // blank lap never fire again. It gives up the slot rather than hunting for up to
      // `lapCap` laps; the freed slot is refilled from the CURRENT exposed histogram,
      // which is the part a requeue could not do, since the queue holds bands and would
      // hand the same dead colour straight back.
      if (l.laps > lapsBefore) {
        // The lap cap is evaluated HERE, on the lap boundary, alongside the other two
        // triggers — not per-frame. Tested per-frame it would pull turrets off the
        // track wherever they happened to be the moment Lap cap was dragged down,
        // and nothing may ever appear or disappear mid-track.
        if (l.charge <= 0 || field.aliveCount === 0 || !l.hitThisLap || l.laps >= cfg.lapCap) {
          l.spent = true
        }
        l.hitThisLap = false
      }
      // A dark turret rides, but it does not shoot.
      if (!fired || l.charge <= 0) continue
      const cell = frontCell(field, front, l.edge, l.lane)
      if (cell < 0 || field.idx[cell] !== l.band) continue

      const col = cell % field.cols
      const row = (cell - col) / field.cols
      killCell(field, cell)
      s.bandAlive[l.band]--
      s.patches.push(cell)
      s.dying.push({ cell, col, row, band: l.band, t: 0 })

      const p = trackPoint(geom, l.s)
      l.charge--
      l.hitThisLap = true
      s.bolts.push({
        x0: p.x,
        y0: p.y,
        x1: geom.px + (col + 0.5) * geom.cell,
        y1: geom.py + (row + 0.5) * geom.cell,
        band: l.band,
        // AFTER the decrement: read before it, a turret's last bolt draws at full
        // brightness on the same frame the turret itself goes dark.
        intensity: l.charge / l.maxCharge,
        t: 0,
      })
    }
  }
  if (s.patches.length > PATCH_LIMIT) {
    s.patches.length = 0
    s.buffer = null
  }

  // 3. What is exposed right now — the only thing the Unison lock is allowed to see.
  //    This runs BEFORE rotation, not after: `rotate` stamps the lock onto every
  //    turret it handles, so refreshing afterwards leaves a one-frame window where a
  //    turret crossing the gate takes a band that has just died.
  if (s.hist.length !== field.bands) s.hist = new Uint32Array(field.bands)
  exposedHistogram(field, front, s.hist)

  // 4. The Unison lock: one colour the whole crew hunts. It is released on EXPOSURE,
  //    not extinction — a colour that has left the surface comes back when the layer
  //    above it is peeled, and the crew returns to it. The draw is the same tempered
  //    weighting Mixed uses for its allocation, so `Targeting bias` keeps one meaning
  //    across both modes.
  if (cfg.targeting === 'Unison') {
    if (s.lockBand < 0 || s.hist[s.lockBand] === 0) {
      s.lockBand = temperedPick(s.hist, cfg.targetingBias, s.rand)
    }
  } else {
    s.lockBand = -1
  }

  // 5. Rotate out the spent, the blank-lapped and the capped. Same three triggers as
  //    before and still evaluated at a gate crossing — only the destination changed,
  //    from destruction to the back of the queue.
  for (let i = s.track.length - 1; i >= 0; i--) {
    const t = s.track[i]
    if (t.spent) {
      s.track.splice(i, 1)
      rotate(s, t)
    }
  }

  // 5b. A queued turret whose colour died while it waited retires rather than riding
  //     a pointless shift. This is what visibly fills the retired row as a picture
  //     nears its end — and it is MIXED-ONLY.
  //
  //     In Unison every rotation stamps the same `lockBand`, so the queue is
  //     homogeneous: the frame that colour goes extinct, an unguarded sweep retires
  //     the ENTIRE queue at once. Measured at capacity 2 / fleet 20: 18 of 20 turrets
  //     retired in a single frame with 13.6% of the picture still standing, and the
  //     queue readout went from 18 dots to none and never refilled. A Unison turret
  //     is meant to keep its dead colour for one blank lap and pick the new lock up
  //     on rotation — that lag IS the mode's tell (spec §4), so leave it alone here.
  if (cfg.targeting === 'Mixed') {
    for (let i = s.queue.length - 1; i >= 0; i--) {
      if (s.bandAlive[s.queue[i].band] === 0) s.retired.push(...s.queue.splice(i, 1))
    }
  }

  // 5. Release from the gate onto the track. Everything enters at the gate and
  //    nowhere else; how far apart they end up is set by how long the gate holds
  //    between releases. Never release onto a picture that is already gone — that
  //    would give each turret a full lap cap to burn with nothing to shoot, turning
  //    the intended quiet beat into minutes of black.
  //    The gate is an ACCUMULATOR, and both halves of that matter. `gateClear` is
  //    decremented by a whole frame of travel, so it lands somewhere BELOW zero
  //    rather than exactly on it — clamping that overshoot away at zero, or
  //    assigning the interval instead of adding it, rounds every opening up to a
  //    whole frame. Measured at speed 400 / capacity 12: openings 126.7px apart
  //    against a 121.3px ideal, leaving a 51px gap beside a 142px one — 58% off
  //    even, before a single rotation had happened. Carrying the remainder is exact.
  s.gateClear -= ds
  while (s.gateClear <= 0 && s.queue.length > 0 && s.track.length < cfg.capacity
         && field.aliveCount > 0) {
    s.track.push(s.queue.shift()!)
    s.gateClear += gateInterval(s)
  }
  //    Credit does not accrue while the gate is BLOCKED, though — a full track or an
  //    empty queue must not bank a burst that dumps several turrets on top of each
  //    other the moment a slot frees. Zero means "open the instant there is room",
  //    which is what puts a rotating turret's replacement exactly where it left.
  if (s.gateClear < 0) s.gateClear = 0

  // 6. The picture is finished only once the track has emptied too — the stragglers
  //    finish their laps carrying charge they will never spend. Then the whole fleet
  //    is re-crewed for the new map: the retired row clears and every turret returns.
  if (field.aliveCount === 0 && s.track.length === 0 && s.dying.length === 0) {
    s.pictures++
    s.field = newField(cfg, geom, s.pictures)
    s.front = buildFront(s.field)
    s.patches.length = 0
    s.buffer = null
    crew(s)
  }
}

/** How far the last-released turret must travel before the gate opens again.
 *
 *  Every turret moves at the same speed, so holding the gate for `perimeter /
 *  capacity` of travel lands them at exactly even intervals around the track — and
 *  keeps them there, since a replacement enters the same distance behind the one in
 *  front. At spacing 0 the gate never holds and they leave as one bunched pack. */
function gateInterval(s: AblationState): number {
  return s.cfg.spacing * (s.geom.perimeter / Math.max(1, s.cfg.capacity))
}

function ageOut(list: { t: number }[], dt: number, life: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].t += dt
    if (list[i].t >= life) list.splice(i, 1)
  }
}

/** Live-apply a config edit. Returns false for changes the running state cannot
 *  absorb — the framework then tears down and re-runs setup(). */
export function applyConfig(s: AblationState, next: AblationConfig, _size: Size): boolean {
  const prev = s.cfg
  const structural =
    next.cellSize !== prev.cellSize ||
    next.featureSize !== prev.featureSize ||
    next.roughness !== prev.roughness ||
    next.seed !== prev.seed ||
    // a different NUMBER of colours is a different number of contour bands
    next.palette.length !== prev.palette.length ||
    // the track offset sets the margin, which sets how many cells fit — so it
    // resizes the picture grid. Applying it live would leave `geom` describing a
    // different grid than `field` holds: lanes past the new column count would
    // read -1 forever and those outer rows/columns would become immortal.
    next.trackOffset !== prev.trackOffset
  if (structural) return false

  s.cfg = next
  // A targeting change re-crews from scratch: it changes what colour EVERY turret
  // ought to be carrying at once, and reconciling that in place would mean inventing
  // a policy for which existing turrets keep their colour — invisible rules for no
  // visible gain. A fleet-size change is different: it only adds or removes turrets,
  // so it reconciles in place and the ring keeps riding (see `resizeCrew`). Both leave
  // the picture itself untouched, so this is still a live apply.
  // NO early return here. Falling through to the colour check below is load-bearing:
  // one `update` carrying BOTH a fleet change and a palette change must still
  // invalidate the baked picture buffer, or the map stays in the old palette while
  // turrets, bolts and dying cells switch — for the rest of the picture.
  if (next.targeting !== prev.targeting) crew(s)
  else if (next.capacity !== prev.capacity || next.queued !== prev.queued) resizeCrew(s)
  // The picture is a BAKED buffer. A recolour that does not invalidate it leaves
  // the map in the old palette while the turrets, bolts and dying cells switch to
  // the new one — and it stays wrong until the picture completes.
  if (next.background !== prev.background || next.palette.some((c, i) => c !== prev.palette[i])) {
    s.buffer = null
    s.patches.length = 0
  }
  return true
}

export function resizeState(s: AblationState, size: Size): void {
  s.size = size
  s.geom = makeGeom(size, s.cfg.cellSize, s.cfg.trackOffset)
  s.field = newField(s.cfg, s.geom, s.pictures)
  s.front = buildFront(s.field)
  s.dying.length = 0
  s.bolts.length = 0
  s.patches.length = 0
  s.buffer = null
  // A resize rebuilds the grid, so band masses change and the old allocation no
  // longer describes the map. Re-crew rather than clear: the fleet is permanent.
  crew(s)
}
