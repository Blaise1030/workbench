# Terminal Auto-Title (One-Time) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once per thread, when the title is still the default agent title and the user has not yet received a prompt-derived title, derive a short thread title from integrated-terminal output using a pluggable summarizer (default: deterministic heuristic), then persist a consumed flag so the pipeline never runs again.

**Architecture:** Extend `threads` with `terminal_auto_title_consumed_at` (single source of truth). Eligibility reuses the same “default title” predicate as `WorkspaceService.captureInitialPrompt` (`hasDefaultGeneratedTitle`). Prompt capture wins: `captureInitialPrompt` sets the consumed flag whenever it records a session/title so terminal never races after the first submitted prompt line. `PtyService` gains idle debouncing on PTY output; the main process calls `WorkspaceService.maybeRenameThreadFromTerminalBuffer(threadId, buffer)` which strips ANSI, builds an excerpt, calls the summarizer, and renames via `WorkspaceStore.renameThread` with consumption. User renames from the renderer always mark consumed.

**Tech Stack:** Electron main (`better-sqlite3`), TypeScript, Vitest, existing `PtyService` / `WorkspaceService` / `WorkspaceStore`.

**Spec:** [2026-04-09-terminal-auto-title-design.md](../specs/2026-04-09-terminal-auto-title-design.md)

---

## File map

| File | Role |
|------|------|
| `apps/desktop/src/shared/domain.ts` | `Thread` + optional `terminalAutoTitleConsumedAt` |
| `apps/desktop/electron/storage/schema.sql` | New column on `threads` |
| `apps/desktop/electron/storage/store.ts` | Migration, `upsertThread`, `renameThread` with consumption |
| `apps/desktop/src/shared/threadTitlePolicy.ts` (new) | `DEFAULT_THREAD_LABELS`, `hasDefaultGeneratedTitle` (shared with main + tests) |
| `apps/desktop/electron/services/workspaceService.ts` | Refactor to import policy; extend `captureInitialPrompt`; add `maybeRenameThreadFromTerminalBuffer`; `renameThread` sets consumed for IPC renames |
| `apps/desktop/electron/services/terminalTitleSummarizer.ts` (new) | `TerminalTitleSummarizer` type + `heuristicSummarizeTerminalExcerpt` |
| `apps/desktop/electron/services/terminalExcerpt.ts` (new) | Strip ANSI, take last *K* chars, min length check |
| `apps/desktop/electron/services/ptyService.ts` | Debounced idle callback after `onData` |
| `apps/desktop/electron/mainApp.ts` | Wire Pty idle → workspace service; ensure `emitWorkspaceDidChange` after rename |
| `apps/desktop/electron/services/__tests__/workspaceService.test.ts` | Eligibility, consumption, prompt vs terminal |
| `apps/desktop/electron/services/__tests__/terminalExcerpt.test.ts` (new) | ANSI strip / excerpt |
| `apps/desktop/electron/storage/__tests__/store.test.ts` | Migration / round-trip for new column |

---

### Task 1: Schema, domain, and store

**Files:**
- Modify: `apps/desktop/electron/storage/schema.sql` (append column to `CREATE TABLE threads` for fresh installs)
- Modify: `apps/desktop/electron/storage/store.ts` (`migrate`, `upsertThread`, `renameThread`, `getThread` SELECT list)
- Modify: `apps/desktop/src/shared/domain.ts` (`Thread`)
- Modify: `apps/desktop/electron/storage/__tests__/store.test.ts`

- [ ] **Step 1: Add column and types**

Add to `Thread` in `domain.ts`:

```ts
/** ISO timestamp when one-time terminal auto-title was applied or skipped permanently; null means not yet consumed. */
terminalAutoTitleConsumedAt: string | null;
```

In `schema.sql`, add to `threads` definition: `terminal_auto_title_consumed_at TEXT` (before `created_at` is fine).

In `store.migrate()`, after existing migrations, add pragma check for `terminal_auto_title_consumed_at` on `threads`; if missing: `ALTER TABLE threads ADD COLUMN terminal_auto_title_consumed_at TEXT`.

