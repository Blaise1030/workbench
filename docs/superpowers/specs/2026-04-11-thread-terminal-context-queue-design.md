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
2. From **Git Diff**, **Files**, **Folders**, or **Terminal**, user selects content (or invokes “Add to thread queue” on a folder/file row) → item appears on **T’s** queue with formatter-produced **`pasteText`**.
3. User opens **Queue / Review** for the active thread, inspects full text, reorders, deletes, or edits rows.
4. User clicks **Confirm** → app focuses **T’s agent terminal** → injects item 1, Enter, delay, item 2, Enter, … until done or an error stops the run.

## Architecture

### Chosen model (recommended)

**Central queue module** keyed by **`threadId`** (composable and/or small store):

- **Capture surfaces** call `addItem(activeThreadId, capture)`; if there is no active thread, show a clear message and do not enqueue.
- **Formatters** (one per source type: `diff`, `file`, `folder`, `terminal`) map capture + metadata → initial **`pasteText`**.
- **Review UI** reads and mutates the ordered list for the active thread only.
- **Injector** consumes the ordered list, resolves **agent terminal** for the thread, **focuses** it, then sequences **PTY writes**.

### Data model

- **`QueueItem`:** stable `id`, `source` (`diff` | `file` | `folder` | `terminal`), structured **metadata** (paths, line ranges, labels), and **`pasteText`** (authoritative string for preview and inject). User edits update **`pasteText`** only; metadata may become stale and that is acceptable for v1.

### Folder formatting (v1 rules)

- **`pasteText`** must include the **absolute or workspace-relative path** of the folder (match how file paths are shown elsewhere for consistency).
- Include a **bounded** listing: **max depth 2**, **max 50 entries**, then a single `… (truncated)` line. If the tree cannot be read, fall back to `Folder: <path>` plus one line explaining the read error.

## Edge cases and behavior

- **No active thread:** Do not enqueue; short explicit message.
- **Empty queue / no valid rows:** **Confirm** disabled. Rows with **empty `pasteText`** after edit block **Confirm** with per-row validation (recommended over silent drop).
- **Agent terminal missing / focus failure:** **No injection**; explain why; queue unchanged.
- **Mid-run PTY error:** **Stop**; leave **unsent** items in the queue; offer **Retry from failed item** or dismiss. No auto-skip without user action.
- **Inter-send delay:** Default delay (e.g. 100–300 ms) configurable in one place.

## Testing expectations

- **Formatter unit tests** per `source` with golden **`pasteText`** (including **folder** cases: shallow dir, deep truncation).
- **Thread isolation:** Enqueue on thread A does not appear in thread B’s queue.
- **Review mutations:** Reorder / delete / edit changes the list passed to the injector.
- **Injector tests** (mocked PTY + focus): verify write sequence, newlines, delay boundaries, and **no writes** when preconditions fail.

## Relation to existing code

- Reuse existing **thread** and **terminal** wiring (e.g. focus and **PTY write** abstractions used by `TerminalPane` / workspace layout). Do **not** overload **`pendingAgentBootstrap`** for this flow; keep a dedicated “context queue inject” path so behavior stays explicit and reviewable.

## Open points for implementation plan only

- Queue UI shape: **modal**, **side panel**, or **drawer** (match workbench patterns).
