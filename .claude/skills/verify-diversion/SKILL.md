---
name: verify-diversion
description: Use when verifying a diversion in the browser — "verify <slug>", "verify-diversion", "check it in Chrome", before ship. Starts the dev server on port 5180, opens the play URL in Chrome (chrome-devtools MCP — never a built-in preview), screenshots, and checks the console for WebGL/runtime errors. Visual quality is the bar, not just "it renders".
disable-model-invocation: true
---

# Verify a diversion in Chrome

Local verify loop before `ship-diversion`. **Chrome via the chrome-devtools MCP
only — never the Claude app's built-in preview** (absolute rule, every project).
Visual quality matters: confirm the animation actually looks good, not merely that
it renders without throwing.

## Steps

1. **Start the dev server in the background** (port is pinned to **5180**,
   `strictPort`, base `/` in dev):
   ```bash
   npm run dev
   ```
   Run it backgrounded so the URL is ready before handoff; the user should never
   have to start a server as a verification precondition. (If 5180 is occupied,
   `strictPort` makes Vite fail rather than bump — free the port, don't hunt for a
   new one.)

2. **Build the play URL** — dev route shape is `/d/<slug>/play` (config screen is
   `/d/<slug>`). Always append `?mute=1` for anything with audio (compose with
   existing params, e.g. `?seed=42&mute=1`). Surface the **full clickable URL on
   its own line**:
   ```
   http://localhost:5180/d/<slug>/play?mute=1
   ```

3. **Open it in Chrome** with the chrome-devtools MCP and let it animate a few
   seconds before judging.

4. **Screenshot** (`take_screenshot`). The CLI does not render images inline —
   surface the **file path** so the user can `open` it. Carry verification weight
   in words too: luminance, color names, structural notes (vein contrast, no
   uniform haze, motion is calm/zen).

5. **Check the console** (`list_console_messages`) for WebGL errors, shader compile
   failures, context-lost events, or React warnings. A clean render with a noisy
   console is not a pass. Watch specifically for the documented WebGL traps:
   uniform-background (RGBA32F + LINEAR without `OES_texture_float_linear`),
   context-loss not `preventDefault`'d, leaked GL resources across navigation.

6. **For interactive controls**: click-test every new button (render-only is
   insufficient — paywall/disabled buttons can render fine but have broken apply
   paths) and assert the state change via `evaluate_script` readback. Real-mouse
   clicks have a mousedown→mouseup gap; if a per-frame `replaceChildren()` rebuilds
   a clickable node between them, the click is lost — reproduce via dispatched
   MouseEvents/coords, not a synthetic uid click.

7. **Report**: PASS only with evidence (screenshot path + clean console + a sentence
   on how it looks). If it can't be judged good, say so — don't claim success.

## Handoff

After an automated pass, hand the user the clickable URL for their own manual
inspection (user-verify-before-FF-merge). Name relevant hotkeys. Then the next
step is the `diversion-reviewer` code review, then `ship-diversion`.
