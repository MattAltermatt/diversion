#!/usr/bin/env bash
# PostToolUse(Edit|Write): typecheck the project after a source edit.
# Silent when green; on type errors emit a concise report to stderr + exit 2 so Claude sees it.
#
# Why project-wide (not per-file): this is a TS project-references build
# (tsconfig.app.json + tsconfig.node.json), so a single file's types depend on
# the whole graph — a per-file `tsc` would miss cross-module breakage and can't
# resolve the references. `tsc -b` is incremental (tsBuildInfoFile is set), so
# after the first run only the changed project recompiles. Both tsconfigs are
# noEmit, so this typechecks without writing JS into the tree. It mirrors the
# first half of `npm run build` (`tsc -b && vite build`).
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

# Only react to TS/TSX source files under src/ or the build config itself.
case "$file" in
  */src/*.ts | */src/*.tsx | */vite.config.ts) ;;
  *) exit 0 ;;
esac
# Declaration files don't change emit/typecheck surface meaningfully on their own.
case "$file" in
  *.d.ts) exit 0 ;;
esac

root="$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null || dirname "$file")"
cd "$root" || exit 0

if ! out=$(npx tsc -b 2>&1); then
  printf 'tsc -b FAILED after editing %s:\n%s\n' "$file" "$(printf '%s' "$out" | tail -30)" >&2
  exit 2
fi
exit 0
