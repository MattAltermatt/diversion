# Outbreak — design spec

_Diversion `id: outbreak`. Agent-based three-faction arena; watch who wins._
_Status: design approved 2026-07-02. Tracker: GitHub issue #232 (epic) + sub-issues._

## Concept

A bounded, procedurally-generated arena (top-down, a city block) holds a mixed
population of three factions of coloured circles. **Fighters** start on one edge,
the **horde** on the opposite edge, a slew of **civilians** scattered between. The
outbreak plays out and **self-resolves** — the horde converts everyone, or the
fighters hold and cull the horde — then reseeds into a fresh outbreak for
screensaver longevity.

The emergent hook: **civilians are a shared resource both sides drain.** Fighters
recruit them into an army; the horde bites them into more horde. Every match is a
race to spend the civilian pool.

## Factions & the conversion cycle

Three factions (`Faction = 0 Civilian | 1 Fighter | 2 Zombie`), each a circle:

```
  Civilian ──bitten──▶ Zombie      (contact by a zombie, after an infection delay)
  Civilian ─recruited─▶ Fighter    (a fighter passes within recruit radius)
  Fighter  ──bitten──▶ Zombie      (a zombie reaches a fighter → same infection delay)
  Zombie   ──shot────▶ ✝ removed   (a fighter's bullet hits it)
```

Terminal states (→ reseed): **all zombies removed** (humans win) or **all fighters
gone** (horde wins; any surviving civilians are then run down). A **settle
detector** (no conversion/kill event for N seconds) forces a winner-by-headcount
reseed so a timid remnant can never freeze the arena.

### Steering (force matrix)

Per-agent local steering over spatial-hash neighbour queries. `+` attract, `−`
repel; magnitudes are tuning.

```
  actor \ toward     Zombie        Civilian     Fighter
  Zombie             + clump        + hunt       − fear  →  + charge (enraged)
  Civilian           − flee          0           + seek-safety
  Fighter            (aim/shoot)    (recruit)    + loose formation
```

- **Zombies** clump with each other, hunt the nearest civilian, and **fear**
  fighters (stand off from ranged death) — *until enraged*, when fear flips to a
  charge (see Enrage).
- **Civilians** flee nearby zombies and steer toward the nearest fighter (safety);
  they do **not** deliberately cluster and never fight back.
- **Fighters** hold a loose formation, aim at the nearest in-range zombie, and
  recruit any civilian that comes within recruit radius.

All three also obey **wall avoidance** (short forward "whisker" probes repel off
arena walls) plus hard collision clamp against walls. No global pathfinding — local
steering + wide procgen streets; the rare stuck agent is masked by reseed.

## Fighters — combat layer (the balance keystone)

- **Ranged weapon:** a fighter with a target in range and rounds left fires,
  spawning a **bullet** (fast projectile) toward the target's lead position.
  Bullets travel, hit the first zombie they touch (remove it), or expire on a wall
  / max range. **No friendly fire** — bullets pass through civilians and fighters.
- **Magazine + reload:** each fighter has `magazine` rounds; firing decrements.
  At zero it **reloads** over `reloadTime` seconds, during which it cannot fire —
  the vulnerability window. Ammo is otherwise infinite. Reloads are staggered by a
  small per-fighter phase so the whole line doesn't reload in lockstep (though a
  synchronised gap is exactly the drama when it happens).
- **Enrage / charge wave (keystone):** when a zombie is **shot**, it and every
  zombie within `enrageRadius` flip `fear → charge` for `enrageTime` seconds, and
  the flip **chain-propagates** (an enraged zombie re-triggers its own neighbours).
  Charging zombies drop the fighter-fear term and drive straight at the nearest
  fighter. This is the counterweight that stops fighters trivially mowing the horde
  from range: engaging the horde *wakes a wave*, and a wave that arrives during a
  reload gap breaks the line. Without it the piece is a one-sided turkey-shoot.

