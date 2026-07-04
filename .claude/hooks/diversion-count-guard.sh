#!/usr/bin/env bash
# PostToolUse(Edit|Write): keep the README diversion list in sync with the
# actual set of diversion folders.
#
# Why: the README list repeatedly drifts behind src/diversions/ — a shipped
# diversion folder isn't added to the list (see the recurring manual "N→M"
# reconciliations in session history). The robust 1:1 anchor: every diversion
# folder has an index.ts, and every README list entry carries "(`kind:" — the
# two counts must match. (The spelled-out "**Fifty-seven diversions:**" header
# is for humans; this checks the machine-countable entries.)
# Fires only when a diversion index.ts or the README is touched. Silent when the
# counts agree; on mismatch emit the delta to stderr + exit 2 so Claude sees it.
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

case "$file" in
  */src/diversions/*/index.ts | */README.md) ;;
  *) exit 0 ;;
esac

root="$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null || echo)"
[ -n "$root" ] || exit 0
[ -f "$root/README.md" ] || exit 0

folders=$(find "$root/src/diversions" -mindepth 2 -maxdepth 2 -name index.ts 2>/dev/null | wc -l | tr -d ' ')
entries=$(grep -cE '\(`kind:' "$root/README.md" 2>/dev/null | tr -d ' ')

[ "$folders" = "$entries" ] && exit 0

printf 'Diversion count drift: %s folders (src/diversions/*/index.ts) but %s README entries ("(`kind:").\n' "$folders" "$entries" >&2
printf 'Add/remove the README list entry so both match, and update the "**<N> diversions:**" header.\n' >&2
exit 2
