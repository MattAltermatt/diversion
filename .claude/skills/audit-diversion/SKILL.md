---
name: audit-diversion
description: Use when auditing diversions in this project for fitness — "audit the gallery", "audit <slug>", "next piece", "is this one worth keeping", working through issue #314's checklist, or reviewing whether a piece is interesting and its settings make sense. Also use when a finding from such a review needs filing.
---

# Auditing a diversion

One pass over one piece. **The owner judges; you do the mechanical half and record the verdict.**
The ledger is issue **#314** — 137 checkboxes, one per diversion. Findings become separate
issues labelled `audit`.

## Phase 1 — the brief

```bash
node scripts/audit-preflight.mjs --next        # first unticked piece in #314
node scripts/audit-preflight.mjs <slug> …      # a specific piece, or several
node scripts/audit-preflight.mjs --unaudited   # what is left
```

Then add the one thing the script cannot: **read the source and say, in three or four
sentences, what the piece is actually doing.** Mechanism, not adjectives — what updates each
frame, what the loop's exit condition is, what the numbers on the sliders really control. The
card text is a promise, not a description; half the audit is checking whether they agree.

Hand over the play URL on its own line, the brief, and the mechanism paragraph. Then stop.

## Phase 2 — the owner watches

Seven criteria: **interesting · worth keeping · settings sane · speed · credit · card-vs-reality ·
readable**. Two viewing rules that change verdicts:

- **Look at 0:10 and again at 2:00.** Contrast and interest failures are usually temporal — a
  piece that blows out to white mush or fades to nothing only fails on the second look.
- **Reload two or three times.** Seedless loads roll a fresh seed, so a piece can open on a dud
  world and read as boring when it isn't. Never recommend a removal off one load.

## Phase 3 — capture

Ticking the box edits a GitHub issue as the owner, so it is **approval-gated like any
other GitHub write** — ask before running it, and never batch ticks the owner has not
called. It is also a whole-body overwrite: anything edited on #314 between the read and
the write is silently clobbered, so re-read immediately before writing.

```bash
gh issue view 314 --json body --jq .body > /tmp/ledger.md
# flip "- [ ]" to "- [x]" on the line whose link contains /d/<slug>/play
gh issue edit 314 --body-file /tmp/ledger.md
```

One issue per **actionable change**, not per piece, labelled `audit`, linking back to #314. A
piece that comes back clean gets a tick and no issue.

## Reading the brief — which rows are facts and which are prompts

| Row | Trust it? |
|---|---|
| Presets, Name, field/help/section counts | **Fact.** Read from git and the real zod schema. |
| History — dates and batch size | **Fact.** The own-vs-sweep split is a threshold (25 folders), so read the commit subjects it prints rather than the label. |
| Credit | Three tiers. `SOURCE/DOCS ONLY` is backed by an explicit marker and is dependable. `possible attribution` is a name-shaped regex — a candidate to glance at, nothing more. |
| Speed | Fact that a control exists, matched on label *and* field name. Whether it *feels* right is the owner's call, always. |
| Contrast | **A screen, not a verdict.** Alpha is composited, but declared colours still are not rendered pixels — blending, trails and glow all move them — and a shadow or backdrop stop is often meant to be near-invisible. |
| Settings — `declared but never read` | Text matching, not a parse. A flag is worth chasing; **silence proves almost nothing**, because a dynamic read, a preset patch, or a name colliding with any other object's property all hide a dead field. |
| Longevity | Greps for a reseed/cycle symbol. Absence is worth checking; presence proves nothing. |
| Family | Keyword buckets, to prompt comparison against neighbours. Not a taxonomy. |

## Rules

- **Never change a default or delete a piece off an audit finding.** Both are owner calls —
  numeric balance is sacrosanct, and a removal touches `docs/gallery.md` (the count-guard hook),
  `UNMATCHED_AT_DEFAULTS`, the README total, and every sweep's non-vacuity floor.
- **Schema-shape fixes are yours**: a missing `help`, a slider with no bounds, a `select` with no
  `options`, an inert control the brief flagged. Those are defects, not taste.
- **Do not pre-judge in the hand-off.** Report what the piece does and what the brief found.
  Phrase anything you noticed as a question, and let the answer come back from the screen.

## Common mistakes

- **Quoting `git log -1` as "last modified."** It says 2026-08-16 for 127 of the 137 — the
  #288 sweep. The script already excludes sweeps; use its History row.
- **Treating a contrast warning as a bug.** Check what the colour is *for* first.
- **Filing one issue per piece.** Findings get scheduled independently; bundle them and none of
  them can be picked up alone.
