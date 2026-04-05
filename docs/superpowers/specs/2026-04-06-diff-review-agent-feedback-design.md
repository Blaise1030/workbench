# Diff Review To Agent Feedback Design

**Date:** 2026-04-06  
**Status:** Draft (pending user review)

## Problem

The app has a Git Diff tab and an Agents tab, but there is no review workflow connecting them. A developer can inspect the diff and notice unsatisfactory changes, yet they must manually copy snippets, switch tabs, and rewrite feedback for the agent. That creates friction and weakens the review loop.

## Goals

- Let the developer select problematic diff lines and queue them as review items.
- Preserve enough context for each item to make the feedback actionable: file, line range, diff snippet, and optional reviewer note.
- Convert queued items into a structured draft prompt in the Agents experience.
- Navigate the user to the Agents tab automatically when they choose to continue there.
- Prefill the agent input box with a draft so the developer can review and edit before sending.

## Non-goals

- Auto-send the generated feedback to the agent.
- Full GitHub-style inline discussion threads inside the diff.
- Persisted server-backed review workflows or multi-user review state.
- Semantic code review or AI-generated findings without explicit user-selected lines.

## Recommended Approach

Use a **review basket** model.

The Diff tab remains the place where findings are collected. Users select lines or hunks from the rendered diff, queue them into a temporary basket, optionally annotate each item, and then open the Agents tab with a generated draft prompt loaded into a composer above the terminal.

This is preferred over directly auto-typing into the PTY because the current terminal surface is command-oriented and `pendingAgentBootstrap` is designed for one-shot bootstrap commands, not editable drafts. The new feedback flow needs explicit review and editing before send.

## User Experience

### Diff review flow

1. User opens the `Git Diff` tab.
2. User selects a range of unsatisfactory lines from a changed file or hunk.
3. User clicks `Queue for agent`.
4. The app creates a review item with:
   - file path
   - old/new line range when available
   - copied diff snippet
   - optional reviewer note
   - optional intent such as `fix`, `clarify`, or `rework`
5. The sticky diff header shows basket state such as `3 review items queued`.
6. User clicks `Open in Agents`.
7. The app switches to the `Agents` tab, ensures there is an active thread, and loads a generated feedback draft into the agent composer.
8. The developer edits the draft if needed and sends it manually.

### Agents flow

The Agents surface gains a composer above the existing terminal pane:

- multi-line draft input
- `Send` action
- `Discard draft` action
- optional `Regenerate from basket` action while review items still exist

The terminal remains visible below the composer and continues to represent the live PTY session for the active thread.

## Architecture

### Chosen model

The flow should use **renderer-owned transient state** first.

- The review basket lives in renderer state in `WorkspaceLayout.vue` or a dedicated composable.
- Draft text also lives in renderer state and is keyed by thread id.
- Workspace persistence is not required for the first version.

This keeps the feature lightweight and avoids mixing ephemeral review UI state into the SQLite-backed workspace model before the interaction has proven itself.

### Why not reuse `pendingAgentBootstrap`

`pendingAgentBootstrap` in `WorkspaceLayout.vue` and `TerminalPane.vue` is explicitly one-shot PTY input. It is consumed automatically and written into the terminal session. That behavior conflicts with the requirement that feedback be previewed and edited before send.

The feedback handoff therefore needs a separate path:

- `pendingAgentDraft` or `agentDraftByThreadId`
- rendered in a real composer UI
- submitted only on explicit user action

## Data Model

### Review item

Add a renderer-side type similar to:

```ts
type ReviewIntent = "fix" | "clarify" | "rework";

interface DiffReviewItem {
  id: string;
  worktreeId: string;
  threadId: string | null;
  filePath: string;
  oldLineStart: number | null;
  oldLineEnd: number | null;
  newLineStart: number | null;
  newLineEnd: number | null;
  snippet: string;
  note: string;
  intent: ReviewIntent | null;
  createdAt: string;
}
```

### Agent draft state

Add renderer-side state keyed by thread id:

```ts
type AgentDraftByThreadId = Record<string, string>;
```

This allows:

- one draft per thread
- safe thread switching without losing an unfinished review draft
- future restoration if the user navigates away and back

## Component Changes

### `src/components/DiffReviewPanel.vue`

Extend the diff panel from read-only review into review-item collection.

Add:

- selection affordance for chosen diff lines or hunks
- `Queue for agent` action near the active selection
- sticky header basket summary
- header actions:
  - `Open in Agents`
  - `Clear review items`

