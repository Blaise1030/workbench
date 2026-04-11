# Thread Terminal Context Queue Design

**Date:** 2026-04-11  
**Status:** Draft (pending user review)

## Problem

Users work across **Git Diff**, **Files** (including **folders**), and the **Terminal**, while the **agent** lives in a separate terminal tab. Sending structured context from those surfaces into the agent today means manual copy, tab switch, paste, and repeat. That is slow, error-prone, and not tied to the **active thread’s** working context.

## Goals

- **Thread-scoped queue:** Each thread has its own queue. Only the **active thread’s** queue is visible and editable; switching threads switches queues.
- **Capture sources:** User can enqueue context from:
  - **Git Diff** (selection / hunk scope with file path and line context where available)
  - **Files** (file path, optional line range, snippet)
  - **Folders** (folder path; formatted listing or path-only per formatter rules below)
  - **Terminal** (highlighted output, with clear “from terminal” framing in formatted text)
- **Selection popup:** Whenever the user has a **meaningful highlight** (see below), a **small popup** appears **anchored at the end of the selection** (trailing edge of the highlighted range — the “active” end of the selection). The popup offers **Queue** (and optionally dismiss). Choosing **Queue** runs the same capture + formatter path as today and adds one **`QueueItem`** for the active thread.
- **App-formatted payload:** Each queue row stores **`pasteText`** — the exact string that will be injected. Formatters produce initial `pasteText`; the user sees that text in review.
- **Full review before send:** Review UI shows **full** `pasteText` per row, with **reorder**, **delete**, and **edit**. Single **Confirm** sends the whole ordered list.
- **Injection semantics:** On **Confirm**, the app **auto-focuses** that thread’s **agent terminal**, then for each item in order: **write `pasteText` + line break** to the PTY (same effect as paste + Enter), with a **short configurable delay** between items so the agent can keep up.
- **Session-only state:** Queues are **ephemeral** (in-memory). They do not persist across app restart.

## Non-goals

- Persisting queues or comments to disk / workspace DB (first version).
- Auto-send without user **Confirm**.
- Server sync or multi-user shared queues.
- Replacing or merging with the separate **diff → composer draft** flow described in `2026-04-06-diff-review-agent-feedback-design.md` unless product later unifies them; this spec is explicitly **PTY sequential injection** after review.

## User experience

1. User works on **thread T** (active).
2. User creates a **highlight** in a supported surface (see **Meaningful highlight**). A **popup** appears at the **end of that highlight** with a **Queue** action (and a way to close without queuing, e.g. click-away or small dismiss).
3. User taps **Queue** → one item appears on **T’s** queue with formatter-produced **`pasteText`** (same rules as before). The popup closes after a successful enqueue (or stays open with an error if enqueue is blocked — e.g. no active thread).
4. User opens **Queue / Review** for the active thread, inspects full text, reorders, deletes, or edits rows.
5. User clicks **Confirm** → app focuses **T’s agent terminal** → injects item 1, Enter, delay, item 2, Enter, … until done or an error stops the run.

### Meaningful highlight

- **Git Diff, file editor content, terminal buffer:** A **non-empty text selection** after the gesture completes (e.g. mouseup / keyboard selection settled). **Caret-only** (zero-length) does **not** show the popup.
- **Files panel (tree / list):** A **selected row** (file or folder) counts as a highlight even without in-cell text selection. Anchor the popup to the **row’s trailing area** (or end of the name cell) so it reads as attached to that row; **Queue** enqueues **file** or **folder** capture for that row using the folder rules when the row is a directory.

### Selection popup behavior

- **Anchor:** Prefer the **visual end** of the selection range (diff/editor/terminal). If geometry is unavailable, fall back to **cursor / focus rect** for that surface.
- **Lifecycle:** Hide the popup when the **selection is cleared**, the **surface loses focus**, the user **scrolls** the anchoring view in a way that invalidates position, or the user **starts a new selection**. Recompute position on resize.
- **Stacking:** Popup must sit **above** the editor/diff/terminal content and **not** steal focus until the user interacts with it (keyboard users can still Tab into it per platform norms).
- **Single instance:** At most **one** queue popup visible app-wide (new highlight in another surface **moves** or **replaces** it).

## Architecture

### Chosen model (recommended)

**Central queue module** keyed by **`threadId`** (composable and/or small store):

- **Capture surfaces** (and the **selection popup** controller) call `addItem(activeThreadId, capture)`; if there is no active thread, show a clear message and do not enqueue.
- **Formatters** (one per source type: `diff`, `file`, `folder`, `terminal`) map capture + metadata → initial **`pasteText`**.
- **Review UI** reads and mutates the ordered list for the active thread only.
- **Injector** consumes the ordered list, resolves **agent terminal** for the thread, **focuses** it, then sequences **PTY writes**.

### Data model

- **`QueueItem`:** stable `id`, `source` (`diff` | `file` | `folder` | `terminal`), structured **metadata** (paths, line ranges, labels), and **`pasteText`** (authoritative string for preview and inject). User edits update **`pasteText`** only; metadata may become stale and that is acceptable for v1.

### Folder formatting (v1 rules)

- **`pasteText`** must include the **absolute or workspace-relative path** of the folder (match how file paths are shown elsewhere for consistency).
- Include a **bounded** listing: **max depth 2**, **max 50 entries**, then a single `… (truncated)` line. If the tree cannot be read, fall back to `Folder: <path>` plus one line explaining the read error.

## Edge cases and behavior

- **Popup viewport:** Clamp position so the popup stays **on-screen**; flip above the selection if there is no room below.
- **Rapid selection changes:** While the user is still dragging, do not show the popup (or keep it hidden) until **selection is finalized**; avoid flicker.
- **No active thread:** Do not enqueue; short explicit message (popup can show this **inline** or via toast).
- **Empty queue / no valid rows:** **Confirm** disabled. Rows with **empty `pasteText`** after edit block **Confirm** with per-row validation (recommended over silent drop).
- **Agent terminal missing / focus failure:** **No injection**; explain why; queue unchanged.
- **Mid-run PTY error:** **Stop**; leave **unsent** items in the queue; offer **Retry from failed item** or dismiss. No auto-skip without user action.
- **Inter-send delay:** Default delay (e.g. 100–300 ms) configurable in one place.

## Testing expectations

- **Formatter unit tests** per `source` with golden **`pasteText`** (including **folder** cases: shallow dir, deep truncation).
- **Thread isolation:** Enqueue on thread A does not appear in thread B’s queue.
- **Review mutations:** Reorder / delete / edit changes the list passed to the injector.
- **Injector tests** (mocked PTY + focus): verify write sequence, newlines, delay boundaries, and **no writes** when preconditions fail.
- **Selection popup:** Tests (or focused component specs) for **show/hide** tied to selection lifecycle, **anchor updates**, and **Queue** invoking `addItem` with the expected capture for diff / editor / terminal / file row.

## Relation to existing code

- Reuse existing **thread** and **terminal** wiring (e.g. focus and **PTY write** abstractions used by `TerminalPane` / workspace layout). Do **not** overload **`pendingAgentBootstrap`** for this flow; keep a dedicated “context queue inject” path so behavior stays explicit and reviewable.

## Open points for implementation plan only

- Queue UI shape: **modal**, **side panel**, or **drawer** (match workbench patterns).
- Whether the popup includes only **Queue** or also **Queue and open review** (v1 can stay **Queue** only).
