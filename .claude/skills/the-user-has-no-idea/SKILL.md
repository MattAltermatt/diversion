---
name: the-user-has-no-idea
description: Use when building a new diversion, or any generative/visual piece the user can't fully specify before seeing it run — especially matching a reference the user has watched but you haven't. Symptoms you're about to violate this: you're lining up "Q1 / Q2 / Q3" asking the user to choose between visual or design options in the abstract, before anything is on screen. The user has said things like "you drive, I tweak", "I don't know until I see it", "make it match the video". Replaces the upfront-interview gate of brainstorming for this class of work.
---

# The user has no idea (drive, then tweak)

**Core principle:** For a new diversion, the user cannot usefully pick between design options they've never seen. Asking them to choose colors, motion models, or dot styles in the abstract wastes turns and gets worse answers than just *building it well*. So: **you are the SME. You drive every design call, resolving the non-obvious ones with dueling agents instead of questions. You get the real thing running in Chrome. Then the user tweaks the live artifact.** The Q&A moves from *before the build* to *after it's on screen, against something real.*

This **replaces the upfront-question gate of `superpowers:brainstorming`** for new diversions. You still produce a short spec and still get user sign-off — but sign-off happens on the *running deliverable*, not a pre-build interview.

## The failure this prevents

Lining up `Q1 — motion? A/B/C`, `Q2 — coloring? A/B/C/D` and making the user adjudicate visual choices blind. They said "you drive." Driving means *deciding*, not *presenting a menu*.

## Red flags — STOP, you're interviewing again

- You're about to ask the user to choose between two+ **visual/aesthetic** options with nothing rendered yet.
- Your message is a lettered menu of design choices the user can only guess at.
- You're waiting on a design answer before writing any code.
- You caught yourself thinking "I'll just confirm the look first."

**All of these mean: decide it yourself (dueling agents if non-obvious), build it, show it running.**

## The workflow

1. **Gather the facts yourself.** Read the issue, the port ethos, any memory. If there's a reference (video/site/hack), fetch what you can. If you genuinely cannot perceive the reference (e.g. a video's frames), say so plainly and make your best SME reconstruction — do **not** convert that gap into a pile of user questions.
2. **Make the design calls as SME.** Motion model, palette, dot/line treatment, background, loop behavior — you decide, grounded in the reference + the 5 UX invariants + the zen-screensaver ethos (calm defaults).
3. **Dueling agents for the non-obvious/load-bearing calls only.** When a call affects 2+ downstream aspects, is hard to reverse, or is a genuine "what will look best" toss-up, dispatch 2–3 parallel agents with competing takes and synthesize — per `superpowers:dispatching-parallel-agents` and the dueling-agents rule. Agents *decide the call for you*; they are not a way to hand the choice back to the user. Include an adversarial/falsifier agent for any premise you're unsure of.
4. **Write a short spec recording the calls you made** (so the reasoning is traceable), commit it, and go straight to building — no "please review the spec first" pause.
5. **Build it and get it RUNNING in Chrome** on the dev server (port 5180). Use `new-diversion` for the contract, `verify-diversion` to check it. It must actually *look good*, not just render.
6. **Hand off a live artifact.** Give the user the clickable play URL (muted, seeded params) plus a short **"calls I made you might want to tweak"** list — the handful of decisions most worth a second opinion now that they can see them.
7. **Iterate on the running thing.** Now the user tweaks. Follow `feedback-stay-in-loop-during-tuning`: propose each feel/balance change, wait for the pick, apply one at a time. This is where their taste drives — against pixels, not prose.

## What is STILL gated (don't over-apply)

Driving the *design* does not mean skipping the standing gates:

- **Gameplay/tuning numeric balance** stays sacrosanct where it applies — but a new diversion's *initial* aesthetic defaults are your SME call to set (that's the whole point). Later numeric *re-tuning* of a shipped piece follows the ask-first rule.
- **Destructive ops, `git push`, FF-merge to `main`, scope/strategy pivots** — still explicit user gates.
- **Genuine strategic ambiguity** (which diversion to build, a pivot in direction) — still ask. This skill is about *how to execute a chosen piece*, not *what to build*.

## Quick reference

```text
Non-obvious visual/design call    → dueling agents decide, then build
Obvious SME call                  → just decide, then build
Can't perceive the reference      → say so, best-reconstruct, build (don't ask)
Strategic / scope / destructive   → still ask the user
After it's running                → user tweaks live, one change at a time
```
