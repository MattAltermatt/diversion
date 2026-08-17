#!/usr/bin/env bash
# PostToolUse(Edit|Write): keep the documented diversion list in sync with the
# actual set of diversion folders.
#
# Why: the list repeatedly drifts behind src/diversions/ — a shipped diversion
# folder isn't added to it (see the recurring manual "N→M" reconciliations in
# session history). The robust 1:1 anchor: every diversion folder has an
# index.ts, and every list entry carries "(`kind:" — the two counts must match.
#
# The list LIVED IN README.md until 2026-08-17, when it was moved to
# docs/gallery.md (the README was 93% one feature list — 15,511 of 16,672 words).
# This guard did not notice, for two reasons worth keeping in mind:
#   1. It counted README.md, which afterwards had zero entries — so it was
#      failing on every edit, not passing.
#   2. It never got the chance to say so: the move was made by a node script
#      writing the file directly, and a PostToolUse hook only sees Edit/Write.
#      A guard is blind to any change that does not go through the tools.
# The README keeps a "**N diversions**" summary line, so that number is checked
# too — it is the one count a reader sees first.
#
# Fires only when a diversion index.ts, docs/gallery.md, or the root README is
# touched. Silent when the counts agree; on mismatch emit the delta to stderr +
# exit 2 so Claude sees it.
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

# Anchored deliberately: the old pattern was */README.md, which matched every
# README in the tree (docs/mockups/, docs/superpowers/) and fired this guard on
# files that have nothing to do with the list.
case "$file" in
  */src/diversions/*/index.ts | */docs/gallery.md | */diversion/README.md) ;;
  *) exit 0 ;;
esac

root="$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null || echo)"
[ -n "$root" ] || exit 0
[ -f "$root/docs/gallery.md" ] || exit 0

folders=$(find "$root/src/diversions" -mindepth 2 -maxdepth 2 -name index.ts 2>/dev/null | wc -l | tr -d ' ')
entries=$(grep -cE '\(`kind:' "$root/docs/gallery.md" 2>/dev/null | tr -d ' ')

status=0
if [ "$folders" != "$entries" ]; then
  printf 'Diversion count drift: %s folders (src/diversions/*/index.ts) but %s docs/gallery.md entries ("(`kind:").\n' "$folders" "$entries" >&2
  printf 'Add/remove the docs/gallery.md entry so both match.\n' >&2
  status=2
fi

# The README no longer carries the list, but it does carry the headline count.
if [ -f "$root/README.md" ]; then
  claimed=$(grep -oE '\*\*[0-9]+ diversions\*\*' "$root/README.md" 2>/dev/null | grep -oE '[0-9]+' | head -1)
  if [ -n "$claimed" ] && [ "$claimed" != "$folders" ]; then
    printf 'README says "**%s diversions**" but there are %s folders. Update the summary line.\n' "$claimed" "$folders" >&2
    status=2
  fi
fi

exit $status
