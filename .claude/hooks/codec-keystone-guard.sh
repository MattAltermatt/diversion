#!/usr/bin/env bash
# PostToolUse(Edit|Write): when the URL-codec keystone or any schema is touched,
# run the FULL codec/preset sweep — not just the one co-located test that
# test-on-edit.sh runs.
#
# Why: CLAUDE.md calls the URL codec "the keystone — keep it fully tested." A
# flat leaf-name key collision, a per-field decode regression, or a preset patch
# that no longer round-trips can be introduced by editing urlCodec/urlKeys/
# presets OR any diversion schema.ts (schemas drive the codec), and the damage
# shows up in the cross-cutting sweep tests, not the sibling unit file.
# Silent when green; on failure emit the report to stderr + exit 2.
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

# React to the codec keystone files and to any diversion schema.
base="$(basename "$file")"
case "$file" in
  */src/framework/urlCodec.ts | */src/framework/urlKeys.ts | */src/framework/presets.ts) ;;
  */src/diversions/*/schema.ts) ;;
  *)
    # Also catch the keystone files by basename if the path shape differs.
    case "$base" in
      urlCodec.ts | urlKeys.ts | presets.ts | schema.ts) ;;
      *) exit 0 ;;
    esac
    ;;
esac

root="$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null || dirname "$file")"
cd "$root" || exit 0

sweep=(
  src/framework/urlCodec.test.ts
  src/framework/urlKeys.test.ts
  src/framework/codecSweep.test.ts
  src/framework/presetSweep.test.ts
  src/framework/presets.test.ts
)

if ! out=$(npx vitest run "${sweep[@]}" 2>&1); then
  printf 'Codec/preset keystone sweep FAILED after editing %s:\n%s\n' "$file" "$(printf '%s' "$out" | tail -30)" >&2
  exit 2
fi
exit 0
