# Diff Review To Agent Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let developers queue selected git-diff findings, open the Agents tab, and review an editable draft in a composer before sending it to the active agent thread.

**Architecture:** Keep review state renderer-owned for the first version. `DiffReviewPanel` emits review selections upward, `WorkspaceLayout` owns the review basket plus per-thread draft state, and a new `AgentPane` wraps the existing `TerminalPane` so draft-editing UI stays separate from PTY mechanics.

**Tech Stack:** Vue 3 SFCs, Pinia workspace store, Electron preload `workspaceApi`, Vitest, Vue Test Utils, xterm.js.

**Spec:** `docs/superpowers/specs/2026-04-06-diff-review-agent-feedback-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `src/features/diffReview/types.ts` | Shared renderer-side types for queued diff review items and draft selections |
| `src/features/diffReview/promptBuilder.ts` | Pure prompt generation from queued review items |
| `src/features/diffReview/__tests__/promptBuilder.test.ts` | Unit tests for prompt ordering and fallback wording |
| `src/components/DiffReviewPanel.vue` | Add diff review basket affordances and emit review actions upward |
| `src/components/__tests__/DiffReviewPanel.test.ts` | Cover new toolbar actions and emitted review payloads |
| `src/components/AgentPane.vue` | New composer + terminal wrapper for draft review before send |
| `src/components/__tests__/AgentPane.test.ts` | Cover draft rendering and composer emits |
| `src/components/TerminalPane.vue` | Remains PTY-only; imported by `AgentPane` |
| `src/layouts/WorkspaceLayout.vue` | Own review basket, per-thread drafts, thread targeting, tab navigation, and PTY send flow |
| `src/layouts/__tests__/WorkspaceLayout.test.ts` | Integration coverage for open-in-agents, draft creation, thread creation fallback, and send behavior |

## Constraints and decisions

- Do not persist review basket or draft state in the Electron workspace store yet.
- Do not reuse `pendingAgentBootstrap` for review drafts; it is one-shot PTY input and violates the “review before send” requirement.
- Keep `TerminalPane` focused on PTY attach/write/resize; draft UI belongs in a higher-level wrapper.
- Preserve current thread behavior: if an active thread exists, use it; otherwise create one before opening the draft in Agents.
- Prefer hunk-level selection fallback if line-accurate metadata is not available from the rendered diff DOM.

---

### Task 1: Pure review types and prompt builder

**Files:**

- Create: `src/features/diffReview/types.ts`
- Create: `src/features/diffReview/promptBuilder.ts`
- Create: `src/features/diffReview/__tests__/promptBuilder.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `promptBuilder.test.ts` covering:

- items are rendered in stable input order
- each item includes file path, line summary, optional intent, note, and snippet
- empty `note` falls back to `Please review this selected change`
- mixed old/new line metadata formats correctly
- final prompt ends with a clear action request such as `Please make the required code changes and explain what you changed.`

Example expected assertion shape:

```ts
expect(buildAgentReviewPrompt([
  {
    id: "1",
    worktreeId: "wt-1",
    threadId: null,
    filePath: "src/foo.ts",
    oldLineStart: null,
    oldLineEnd: null,
    newLineStart: 10,
    newLineEnd: 12,
    snippet: "@@ ...",
    note: "",
    intent: "fix",
    createdAt: "2026-04-06T00:00:00.000Z"
  }
])).toContain("Please review this selected change");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/diffReview/__tests__/promptBuilder.test.ts`  
Expected: FAIL with missing module / missing export errors.

- [ ] **Step 3: Write minimal implementation**

Create:

- `types.ts` with `ReviewIntent`, `DiffReviewItem`, and a small `DraftDiffReviewSelection` input type for UI events
- `promptBuilder.ts` with a pure `buildAgentReviewPrompt(items: DiffReviewItem[]): string`

Implementation rules:

- preserve item order
- include only explicit user-provided note text
- if note is empty, use the neutral fallback wording
- emit concise line labels such as `lines: new 10-12` or `lines: old 3-6, new 4-7`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/diffReview/__tests__/promptBuilder.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/diffReview/types.ts src/features/diffReview/promptBuilder.ts src/features/diffReview/__tests__/promptBuilder.test.ts
git commit -m "feat(diff-review): add review item types and prompt builder"
```

---

### Task 2: Build `AgentPane` and keep `TerminalPane` PTY-only

**Files:**

- Create: `src/components/AgentPane.vue`
- Create: `src/components/__tests__/AgentPane.test.ts`
- Modify: `src/components/TerminalPane.vue`

- [ ] **Step 1: Write the failing component test**

Add `AgentPane.test.ts` covering:

- incoming `draft` prop is shown in a textarea
- typing emits `updateDraft`
- clicking `Send` emits `sendDraft`
- clicking `Discard draft` emits `discardDraft`
- `TerminalPane` is still rendered inside the wrapper

Mock `TerminalPane.vue` so the test stays focused on the composer contract.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/__tests__/AgentPane.test.ts`  
Expected: FAIL because `AgentPane.vue` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement `AgentPane.vue` with:

- props:

```ts
threadId: string
worktreeId: string
cwd: string
draft: string
pendingAgentBootstrap?: { threadId: string; command: string } | null
```

- emits:

```ts
updateDraft: [value: string]
sendDraft: []
discardDraft: []
bootstrapConsumed: []
```

Layout:

- textarea at top with label like `Agent draft`
- button row with `Send` and `Discard draft`
- existing `TerminalPane` below, forwarding PTY props and `bootstrapConsumed`

Do not add PTY write logic here.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/__tests__/AgentPane.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/AgentPane.vue src/components/__tests__/AgentPane.test.ts src/components/TerminalPane.vue
git commit -m "feat(agent): add editable agent pane composer"
```

---

### Task 3: Extend `DiffReviewPanel` for queueing and basket actions

**Files:**

- Modify: `src/components/DiffReviewPanel.vue`
- Modify: `src/components/__tests__/DiffReviewPanel.test.ts`

- [ ] **Step 1: Write the failing tests**

Update `DiffReviewPanel.test.ts` to cover:

- header shows basket count when `queuedReviewCount > 0`
- clicking `Open in Agents` emits `openInAgents`
- clicking `Clear review items` emits `clearReviewItems`
- queue action emits `queueReviewItem` with a selection payload

If line-selection DOM parsing is too difficult to unit test directly, test a smaller extracted method or a simpler fallback path such as “queue current raw hunk selection”.

Example prop additions to support testability:

```ts
queuedReviewCount: number
canQueueReview: boolean
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/__tests__/DiffReviewPanel.test.ts`  
Expected: FAIL because the new props/emits/actions do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add to `DiffReviewPanel.vue`:

- new props for `queuedReviewCount` and selection/basket affordances as needed
- emits:

```ts
stageAll: []
discardAll: []
queueReviewItem: [selection: DraftDiffReviewSelection]
openInAgents: []
clearReviewItems: []
```

- sticky-header review basket summary
- `Open in Agents` and `Clear review items` actions
- a first-pass queueing mechanic

Implementation note:

- Prefer a pragmatic first version: queue the active hunk or raw selected snippet with best-effort metadata.
- If exact line selection inside `diff2html` is expensive, start with hunk-level queueing and leave line-perfect refinement for a follow-up.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/components/__tests__/DiffReviewPanel.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/DiffReviewPanel.vue src/components/__tests__/DiffReviewPanel.test.ts
git commit -m "feat(diff-review): queue review items from diff panel"
```

---

### Task 4: Wire basket state and draft state in `WorkspaceLayout`

**Files:**

- Modify: `src/layouts/WorkspaceLayout.vue`
- Modify: `src/layouts/__tests__/WorkspaceLayout.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Extend `WorkspaceLayout.test.ts` to cover:

- when `DiffReviewPanel` emits `openInAgents`, layout switches to the `agent` tab and renders the draft in `AgentPane`
- generated draft uses current basket items in stable order
- draft state is keyed by thread id, so switching away and back preserves unsent text

Mock `DiffReviewPanel` and `AgentPane` with small test doubles so the test can drive emitted events and inspect props.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/layouts/__tests__/WorkspaceLayout.test.ts`  
Expected: FAIL because basket state and draft state do not exist yet.

- [ ] **Step 3: Write minimal implementation**

In `WorkspaceLayout.vue` add:

- `reviewItemsByWorktreeId` or equivalent renderer-only state
- `agentDraftByThreadId`
- `handleQueueReviewItem(selection)`
- `handleOpenReviewInAgents()`
- `handleDiscardAgentDraft(threadId)`