## Procgen arena + configurable density

- A bounded rectangular world with interior **walls** — a top-down city block:
  streets, buildings, chokepoints. Generated from `seed`.
- **Density knob** (`arenaDensity`, 0..1) is a first-class config: `0` ≈ wide-open
  field (few walls, sweeping engagements), `1` ≈ dense "office space" (tight
  corridors, doorways, last-stand chokepoints). Density scales wall coverage /
  corridor width in the generator.
- Fighters spawn clustered on one edge, the horde on the opposite edge, civilians
  scattered through the interior (never inside walls).

## Readability & juice

- **Muzzle flash + tracer line** on every shot (short-lived line from fighter to
  impact + a flash dot). Essential — it's how the firing line reads.
- **Population HUD:** three live bars — 🟩 civilians / 🔴 horde / 🔵 fighters —
  the "who's winning" gauge. Plus a result banner on reseed ("Horde wins" /
  "Humans hold").
- **Infection countdown ring:** a bitten agent keeps its current behaviour (a
  bitten fighter keeps *firing*, a bitten civilian keeps *fleeing*) with a pulsing
  ring shrinking to the color-flip at conversion. Readable + a touch of drama.
- **Fading blood/corpse marks:** a zombie death leaves a screen-space mark that
  fades — a sense of battle history.
- **Panic contagion:** a civilian that senses a zombie "screams", spiking a fear
  value in nearby civilians → an emergent stampede ripple (they still don't
  *cluster*, they flee harder together).

## Architecture (mirrors flock-vs-hunter's module split)

```
  src/diversions/outbreak/
    schema.ts        Zod single-source-of-truth (form + URL codec + Config type)
    presets.ts       PresetGroup[] — e.g. Density (Field/Streets/Offices), Palette
    spatialHash.ts   bounded (clamped, NON-toroidal) uniform grid, zero per-frame alloc
    arena.ts         procgen walls from seed + density; wall queries for steering/collision
    steering.ts      pure per-faction steering + wall avoidance (unit-tested)
    combat.ts        bullets, magazines/reload, enrage-chain, conversions (unit-tested)
    sim.ts           Ecosystem SoA state + stepSim(): steer → move → combat → convert → settle/reseed
    render.ts        draw arena, agents, tracers, rings, blood, HUD
    index.ts         defineDiversion wiring (setup/frame/update/resize/teardown)
    *.test.ts        co-located Vitest per module
```

- **State is Struct-of-Arrays** (`Float32Array` px/py/vx/vy, `Uint8Array` faction /
  enraged / alive, `Float32Array` infectTimer / reloadTimer …) for zero per-frame
  allocation, per the gallery hot-path convention.
- `kind: '2d'`, DPR-scaled; sim runs in a fixed world, render cover-fits to size.
- `seed` is `randomizeOnFreshLoad: true` (pin-only) — a shared link is seedless and
  shows a new outbreak each visit; `?seed=N` reproduces exactly.
- **Reseed** rebuilds the arena + repopulates from a fresh seed on terminal/settle —
  the same self-reseed longevity pattern as demon / squiral.
- `speed` = fixed sim-steps-per-frame (visual fast-forward, outcome unchanged).

## Determinism & testing

- A single seeded PRNG stream drives arena gen + spawns + all stochastic combat
  (fire spread, reload phase). Same seed + config ⇒ identical outbreak.
- Anti-regression must-haves: schema→form control selection; codec round-trip;
  conversion-cycle correctness (bite→timer→flip, recruit, shot→remove); enrage
  chain propagation; settle-detector fires; bounded spatial hash never queries a
  wrapped neighbour; no bullet friendly-fire.

## Out of scope (v1 — YAGNI)

Stamina/exhaustion, escape zones, friendly fire, day/night, multiple weapon types.
The slow-relentless-horde vs. faster-humans **speed** tension gives the classic
feel without a stamina system. Revisit post-verify if the arena wants more.
