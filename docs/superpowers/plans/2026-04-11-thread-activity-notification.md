# Thread Activity Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use @superpowers/subagent-driven-development (recommended) or @superpowers/executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align thread idle attention and chirps with real thread focus (`activeThreadId`), shorten idle delay to 1s, and ignore PTY echo from recent user typing.

**Architecture:** Extend `useThreadPtyRunStatus` with `activeThreadId` and a short-lived per-session input timestamp map; treat PTY chunks as non-activity if they arrive within 300ms of `markUserInput`. Emit `user-typed` from `TerminalPane` whenever user-driven data is sent to the PTY (`terminal.onData`), and wire it from `WorkspaceLayout` together with `activeThreadId`. Optionally drop unused `visibleSessionId` from the composable API in the same PR.

**Tech Stack:** Vue 3 (`ref`, `computed`, `watch`), Vitest, existing `window.workspaceApi.onPtyData` bridge.

**Spec:** `docs/superpowers/specs/2026-04-11-thread-activity-notification-design.md`

---

## File map

| File | Role |
|------|------|
| `apps/desktop/src/composables/useThreadPtyRunStatus.ts` | Idle timeout, `inFocus` via `activeThreadId`, watcher, `markUserInput` + early return in `applyChunk`; remove `visibleSessionId` from opts (recommended). |
| `apps/desktop/src/composables/__tests__/useThreadPtyRunStatus.test.ts` | Harness + assertions updated for 1s idle, `activeThreadId`, new cases (focus vs visible pane, input suppression). |
| `apps/desktop/src/components/TerminalPane.vue` | `user-typed` emit from user stdin path (`onData`). |
| `apps/desktop/src/layouts/WorkspaceLayout.vue` | Pass `activeThreadId`, destructure `markUserInput`, `@user-typed` on agent + shell `TerminalPane` instances. |

**Non-changes (per spec):** `ThreadRow.vue`, `attentionRules.ts`.

**Out of scope:** `AgentPane.vue` embeds `TerminalPane` but is not used by production layout today; if it is wired later, forward `@user-typed` the same way.

---

### Task 1: Failing tests — harness and idle duration

**Files:**
- Modify: `apps/desktop/src/composables/__tests__/useThreadPtyRunStatus.test.ts`

- [ ] **Step 1: Extend test harness**

Add `activeThreadId: Ref<string | null>` alongside `vis` (or replace `vis` once implementation drops `visibleSessionId`). Pass `activeThreadId` into `useThreadPtyRunStatus`; if the implementation still expects `visibleSessionId` temporarily, pass both until Task 4 removes it.

Update every `vi.advanceTimersByTime(5000)` to `1000` in expectations that assert idle completion.

- [ ] **Step 2: Rename / repurpose visibility tests**

Replace “visible session” semantics with “active thread”:

- When `activeThreadId` is `t-a` and PTY output is on `t-b`, after idle → attention + chirp (unchanged intent).
- When `activeThreadId` is `t-a` and user was “viewing” something else is **not** what we test anymore for chirp suppression; add an explicit case: **`activeThreadId === t-b`** while `visibleSessionId` (if still passed) could still be `t-a` — expect **no** chirp and no idle attention after idle (proves fix for shell-tab vs thread focus).

- [ ] **Step 3: Replace watcher test**

Change “clears idle attention when visible session becomes that thread” to watch **`activeThreadId`**: set attention on `t-b`, then set `activeThreadId` to `t-b`, expect flag cleared.

- [ ] **Step 4: Run tests (expect failures)**

Run from repo root:

```bash
pnpm --filter workbench exec vitest run src/composables/__tests__/useThreadPtyRunStatus.test.ts
```

Expected: FAIL (missing `activeThreadId`, wrong idle timing, or `markUserInput` not exported).

---

### Task 2: Failing test — user input suppression

**Files:**
- Modify: `apps/desktop/src/composables/__tests__/useThreadPtyRunStatus.test.ts`

- [ ] **Step 1: Add suppression test**

After mounting harness with two threads, call `markUserInput("t-b")` (or whatever the API name is), then within the same tick or immediately fire `ptyHandler!("t-b", "echoed\n")`, advance timers by `1000`, assert **no** idle attention and **no** chirp. Add a control: same chunk **without** `markUserInput` → attention after idle.

- [ ] **Step 2: Run test**

```bash
pnpm --filter workbench exec vitest run src/composables/__tests__/useThreadPtyRunStatus.test.ts
```

Expected: FAIL until composable implements suppression.

---

### Task 3: Implement `useThreadPtyRunStatus`

