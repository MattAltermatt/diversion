# Copy Share Link Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-click "Copy share link" button to the config and play screens that copies the absolute play URL to the clipboard with a brief "Copied" confirmation.

**Architecture:** One reusable `CopyLinkButton` framework component (black-box: screens pass a relative `href`, it copies `origin + href`). Wired into `ConfigScreen` (beside "Open animation") and `PlayScreen` (beside "← config"). Styled via a new `theme.css` rule.

**Tech Stack:** React 19, TypeScript, Vitest + @testing-library/react, async Clipboard API.

## Global Constraints

- **Both screens copy the PLAY url** (`/d/<slug>/play?<snapshot>`) — never the config URL.
- **Label copy (verbatim):** default `🔗 Copy link`; success `✓ Copied`.
- **Confirmation duration:** 1500ms, then revert.
- **No-jump rule:** `min-width` pinned so the button never reflows under the cursor.
- **Clipboard failure is silent-honest:** on reject/missing API, label stays `🔗 Copy link` (never falsely shows Copied). No `document.execCommand` fallback.
- **Tests co-located** as `*.test.tsx` next to source (Vitest).
- **Dev server:** port 5180. **Verify in Chrome** (chrome-devtools MCP), never a built-in preview.

---

### Task 1: CopyLinkButton component (TDD)

**Files:**
- Create: `src/framework/CopyLinkButton.tsx`
- Test: `src/framework/CopyLinkButton.test.tsx`

**Interfaces:**
- Produces: `export function CopyLinkButton({ href, className }: { href: string; className?: string }): JSX.Element`
  - `href`: relative play path, e.g. `/d/flow-field/play?seed=10847`.
  - On click: `navigator.clipboard.writeText(window.location.origin + href)`.
  - Renders a `<button type="button" class="copy-link-btn {className}">` whose text is `🔗 Copy link`, switching to `✓ Copied` for 1500ms after a successful copy.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/framework/CopyLinkButton.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { CopyLinkButton } from './CopyLinkButton'

