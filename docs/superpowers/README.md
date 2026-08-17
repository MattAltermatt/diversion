# Plans and specs — dated snapshots, not live documentation

Everything under `plans/` and `specs/` is **the document as it was written on its
date**. These are a record of what was decided and why, kept for provenance. They are
deliberately **not** maintained against the code afterwards.

Two consequences worth knowing before you follow one:

- **File paths in here may have moved.** A path was accurate the day the plan was
  written and is not updated when the code is refactored. A doc-refresh sweep on
  2026-08-17 found 5 such references across 300 cited paths in 101 files — for example
  `src/diversions/ablation/lasers.ts`, which became `turrets.ts` in `05f3ff0` when the
  turrets were reworked into a permanent circulating fleet, and
  `src/diversions/boxcar2d/rubble.ts`, which was removed outright in `8f242e3`. They
  are left as written on purpose: editing a dated plan to name a file that did not
  exist yet would falsify the record.
- **Checkboxes in here are historical, not a to-do list.** Several plans contain
  `- [ ]` items. Those describe the plan's state at the time. Open work lives in
  [GitHub Issues](https://github.com/MattAltermatt/diversion/issues) and ship history
  in [Releases](https://github.com/MattAltermatt/diversion/releases) — the single
  source of truth, per `README.md`.

For what the code does *now*, read `CLAUDE.md` and the source. For what every diversion
is, read [`docs/gallery.md`](../gallery.md).