- [ ] **Step 2: Extend `upsertThread` INSERT/UPDATE** to include `terminalAutoTitleConsumedAt` (map camelCase ↔ snake_case like other fields).

- [ ] **Step 3: Extend `renameThread`** to accept optional consumption:

```ts
renameThread(
  id: string,
  title: string,
  options?: { consumeTerminalAutoTitle?: boolean }
): void
```

When `consumeTerminalAutoTitle !== false`, set `terminal_auto_title_consumed_at` to current ISO time in the same UPDATE as title. When `false`, leave column unchanged (only used if needed for internal no-op paths; default true).

- [ ] **Step 4: Tests** — In `store.test.ts`, create thread with `terminalAutoTitleConsumedAt: null`, upsert, reopen store, expect column round-trips. Call `renameThread` with default options, expect consumed timestamp set.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/domain.ts apps/desktop/electron/storage/schema.sql apps/desktop/electron/storage/store.ts apps/desktop/electron/storage/__tests__/store.test.ts
git commit -m "feat(storage): add threads.terminal_auto_title_consumed_at"
```

---

### Task 2: Shared default-title policy

**Files:**
- Create: `apps/desktop/src/shared/threadTitlePolicy.ts`
- Modify: `apps/desktop/electron/services/workspaceService.ts`

- [ ] **Step 1: Add policy module** (included in `tsconfig.electron.json` via `src/shared`):

```ts
import type { Thread, ThreadAgent } from "./domain.js";

export const DEFAULT_THREAD_TITLES: Record<ThreadAgent, string> = {
  claude: "Claude Code",
  cursor: "Cursor Agent",
  codex: "Codex CLI",
  gemini: "Gemini CLI"
};

export function hasDefaultGeneratedTitle(thread: Thread): boolean {
  const base = DEFAULT_THREAD_TITLES[thread.agent];
  return thread.title === base || thread.title.startsWith(`${base} · `);
}
```

- [ ] **Step 2: Remove** duplicate `DEFAULT_THREAD_TITLES` / private `hasDefaultGeneratedTitle` from `workspaceService.ts` and import from `threadTitlePolicy.js`.

- [ ] **Step 3: Ensure** `createThread` in `WorkspaceService` passes `terminalAutoTitleConsumedAt: null` — **via store** `upsertThread` from thread object: extend `createThread` to build `thread` with `terminalAutoTitleConsumedAt: null` (add field to object in `createThread`).

- [ ] **Step 4: Run tests**

Run: `cd apps/desktop && pnpm exec vitest run electron/services/__tests__/workspaceService.test.ts electron/storage/__tests__/store.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/threadTitlePolicy.ts apps/desktop/electron/services/workspaceService.ts
git commit -m "refactor: share hasDefaultGeneratedTitle for terminal auto-title"
```

---

### Task 3: Terminal excerpt + summarizer

**Files:**
- Create: `apps/desktop/electron/services/terminalExcerpt.ts`
- Create: `apps/desktop/electron/services/terminalTitleSummarizer.ts`
- Create: `apps/desktop/electron/services/__tests__/terminalExcerpt.test.ts`

- [ ] **Step 1: `terminalExcerpt.ts`**

```ts
const ANSI_ESCAPE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

export function stripAnsi(input: string): string {
  return input.replace(ANSI_ESCAPE, "");
}

/** Max chars sent to summarizer (design: cap input). */
export const TERMINAL_EXCERPT_MAX_CHARS = 8000;

export function buildTerminalExcerpt(rawBuffer: string, maxChars = TERMINAL_EXCERPT_MAX_CHARS): string {
  const stripped = stripAnsi(rawBuffer);
  const trimmed = stripped.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(-maxChars).trimStart();
}

/** Enough signal to bother the summarizer (tune: 80+ non-whitespace chars). */
export function hasEnoughTerminalSignal(excerpt: string, minNonWhitespace = 80): boolean {
  const nw = excerpt.replace(/\s+/g, "").length;
  return nw >= minNonWhitespace;
}
```

- [ ] **Step 2: `terminalTitleSummarizer.ts`**

```ts
export type TerminalTitleSummarizer = (excerpt: string) => Promise<string | null>;