describe('CopyLinkButton', () => {
  let writeText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('copies the absolute URL (origin + href), not the relative href', async () => {
    render(<CopyLinkButton href="/d/flow-field/play?seed=1" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(
      window.location.origin + '/d/flow-field/play?seed=1',
    )
  })

  it('swaps the label to "✓ Copied" after a successful copy', async () => {
    render(<CopyLinkButton href="/d/flow-field/play?seed=1" />)
    expect(screen.getByRole('button').textContent).toContain('Copy link')
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(screen.getByRole('button').textContent).toContain('Copied')
  })

  it('reverts the label to "🔗 Copy link" after 1500ms', async () => {
    render(<CopyLinkButton href="/d/flow-field/play?seed=1" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(screen.getByRole('button').textContent).toContain('Copied')
    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByRole('button').textContent).toContain('Copy link')
  })

  it('does NOT show "Copied" when the clipboard write rejects', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    render(<CopyLinkButton href="/d/flow-field/play?seed=1" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
    expect(screen.getByRole('button').textContent).toContain('Copy link')
    expect(screen.getByRole('button').textContent).not.toContain('Copied')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/framework/CopyLinkButton.test.tsx`
Expected: FAIL — `Failed to resolve import './CopyLinkButton'`.

- [ ] **Step 3: Write the minimal implementation**

```tsx
// src/framework/CopyLinkButton.tsx
import { useEffect, useRef, useState } from 'react'

/**
 * Copies the absolute share URL (origin + the given relative `href`) to the
 * clipboard and flashes a "Copied" confirmation. The screens stay black
 * boxes — they just hand us a play path.
 */
export function CopyLinkButton({ href, className }: { href: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  // Clear a pending revert if the component unmounts (no setState-after-unmount).
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + href)
    } catch {
      return // honest failure: leave the label unchanged
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      className={`copy-link-btn${className ? ` ${className}` : ''}`}
      onClick={copy}
    >
      {copied ? '✓ Copied' : '🔗 Copy link'}
    </button>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/framework/CopyLinkButton.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/framework/CopyLinkButton.tsx src/framework/CopyLinkButton.test.tsx
git commit -m "framework: CopyLinkButton — copy absolute share URL with confirmation (#12)"
```

---

### Task 2: Wire into both screens + styling

**Files:**
- Modify: `src/routes/ConfigScreen.tsx` (add button beside `Open animation ↗`)
- Modify: `src/routes/PlayScreen.tsx` (add button beside `← config`)
- Modify: `src/framework/theme.css` (add `.copy-link-btn` rule)

**Interfaces:**
- Consumes: `CopyLinkButton` from Task 1.

- [ ] **Step 1: Wire ConfigScreen**

In `src/routes/ConfigScreen.tsx`, add the import:

```tsx
import { CopyLinkButton } from '../framework/CopyLinkButton'
```

Replace the single `Open animation` link at the bottom of the `<aside>` with the link plus the copy button:

```tsx
        <div className="config-actions">
          <Link className="open-btn" to={playHref}>
            Open animation ↗
          </Link>
          <CopyLinkButton href={playHref} />
        </div>
```

(`playHref` already exists at `ConfigScreen.tsx:38`.)

- [ ] **Step 2: Wire PlayScreen**

In `src/routes/PlayScreen.tsx`, add the import:

```tsx
import { CopyLinkButton } from '../framework/CopyLinkButton'
```

Add the copy button right after the `← config` link inside the `.play-screen` div:

```tsx
      <Link to={{ pathname: `/d/${diversion.id}`, search }} className="play-back">
        ← config
      </Link>
      <CopyLinkButton href={`/d/${diversion.id}/play${search}`} className="play-copy" />
```

(`search` is already destructured from `useLocation()` at `PlayScreen.tsx:9`.)

- [ ] **Step 3: Add styling**

In `src/framework/theme.css`, add after the `.open-btn` rule (~line 493):

```css
.config-actions {
  display: flex;
  gap: 0.5rem;
  align-items: stretch;
}
.config-actions .open-btn {
  flex: 1;
}
.copy-link-btn {
  min-width: 7.5rem; /* fits "🔗 Copy link" and "✓ Copied" — no reflow on swap */
  padding: 0.6rem 0.9rem;
  border: 1px solid var(--line, #2a2a35);
  border-radius: 6px;
  background: transparent;
  color: var(--fg, #e8e8ef);
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.copy-link-btn:hover {
  border-color: var(--accent, #6a7cff);
}
/* On the play screen the button sits in the top chrome next to ← config. */
.play-screen .play-copy {
  position: absolute;
  top: 1rem;
  left: 7rem;
  z-index: 5;
}
```

> NOTE for the implementer: open `theme.css` and confirm the actual CSS
> custom-property names in use (e.g. `--fg`, `--accent`, `--line`) near the
> existing `.open-btn` / `.play-back` rules, and match them. The fallbacks
> above keep it working even if a variable is absent. Confirm `.play-back`'s
> own `top`/`left` so `.play-copy` sits beside it without overlap.

- [ ] **Step 4: Run the full suite + typecheck**

Run: `npx vitest run`
Expected: PASS (all existing tests + the 4 new ones).

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git add src/routes/ConfigScreen.tsx src/routes/PlayScreen.tsx src/framework/theme.css
git commit -m "config/play: add Copy link button (#12)"
```

---

### Task 3: Code review

- [ ] Dispatch the `diversion-reviewer` subagent against the branch diff (`git diff main`). Focus: framework black-box rule (component takes a URL, no diversion coupling), the no-jump width pin, clipboard failure handling, and that both screens copy the PLAY url. Address any must-fix / should-fix findings; re-run tests after fixes.

---

### Task 4: Chrome verify + ship

- [ ] Ensure dev server is running on 5180 (`npm run dev`).
- [ ] In Chrome (chrome-devtools MCP), open `http://localhost:5180/d/flow-field` and `http://localhost:5180/d/flow-field/play?seed=10847`.
- [ ] Click the Copy link button on each screen; assert via `evaluate_script` that `navigator.clipboard.readText()` (or a spy) returns the absolute play URL, and that the label visibly swaps to `✓ Copied` then reverts. Confirm no layout jump on swap.
- [ ] Screenshot both screens for visual confirmation.
- [ ] On user-verify approval: squash if needed, FF-merge to `main`, delete the branch (local + remote), push `main` to trigger the GH Pages deploy, close #12.

---

## Self-Review

- **Spec coverage:** component (Task 1) ✓; both-screens-copy-play-url (Task 2 wiring) ✓; placement beside Open animation / ← config (Task 2) ✓; label copy + 1500ms + width pin + silent-honest failure (Task 1 + constraints) ✓; styling (Task 2) ✓; tests for all 4 behaviors (Task 1) ✓; out-of-scope items not implemented ✓.
- **Placeholder scan:** none — all code blocks are complete; the theme.css NOTE asks the implementer to confirm variable names against the live file (not a placeholder, a verification step).
- **Type consistency:** `CopyLinkButton({ href, className })` signature is identical across Task 1 (definition) and Task 2 (both call sites). `playHref` and `search` referenced by exact existing line numbers.
</content>
