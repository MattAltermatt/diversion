#!/usr/bin/env bash
# PreToolUse(Edit|Write): block source edits while on the `main` branch.
#
# Why: CLAUDE.md invariant — "Branch, don't work on main. All work on
# feature/...". Nothing else enforces it, so a src edit can silently land on
# main. Scope is deliberately src/** ONLY: `docs:` commits (README/CLAUDE) land
# directly on main routinely (they trigger the GH Pages deploy), so guarding
# every file would false-positive on the normal doc-on-main flow.
# Silent when off main or editing non-source; on a src edit on main, emit the
# fix to stderr + exit 2 so the tool call is blocked and Claude branches first.
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

# Only guard source files; docs/config/tests-elsewhere land on main freely.
case "$file" in
  */src/*.ts | */src/*.tsx) ;;
  *) exit 0 ;;
esac

# The file may not exist yet (Write creating a new file/folder) — walk up to the
# nearest existing ancestor so `git -C` resolves the repo either way.
dir="$(dirname "$file")"
while [ -n "$dir" ] && [ "$dir" != "/" ] && [ ! -d "$dir" ]; do
  dir="$(dirname "$dir")"
done

branch="$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null || echo)"
[ "$branch" = "main" ] || exit 0

printf 'Refusing to edit source on `main`: %s\n' "$file" >&2
printf 'CLAUDE.md invariant — all feature work goes on a branch. Create one first:\n' >&2
printf '  git checkout -b feature/<name>\n' >&2
printf '(docs-only edits on main are fine; this guard only fires on src/**.)\n' >&2
exit 2