const MAX_TITLE_LEN = 68;

function firstMeaningfulLine(excerpt: string): string | null {
  const lines = excerpt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) return null;
  const cleaned = last.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length <= MAX_TITLE_LEN ? cleaned : `${cleaned.slice(0, MAX_TITLE_LEN - 3).trimEnd()}...`;
}

/** Default “lightweight” implementation: single-line heuristic (swap for LLM later). */
export function heuristicTerminalTitleSummarizer(excerpt: string): Promise<string | null> {
  return Promise.resolve(firstMeaningfulLine(excerpt));
}
```

- [ ] **Step 3: Tests** — Buffer with ANSI `\x1b[31m` + text → strip; excerpt length; `hasEnoughTerminalSignal` boundary at 79 vs 80.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/electron/services/terminalExcerpt.ts apps/desktop/electron/services/terminalTitleSummarizer.ts apps/desktop/electron/services/__tests__/terminalExcerpt.test.ts
git commit -m "feat(electron): terminal excerpt + heuristic title summarizer"
```

---

### Task 4: WorkspaceService — terminal rename + consumption rules

**Files:**
- Modify: `apps/desktop/electron/services/workspaceService.ts`
- Modify: `apps/desktop/electron/services/__tests__/workspaceService.test.ts`

**Eligibility (must all hold):**

1. `thread.terminalAutoTitleConsumedAt == null`
2. `hasDefaultGeneratedTitle(thread)`
3. `getThreadSession(threadId)?.titleCapturedAt == null` — prompt capture has not run yet (same race rule as design: prompt path wins once `titleCapturedAt` exists)

**Consumption:** Set `terminalAutoTitleConsumedAt` on the thread row whenever:

- Terminal auto-title successfully applies a new title (or even if summarizer returns null after we decide to “give up” one-time — see below).
- User calls `renameThread` from IPC (always `consumeTerminalAutoTitle: true` default).
- `captureInitialPrompt` persists session / title capture — update thread to set consumed so terminal never runs after prompt pipeline.

**Give up:** If summarizer returns null but buffer had “enough signal”, still mark consumed to avoid infinite retries (spec: one shot). If buffer never reaches `hasEnoughTerminalSignal`, do **not** consume (user might still type a prompt).

- [ ] **Step 1: Add deps** to `WorkspaceService` constructor: accept `TerminalTitleSummarizer` as optional third param with default `heuristicTerminalTitleSummarizer`, or instantiate default inside `maybeRenameThreadFromTerminalBuffer` — **YAGNI:** import heuristic directly.

- [ ] **Step 2: Implement `async maybeRenameThreadFromTerminalBuffer(threadId: string, rawBuffer: string): Promise<boolean>`** — returns true when the store changed (rename or consumed).

Guard clauses (return `false`): excerpt too small; missing thread; `terminalAutoTitleConsumedAt` set; `!hasDefaultGeneratedTitle(thread)`; `getThreadSession(threadId)?.titleCapturedAt != null`.

Then `const title = await summarizer(excerpt)` (inject `TerminalTitleSummarizer`, default `heuristicTerminalTitleSummarizer`).

- If `title` is null/empty after trim: call `store.markTerminalAutoTitleConsumed(threadId)` (one-shot give-up) and return `true`.

- If `title` equals current `thread.title`: call `markTerminalAutoTitleConsumed` only (still consumed) and return `true`.

- Else: `store.renameThread(threadId, title, { consumeTerminalAutoTitle: true })` and return `true`.

- [ ] **Step 3: Add `markTerminalAutoTitleConsumed` on `WorkspaceStore`:**

```ts
markTerminalAutoTitleConsumed(threadId: string): void {
  const now = new Date().toISOString();
  this.db
    .prepare("UPDATE threads SET terminal_auto_title_consumed_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, threadId);
}
```

- [ ] **Step 4: `captureInitialPrompt`** — whenever the method would `upsertThreadSession` with `titleCapturedAt`, also call `markTerminalAutoTitleConsumed(threadId)` **before** or after, so thread row reflects consumption even if `renameThread` is skipped (title equals). **Also** call `markTerminalAutoTitleConsumed` when entering the block that sets session for the first time.

Read existing `captureInitialPrompt` and insert `this.store.markTerminalAutoTitleConsumed(threadId)` in all branches that successfully establish prompt capture (including when `thread.title === nextTitle`).

- [ ] **Step 5: `renameThread(threadId, title)`** (public API) — call `this.store.renameThread(threadId, title, { consumeTerminalAutoTitle: true })`.

- [ ] **Step 6: Tests** in `workspaceService.test.ts`:

- Default-titled thread, no session, enough excerpt → renamed + consumed.
- `titleCapturedAt` set → no rename from terminal.
- After user `renameThread`, terminal buffer ignored.
- `captureInitialPrompt` sets consumed → terminal skipped (mock store session).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/electron/services/workspaceService.ts apps/desktop/electron/services/__tests__/workspaceService.test.ts apps/desktop/electron/storage/store.ts
git commit -m "feat(workspace): one-shot terminal-derived thread title"
```

---

### Task 5: PtyService idle hook

**Files:**
- Modify: `apps/desktop/electron/services/ptyService.ts`

- [ ] **Step 1: Add** private `idleTimerBySessionId = new Map<string, ReturnType<typeof setTimeout>>()` and constant `PTY_IDLE_MS = 2000`.

- [ ] **Step 2: Add** `setBufferIdleListener(cb: ((sessionId: string, buffer: string) => void) | null)` similar to `setSubmittedInputListener`.

- [ ] **Step 3: In `instance.onData`**, after appending to buffer, `clearTimeout` previous timer for `sessionId`, `setTimeout` for `PTY_IDLE_MS` that invokes `cb(sessionId, session.buffer)`.

- [ ] **Step 4: In `kill`**, clear timer for session.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/services/ptyService.ts
git commit -m "feat(pty): fire buffer idle callback for terminal auto-title"
```

---

### Task 6: Main process wiring

**Files:**
- Modify: `apps/desktop/electron/mainApp.ts`

- [ ] **Step 1: After** `ptyService.setSubmittedInputListener(...)`, add:

```ts
ptyService.setBufferIdleListener(async (sessionId, buffer) => {
  const changed = await workspaceService.maybeRenameThreadFromTerminalBuffer(sessionId, buffer);
  if (changed) emitWorkspaceDidChange();
});
```

- [ ] **Step 2: Ensure** `maybeRenameThreadFromTerminalBuffer` returns `Promise<boolean>` and resolves after DB write.

- [ ] **Step 3: Manual smoke** — run `pnpm run dev:electron`, create thread with empty prompt (default title), run `ls` in terminal, wait 2s, confirm title updates once.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/electron/mainApp.ts
git commit -m "feat(electron): wire PTY idle to terminal auto-title"
```

---

### Task 7: Full test sweep and typecheck

- [ ] **Step 1:** `cd apps/desktop && pnpm test && pnpm run build:electron`

- [ ] **Step 2:** Fix any TS errors from `Thread` requiring new field in fixtures across tests (grep `makeThread` / thread literals).

- [ ] **Step 3:** Commit fixes if needed.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| One rename per thread | `terminal_auto_title_consumed_at` + `markTerminalAutoTitleConsumed` on give-up |
| Generic title only | `hasDefaultGeneratedTitle` + consumed null |
| Prompt / user wins | `titleCapturedAt` check + IPC `renameThread` consumes |
| Trimmed excerpt, ANSI stripped | Task 3 |
| Pluggable summarizer | `TerminalTitleSummarizer`; default heuristic |
| No placeholder TBD | Constants inlined (68, 8000, 80, 2000 ms) |

## Placeholder scan

No TBD/TODO left; open follow-up is swapping heuristic for real LLM behind the same interface.

## Type consistency

- `Thread.terminalAutoTitleConsumedAt` matches store column everywhere `Thread` is constructed in tests and `createThread`.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-09-terminal-auto-title.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach do you want?
