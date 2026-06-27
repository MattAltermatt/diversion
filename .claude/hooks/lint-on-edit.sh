#!/usr/bin/env bash
# PostToolUse(Edit|Write): oxlint the edited TS/TSX file.
# Silent when clean; on lint errors emit the report to stderr + exit 2 so Claude sees it.
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

case "$file" in
  */src/*.ts | */src/*.tsx) ;;
  *) exit 0 ;;
esac

root="$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null || dirname "$file")"
cd "$root" || exit 0

if ! out=$(npx oxlint "$file" 2>&1); then
  printf 'oxlint flagged %s:\n%s\n' "$file" "$(printf '%s' "$out" | tail -25)" >&2
  exit 2
fi
exit 0
