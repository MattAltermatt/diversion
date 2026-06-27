#!/usr/bin/env bash
# PostToolUse(Edit|Write): run the co-located Vitest file for an edited source file.
# Silent when green; on failure emit a concise report to stderr + exit 2 so Claude sees it.
# Skips test files themselves (TDD red phase is expected) — the matching SOURCE edit triggers the run.
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

# Only react to source files under src/.
case "$file" in
  */src/*.ts | */src/*.tsx) ;;
  *) exit 0 ;;
esac
# Skip test files and declarations.
case "$file" in
  *.test.ts | *.test.tsx | *.d.ts) exit 0 ;;
esac

# Sibling test path: foo.ts -> foo.test.ts, foo.tsx -> foo.test.tsx
ext="${file##*.}"
base="${file%.*}"
test_file="${base}.test.${ext}"
[ -f "$test_file" ] || exit 0

root="$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null || dirname "$file")"
cd "$root" || exit 0

if ! out=$(npx vitest run "$test_file" 2>&1); then
  printf 'Co-located tests FAILED for %s:\n%s\n' "$test_file" "$(printf '%s' "$out" | tail -25)" >&2
  exit 2
fi
exit 0