The panel should not own global review state. It should emit events upward with enough payload to create or remove review items.

Suggested emits:

```ts
queueReviewItem: [item: DraftDiffReviewSelection]
openInAgents: []
clearReviewItems: []
```

Where `DraftDiffReviewSelection` is a UI-facing payload derived from the current diff selection.

### `src/layouts/WorkspaceLayout.vue`

Own the cross-panel workflow state:

- review basket for the active worktree
- draft text by thread id
- current center-tab navigation

Add handlers:

- `handleQueueReviewItem(selection)`
- `handleOpenReviewInAgents()`
- `handleDiscardAgentDraft(threadId)`
- `handleSendAgentDraft(threadId)`

`handleOpenReviewInAgents()` should:

1. Determine the target thread.
2. If no active thread exists, create one using the existing thread creation flow.
3. Build a structured prompt from the queued review items.
4. Save the prompt into draft state for that thread.
5. Set `centerTab.value = "agent"`.
6. Ensure the selected thread is active.

### `src/components/TerminalPane.vue`

Do not make `TerminalPane` responsible for the draft composer.

Keep PTY attachment and terminal rendering focused on terminal concerns. If needed, wrap `TerminalPane` inside a higher-level `AgentPane` component that owns:

- composer textarea
- send/discard actions
- terminal body

This keeps terminal code isolated and avoids mixing xterm and form-state logic.

### `src/components/AgentPane.vue` (new)

Recommended new component.

Props:

```ts
threadId: string
worktreeId: string
cwd: string
draft: string
pendingAgentBootstrap?: { threadId: string; command: string } | null
```

Emits:

```ts
updateDraft: [value: string]
sendDraft: []
discardDraft: []
bootstrapConsumed: []
```

Layout:

- top composer section with textarea and actions
- bottom terminal section using the existing `TerminalPane`

## Draft Generation

The generated prompt should be structured and concise.

Example:

```text
Please address the following review findings from the current git diff.

1. file: src/foo.ts
lines: new 42-58
intent: rework
issue: This branch still mutates shared state.
snippet:
@@ ...

2. file: src/bar.vue
lines: new 10-18
intent: fix
issue: Loading state is missing for the retry path.
snippet:
@@ ...

Please make the required code changes and explain what you changed.
```

Rules:

- preserve item order from the review basket
- include only user-selected findings
- do not auto-infer issues if no reviewer note is supplied
- if note is empty, use neutral wording such as `Please review this selected change`

## Navigation And State Flow

### Queue review item

```text
User selects diff lines
  → DiffReviewPanel emits queueReviewItem(selection)
  → WorkspaceLayout adds review item to basket
  → DiffReviewPanel header updates queued count
```

### Open in Agents

```text
User clicks Open in Agents
  → WorkspaceLayout builds prompt from review basket
  → ensure active thread exists
  → save draft under target thread id
  → set active thread if needed
  → centerTab = "agent"
  → Agent composer renders draft for review
```

### Send draft

```text
User clicks Send
  → AgentPane emits sendDraft
  → WorkspaceLayout writes draft text to PTY session for active thread
  → append newline / Enter
  → clear draft for that thread
  → terminal continues as normal
```

## Error Handling

- If there is no active worktree, disable `Queue for agent`.
- If line selection cannot be mapped cleanly to file and line metadata, fall back to hunk-level snippet capture rather than dropping the selection.
- If thread creation fails during `Open in Agents`, keep the basket intact and show a recoverable error.
- If PTY send fails, preserve the draft text so the user can retry.

## Testing

### Unit tests

- `DiffReviewPanel` emits the correct selection payload when queueing a review item.
- `WorkspaceLayout` generates a structured draft from multiple review items in stable order.
- Opening in Agents switches `centerTab` to `agent` and targets the correct thread.
- Draft state remains attached to the correct thread when the user switches threads.
- Sending clears the draft only on success.

### Integration / UI tests

- Queue two review items from diff, open Agents, verify draft appears in composer and terminal remains visible.
- With no active thread, open Agents from diff and verify a new thread is created and selected before draft appears.
- Discarding the draft leaves the review basket unchanged unless explicitly cleared.

## Out of Scope

- Basket persistence across app restart
- Review-item reordering
- AI summarization of multiple findings into fewer comments
- Per-item resolved status
- Review drafts shared across multiple windows
