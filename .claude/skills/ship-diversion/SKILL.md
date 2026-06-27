---
name: ship-diversion
description: Ship the current verified work — FF-merge to main, push, watch the GH Pages deploy, validate live, and close the issue. Use when the user says "ship it", "ship-diversion", "ship this", or "deploy" AFTER local verify + Chrome verify have passed.
disable-model-invocation: true
---

# ship-diversion

Codifies the Diversion ship ritual so no step gets skipped — especially the post-deploy **live validation** gate ("green build ≠ working deploy").

## Preconditions — verify before starting; STOP and report if any fail
1. On a `feature/...` branch (NOT `main`), tree clean (`git status --short` empty).
2. Tests green (`npm test`) and build clean (`npm run build`).
3. The user has done the **Chrome verify** (CLAUDE.md: "user-verify before FF-merge"). If unconfirmed this session, ask once.

## Sequence
1. **Squash decision.** Default to keeping commits as-is when each maps to a distinct issue (independently revertable units a future bisect wants). Squash into one only when the branch is a single logical unit (`git reset --soft main` + fresh commit). When unsure, ask.
2. **FF-merge:**
   - `git checkout main`
   - `git merge --ff-only <feature-branch>`
3. **Push** (triggers `.github/workflows/deploy.yml` on `push:main`):
   - `git push origin main`
4. **Branch cleanup** (standing-authorized at merge time per CLAUDE.md): `git branch -d <feature-branch>`; if it was pushed to origin, also `git push origin --delete <feature-branch>`. Skip the remote delete if the branch was local-only.
5. **Watch the deploy:**
   - `gh run list --workflow=deploy.yml --limit 1` → get the run id
   - `gh run watch <id> --exit-status`
   - Confirm `conclusion: success` (`gh run view <id> --json status,conclusion`).
6. **Validate live — NON-NEGOTIABLE:**
   - Navigate Chrome (chrome-devtools MCP) to `https://mattaltermatt.github.io/diversion/d/<diversion-id>?mute=1`.
   - Confirm the shipped change is actually present — read back DOM/state via `evaluate_script`, watch the console for errors.
7. **Close the issue(s)** — GitHub write action; "ship and close" is the go, otherwise ask: `gh issue close <N> --comment "Shipped in <sha> — <one-line>. Chrome-verified, deployed."`
8. **Report:** commits shipped · deploy conclusion · live-validation result · issues closed.

## Notes
- Pushing `main` after a verified FF-merge is routine (no extra permission). Destructive remote ops (force-push, deleting unmerged remote branches) still need an explicit ask.
- Dev server is pinned to `:5180`; the live site is GitHub Pages at the URL above.
- GitHub-native project: Issues are the tracker; there is no ROADMAP.md.