Use `buildAgentReviewPrompt()` from Task 1 to generate draft text.

Wire:

- `DiffReviewPanel` props/events
- `AgentPane` in place of direct `TerminalPane` for the `agent` center tab

Keep the current shell-terminal tabs unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/layouts/__tests__/WorkspaceLayout.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/WorkspaceLayout.vue src/layouts/__tests__/WorkspaceLayout.test.ts
git commit -m "feat(workspace): wire diff review basket into agent drafts"
```

---

### Task 5: Handle “no active thread” by creating one before opening draft

**Files:**

- Modify: `src/layouts/WorkspaceLayout.vue`
- Modify: `src/layouts/__tests__/WorkspaceLayout.test.ts`

- [ ] **Step 1: Write the failing test**

Add a `WorkspaceLayout` test where:

- snapshot has an active project/worktree but `activeThreadId` is `null`
- `createThread` is mocked to return a thread id
- opening review in Agents creates the thread, activates it, and places the generated draft into that new thread’s composer

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/layouts/__tests__/WorkspaceLayout.test.ts -t "creates a thread before opening review draft"`  
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

In `handleOpenReviewInAgents()`:

- use `workspace.activeThreadId` when present
- otherwise call the existing thread creation flow with a sensible default title
- ensure the new thread is activated before showing the draft
- leave basket intact if thread creation fails

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/layouts/__tests__/WorkspaceLayout.test.ts -t "creates a thread before opening review draft"`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/WorkspaceLayout.vue src/layouts/__tests__/WorkspaceLayout.test.ts
git commit -m "feat(workspace): create thread for queued diff feedback when needed"
```

---

### Task 6: Send draft through the PTY and preserve it on failure

**Files:**

- Modify: `src/layouts/WorkspaceLayout.vue`
- Modify: `src/layouts/__tests__/WorkspaceLayout.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests covering:

- clicking `Send` writes draft text plus newline to the active thread session via `workspaceApi.ptyWrite`
- successful send clears `agentDraftByThreadId[targetThreadId]`
- rejected `ptyWrite` keeps the draft so the user can retry

Prefer test doubles for `AgentPane` that emit `sendDraft`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/layouts/__tests__/WorkspaceLayout.test.ts -t "sends the draft to the active agent session"`  
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Implement `handleSendAgentDraft(threadId)` in `WorkspaceLayout.vue`:

- read current draft for the target thread
- no-op on blank draft
- call `workspaceApi.ptyWrite(threadId, \`\${draft}\r\`)`
- clear draft only after successful resolution
- keep draft unchanged on error

Do not route through `sendRunInput`; this flow is operating on the PTY-backed agent terminal already used by `TerminalPane`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/layouts/__tests__/WorkspaceLayout.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/WorkspaceLayout.vue src/layouts/__tests__/WorkspaceLayout.test.ts
git commit -m "feat(agent): send queued diff review drafts through PTY"
```

---

### Task 7: Final verification and UI pass

**Files:**

- Verify only; no intended file changes

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm test -- src/features/diffReview/__tests__/promptBuilder.test.ts
npm test -- src/components/__tests__/DiffReviewPanel.test.ts
npm test -- src/components/__tests__/AgentPane.test.ts
npm test -- src/layouts/__tests__/WorkspaceLayout.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS with no type errors.

- [ ] **Step 3: Manual verification in Electron**

Verify:

1. queue one diff finding and confirm basket count updates
2. open Agents and confirm the draft appears in the composer, unsent
3. edit the draft, switch threads, switch back, and confirm draft persistence
4. send draft and confirm it is written into the active agent terminal
5. clear review items and confirm the basket resets

- [ ] **Step 4: Commit any final polish**

```bash
git add src/components src/layouts src/features/diffReview
git commit -m "feat(diff-review): complete agent feedback handoff flow"
```

---

## Notes for execution

- Follow the existing workspace and tab patterns already present in `WorkspaceLayout.vue`.
- Keep the first version biased toward reliable selection capture over perfect diff-line fidelity.
- If `DiffReviewPanel` line-selection complexity starts to dominate the task, stop at hunk/snippet queueing and document the limitation in the implementation PR rather than expanding scope.
- There is already a `DiffReviewPanel` test mentioning `Open Agent tab`; reconcile or replace that behavior instead of layering a second navigation concept on top.
