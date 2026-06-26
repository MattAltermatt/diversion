# 🗺️ Diversion Roadmap

## Phases

### ✅ Phase 1 — Framework + Flow Field (v1) — *shipped 2026-06-26*
The spine: a diversion contract, a config⇆URL codec, a schema-driven config form, an animation host that owns the rAF loop, three screens (gallery / config / play), and one polished reference diversion (Flow Field). Every seam of the contract is exercised end-to-end.

### 🔮 Phase 2 — Grow the collection
New diversions are pure content against the fixed contract. Candidates: cellular automata (Life / Lenia), boids, a raymarched WebGL shader (proves the `kind: 'webgl'` path), Lissajous / harmonograph, reaction–diffusion. Each gets its own `src/diversions/<slug>/` and accretes whenever inspiration strikes.

### 🔮 Phase 3 — Framework richness (as the collection demands it)
Pull from the backlog when a concrete diversion needs it — e.g. a live-update hook so the config preview doesn't reset on every edit, captured static thumbnails for the gallery at scale, new control types (vector pads, gradient editors), or record-to-GIF / share-image export.

## 🚧 Current todos

_None — Phase 1 is complete and verified. Next session: pick a Phase 2 diversion (the WebGL raymarcher is the highest-value next piece because it proves the GPU path)._

## 🗃️ See also

- [`BACKLOG.md`](BACKLOG.md) — deferred ideas and known minor items.
- [`CHANGELOG.md`](CHANGELOG.md) — what shipped, when.