**Files:**
- Modify: `apps/desktop/src/composables/useThreadPtyRunStatus.ts`

- [ ] **Step 1: Constants and options**

- Set `IDLE_MS` to `1000`.
- Add `activeThreadId: Ref<string | null>` to `UseThreadPtyRunStatusOpts`.
- Remove `visibleSessionId` from the type and JSDoc (recommended in spec); delete all uses.

- [ ] **Step 2: `scheduleIdle`**

Replace `inFocus` with `opts.activeThreadId.value === threadId`.

- [ ] **Step 3: Watcher**

Watch `opts.activeThreadId`; on non-null `id`, `clearIdleAttention(id)` (no `__` prefix check if thread ids never use that pattern; thread UUIDs are fine).

- [ ] **Step 4: `markUserInput` + `applyChunk` guard**

- `const lastUserInputMs = new Map<string, number>()`.
- `function markUserInput(sessionId: string): void { lastUserInputMs.set(sessionId, Date.now()); }`
- At start of `applyChunk`, after resolving `threadId` is already the parameter:  `if (Date.now() - (lastUserInputMs.get(threadId) ?? 0) < 300) return;`

- [ ] **Step 5: Return value**

Return `markUserInput` from the composable; update the function’s exported return type.

- [ ] **Step 6: Run unit tests**

```bash
pnpm --filter workbench exec vitest run src/composables/__tests__/useThreadPtyRunStatus.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/composables/useThreadPtyRunStatus.ts apps/desktop/src/composables/__tests__/useThreadPtyRunStatus.test.ts
git commit -m "fix(desktop): thread PTY idle attention uses activeThreadId and input suppression"
```

---

### Task 4: `TerminalPane` emit

**Files:**
- Modify: `apps/desktop/src/components/TerminalPane.vue`

- [ ] **Step 1: Declare emit**

Add to `defineEmits`:

```ts
(e: "user-typed", sessionId: string): void;
```

- [ ] **Step 2: Fire on user stdin**

Inside `terminal.onData`, after resolving `sid`, before or after `api.ptyWrite(sid, data)`:

```ts
emit("user-typed", sid);
```

Do **not** emit for programmatic writes (`pendingAgentBootstrap` `ptyWrite`) or buffer replay (`terminal.write` from `onPtyData`). Optionally emit for file-drop `ptyWrite` if you treat drops as user input (recommended: emit there too so pasted paths do not spuriously extend “running”).

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS (WorkspaceLayout not wired yet may not fail typecheck; Vue templates are lenient until Task 5).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/TerminalPane.vue
git commit -m "feat(desktop): emit user-typed from TerminalPane for PTY echo suppression"
```

---

### Task 5: `WorkspaceLayout` wiring

**Files:**
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`

- [ ] **Step 1: Composable call**

Destructure `markUserInput: markPtyUserInput` from `useThreadPtyRunStatus`.

Pass:

```ts
activeThreadId: computed(() => workspace.activeThreadId),
```

Remove `visibleSessionId` if Task 3 removed it from opts.

- [ ] **Step 2: Template**

On every `TerminalPane` (agent ref block and shell slot loop), add:

```vue
@user-typed="markPtyUserInput"
```

If the handler receives the session id as first argument, use `@user-typed="markPtyUserInput"` (Vue passes payload automatically).

- [ ] **Step 3: Verify**

```bash
pnpm typecheck
pnpm --filter workbench test
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/layouts/WorkspaceLayout.vue
git commit -m "fix(desktop): wire activeThreadId and user-typed into PTY run status"
```

---

### Task 6: Manual smoke check (optional but recommended)

- [ ] Two threads; run agent in background thread; switch to shell tab in lower panel but keep other thread selected in sidebar — when background thread goes idle, **should not** chirp if spec’s “active thread” matches selection (verify `activeThreadId` in UI matches expectation).
- [ ] Type in agent terminal; confirm echo does not alone keep thread “running” forever or trigger false idle chirps.

---

## Plan review

After the plan is finalized, use @superpowers/requesting-code-review or the plan-document reviewer workflow from @superpowers/writing-plans: dispatch a reviewer with paths to this plan and the spec, address feedback, and repeat until approved.

---

## Execution handoff

**Plan saved to** `docs/superpowers/plans/2026-04-11-thread-activity-notification.md`.

**Execution options:**

1. **Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks (@superpowers/subagent-driven-development).
2. **Inline execution** — Same session, checkpoints (@superpowers/executing-plans).

**Which approach?**

Before claiming done, run @superpowers/verification-before-completion: `pnpm typecheck` and `pnpm --filter workbench test` with evidence.
