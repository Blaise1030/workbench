# Terminal Session Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist provider resume metadata per thread so the app can relaunch Claude, Codex, Agent, and Gemini sessions after restart and derive the thread title once from the first prompt.

**Architecture:** Add a durable `thread_sessions` persistence layer in Electron, route thread terminal launches through a new wrapper/session manager abstraction, and push session metadata into renderer state over dedicated IPC. Keep PTYs ephemeral and resume model conversations by relaunching wrappers with saved provider-native resume IDs.

**Tech Stack:** Electron, Vue 3, Pinia, better-sqlite3, node-pty, Vitest, TypeScript

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/desktop/src/shared/domain.ts` | Add `ThreadSession` types shared across main/renderer |
| `apps/desktop/src/shared/ipc.ts` | Add thread-session IPC channels and payload types |
| `apps/desktop/electron/storage/schema.sql` | Persist `thread_sessions` table and index |
| `apps/desktop/electron/storage/store.ts` | Migrate schema and add CRUD helpers for thread sessions |
| `apps/desktop/electron/storage/__tests__/store.test.ts` | Verify migration and persistence behavior |
| `apps/desktop/electron/services/workspaceService.ts` | Keep title derivation policy and one-time rename rules centralized |
| `apps/desktop/electron/services/__tests__/workspaceService.test.ts` | Guard title derivation and rename-once behavior |
| `apps/desktop/electron/sessionResume/types.ts` | Normalized wrapper event and adapter contracts |
| `apps/desktop/electron/sessionResume/providerAdapters.ts` | Provider-specific fresh/resume commands and resume-ID parsers |
| `apps/desktop/electron/sessionResume/wrapperProtocol.ts` | NDJSON event parsing/serialization helpers |
| `apps/desktop/electron/sessionResume/sessionManager.ts` | Launch wrappers, persist metadata, emit UI updates |
| `apps/desktop/electron/sessionResume/__tests__/providerAdapters.test.ts` | Unit-test provider command builders and resume-ID extraction |
| `apps/desktop/electron/sessionResume/__tests__/sessionManager.test.ts` | Verify wrapper event handling, persistence updates, resume fallback |
| `apps/desktop/electron/services/ptyService.ts` | Delegate thread-bound launches to the session manager while preserving shell PTYs |
| `apps/desktop/electron/mainApp.ts` | Register new IPC and broadcast `terminal:threadSessionDidChange` events |
| `apps/desktop/electron/preload.ts` | Expose new session APIs to renderer |
| `apps/desktop/src/stores/workspaceStore.ts` | Hydrate and update thread session metadata in renderer state |
| `apps/desktop/src/components/ThreadSidebar.vue` | Render resumable / resume-failed state next to threads |
| `apps/desktop/src/components/TerminalPane.vue` | Use the new launch API for thread PTYs and preserve shell-tab behavior |
| `apps/desktop/src/layouts/WorkspaceLayout.vue` | Subscribe to session changes and trigger default resume-on-open |
| `apps/desktop/src/components/__tests__/ThreadSidebar.test.ts` | Cover resumable / failed badges and actions |
| `apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts` | Cover launch/resume flow from renderer |
| `apps/desktop/scripts/session-resume/instrument-claude.js` | Claude wrapper entrypoint |
| `apps/desktop/scripts/session-resume/instrument-codex.js` | Codex wrapper entrypoint |
| `apps/desktop/scripts/session-resume/instrument-agent.js` | Agent wrapper entrypoint |
| `apps/desktop/scripts/session-resume/instrument-gemini.js` | Gemini wrapper entrypoint |

---

### Task 1: Persist Durable Thread Session Records

**Files:**
- Modify: `apps/desktop/src/shared/domain.ts`
- Modify: `apps/desktop/electron/storage/schema.sql`
- Modify: `apps/desktop/electron/storage/store.ts`
- Test: `apps/desktop/electron/storage/__tests__/store.test.ts`

- [ ] **Step 1: Write failing store tests for `thread_sessions` migration and CRUD**

```ts
it("creates thread_sessions during migration", () => {
  const store = createStore();
  store.migrate(schemaSql);
  expect(tableExists(store, "thread_sessions")).toBe(true);
});

it("persists and reloads a thread session record", () => {
  store.upsertThreadSession({
    threadId: "thread-1",
    provider: "claude",
    resumeId: "claude-session-123",
    initialPrompt: "Fix the flaky sidebar test",
    titleCapturedAt: "2026-04-07T10:00:05.000Z",
    launchMode: "fresh",
    status: "resumable",
    lastActivityAt: "2026-04-07T10:01:00.000Z",
    metadataJson: "{\"source\":\"wrapper\"}",
    createdAt: "2026-04-07T10:00:00.000Z",
    updatedAt: "2026-04-07T10:01:00.000Z"
  });

  expect(store.getThreadSession("thread-1")?.resumeId).toBe("claude-session-123");
});
```

- [ ] **Step 2: Run the storage tests to verify they fail**

Run: `pnpm --filter workbench test -- electron/storage/__tests__/store.test.ts`
Expected: FAIL with missing `thread_sessions` table or undefined `upsertThreadSession`

- [ ] **Step 3: Add shared types and storage helpers**

```ts
// apps/desktop/src/shared/domain.ts
export type ThreadSessionStatus = "idle" | "active" | "resumable" | "resumeFailed";

export interface ThreadSession {
  threadId: string;
  provider: ThreadAgent;
  resumeId: string | null;
  initialPrompt: string | null;
  titleCapturedAt: string | null;
  launchMode: "fresh" | "resume";
  status: ThreadSessionStatus;
  lastActivityAt: string;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Note: `provider` should stay aligned with the owning thread's `agent` value. If a later wrapper needs to launch a different underlying CLI binary (for example, a `cursor` thread kind invoking `agent --resume`), that translation belongs in the provider-adapter layer, not in the persisted session type.

```sql
CREATE TABLE IF NOT EXISTS thread_sessions (
  thread_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  resume_id TEXT,
  initial_prompt TEXT,
  title_captured_at TEXT,
  launch_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(thread_id) REFERENCES threads(id)
);
CREATE INDEX IF NOT EXISTS idx_thread_sessions_status ON thread_sessions(status);
```

- [ ] **Step 4: Implement store CRUD and snapshot hydration**

```ts
upsertThreadSession(session: ThreadSession): void { /* INSERT ... ON CONFLICT(thread_id) DO UPDATE ... */ }
getThreadSession(threadId: string): ThreadSession | null { /* SELECT ... WHERE thread_id = ? */ }
listThreadSessions(): ThreadSession[] { /* SELECT ... ORDER BY updated_at DESC */ }
```

- [ ] **Step 5: Re-run the storage tests**

Run: `pnpm --filter workbench test -- electron/storage/__tests__/store.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the persistence slice**

```bash
git add apps/desktop/src/shared/domain.ts apps/desktop/electron/storage/schema.sql apps/desktop/electron/storage/store.ts apps/desktop/electron/storage/__tests__/store.test.ts
git commit -m "feat: persist thread session metadata"
```

---

### Task 2: Formalize One-Time Title Capture Policy

**Files:**
- Modify: `apps/desktop/electron/services/workspaceService.ts`
- Test: `apps/desktop/electron/services/__tests__/workspaceService.test.ts`

- [ ] **Step 1: Extend failing workspace-service tests to require one-time prompt capture metadata**

```ts
it("renames once from the first captured prompt", () => {
  const didRename = service.captureInitialPrompt("thread-1", "Refactor sidebar drag ordering");
  expect(didRename.renamed).toBe(true);
  expect(store.getThread("thread-1")?.title).toBe("Refactor sidebar drag ordering");
});

it("does not rename after titleCapturedAt is set", () => {
  service.captureInitialPrompt("thread-1", "First prompt");
  const second = service.captureInitialPrompt("thread-1", "Second prompt");
  expect(second.renamed).toBe(false);
});
```

- [ ] **Step 2: Run the workspace-service tests to verify they fail**

Run: `pnpm --filter workbench test -- apps/desktop/electron/services/__tests__/workspaceService.test.ts`
Expected: FAIL with missing `captureInitialPrompt` result shape

- [ ] **Step 3: Replace the ad-hoc prompt rename hook with a session-aware method**

```ts
captureInitialPrompt(threadId: string, input: string): { renamed: boolean; initialPrompt: string | null } {
  const initialPrompt = deriveThreadTitleFromPrompt(input);
  if (!initialPrompt) return { renamed: false, initialPrompt: null };
  const session = this.store.getThreadSession(threadId);
  if (session?.titleCapturedAt) return { renamed: false, initialPrompt: session.initialPrompt ?? initialPrompt };
  // rename only if still default-generated title
}
```

Legacy note: if a thread already has a non-default title and no session row yet, do not backfill or invent `initialPrompt`; preserve the existing title and leave first-prompt provenance unset.

- [ ] **Step 4: Keep truncation behavior explicit and unchanged**

```ts
const MAX_DERIVED_TITLE_LENGTH = 68;
// Preserve raw first prompt, collapse whitespace, truncate once, never summarize.
```

- [ ] **Step 5: Re-run the workspace-service tests**

Run: `pnpm --filter workbench test -- apps/desktop/electron/services/__tests__/workspaceService.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the title-policy slice**

```bash
git add apps/desktop/electron/services/workspaceService.ts apps/desktop/electron/services/__tests__/workspaceService.test.ts
git commit -m "feat: capture first prompt for thread titles"
```

---

### Task 3: Build the Wrapper Session Manager and Provider Adapters

**Files:**
- Create: `apps/desktop/electron/sessionResume/types.ts`
- Create: `apps/desktop/electron/sessionResume/providerAdapters.ts`
- Create: `apps/desktop/electron/sessionResume/wrapperProtocol.ts`
- Create: `apps/desktop/electron/sessionResume/sessionManager.ts`
- Create: `apps/desktop/electron/sessionResume/__tests__/providerAdapters.test.ts`
- Create: `apps/desktop/electron/sessionResume/__tests__/sessionManager.test.ts`
- Create: `apps/desktop/scripts/session-resume/instrument-claude.js`
- Create: `apps/desktop/scripts/session-resume/instrument-codex.js`
- Create: `apps/desktop/scripts/session-resume/instrument-agent.js`
- Create: `apps/desktop/scripts/session-resume/instrument-gemini.js`

- [ ] **Step 1: Write failing adapter tests for fresh/resume commands and resume-ID extraction**

```ts
it("builds claude resume command", () => {
  expect(adapters.claude.resumeCommand("/repo", "sess-1")).toEqual({
    file: "node",
    args: [expect.stringContaining("instrument-claude.js"), "--cwd", "/repo", "--resume", "sess-1"]
  });
});

it("extracts codex resume ids from stdout", () => {
  expect(adapters.codex.detectResumeId("Session ID: codex_abc123")).toBe("codex_abc123");
});
```

- [ ] **Step 2: Write failing session-manager tests for wrapper events**

```ts
it("persists resume ids from wrapper events", async () => {
  await manager.handleEvent({
    type: "session.resume_id_discovered",
    threadId: "thread-1",
    provider: "claude",
    resumeId: "claude-session-123",
    occurredAt: "2026-04-07T10:00:00.000Z"
  });

  expect(store.getThreadSession("thread-1")?.resumeId).toBe("claude-session-123");
});
```

- [ ] **Step 3: Run the new session-resume tests to verify they fail**

Run: `pnpm --filter workbench test -- apps/desktop/electron/sessionResume/__tests__/providerAdapters.test.ts apps/desktop/electron/sessionResume/__tests__/sessionManager.test.ts`
Expected: FAIL with missing modules

- [ ] **Step 4: Implement the normalized session contracts**

```ts
export interface SessionEventBase {
  threadId: string;
  provider: ThreadAgent;
  occurredAt: string;
}

export type SessionEvent =
  | ({ type: "session.started"; launchMode: "fresh" | "resume" } & SessionEventBase)
  | ({ type: "session.initial_prompt_captured"; initialPrompt: string } & SessionEventBase)
  | ({ type: "session.resume_id_discovered"; resumeId: string } & SessionEventBase)
  | ({ type: "session.resume_failed"; message: string } & SessionEventBase)
  | ({ type: "session.exited"; exitCode: number | null } & SessionEventBase);
```

- [ ] **Step 5: Implement provider adapters and thin wrapper scripts**

```ts
export const providerAdapters = {
  claude: {
    freshCommand: (cwd) => ({ file: "node", args: [wrapperPath("instrument-claude.js"), "--cwd", cwd] }),
    resumeCommand: (cwd, resumeId) => ({ file: "node", args: [wrapperPath("instrument-claude.js"), "--cwd", cwd, "--resume", resumeId] }),
    detectResumeId: (chunk) => matchFirst(chunk, [/Session ID:\s*([^\s]+)/i, /--resume\s+([^\s]+)/i])
  },
  // codex / agent / gemini follow same contract
} satisfies Record<ThreadAgent, ResumeCaptureAdapter>;
```

- [ ] **Step 6: Implement `SessionManager` persistence and broadcast hooks**

```ts
async launchThreadSession(input: { threadId: string; provider: ThreadAgent; cwd: string; forceFresh?: boolean }) {
  const saved = this.store.getThreadSession(input.threadId);
  const resumed = Boolean(saved?.resumeId && !input.forceFresh);
  const command = resumed
    ? this.adapters[input.provider].resumeCommand(input.cwd, saved!.resumeId!)
    : this.adapters[input.provider].freshCommand(input.cwd);
  // spawn wrapper, persist started state, wire event parser, broadcast updates
}
```

- [ ] **Step 7: Re-run the session-resume tests**

Run: `pnpm --filter workbench test -- apps/desktop/electron/sessionResume/__tests__/providerAdapters.test.ts apps/desktop/electron/sessionResume/__tests__/sessionManager.test.ts`
Expected: PASS

- [ ] **Step 8: Commit the wrapper/session-manager slice**

```bash
git add apps/desktop/electron/sessionResume apps/desktop/scripts/session-resume
git commit -m "feat: add provider session resume manager"
```

---

### Task 4: Integrate Session Manager With PTY and Main-Process IPC

**Files:**
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `apps/desktop/electron/preload.ts`
- Modify: `apps/desktop/electron/services/ptyService.ts`
- Modify: `apps/desktop/electron/mainApp.ts`
- Test: `apps/desktop/electron/sessionResume/__tests__/sessionManager.test.ts`

- [ ] **Step 1: Write failing tests for the new IPC entry points**

```ts
it("launches a thread session in resume mode when resumeId exists", async () => {
  store.upsertThreadSession({ threadId: "thread-1", provider: "claude", resumeId: "sess-1", /* ... */ });
  const result = await sessionManager.launchThreadSession({ threadId: "thread-1", provider: "claude", cwd: "/repo" });
  expect(result.resumed).toBe(true);
});
```

- [ ] **Step 2: Run the relevant tests to verify they fail**

Run: `pnpm --filter workbench test -- apps/desktop/electron/sessionResume/__tests__/sessionManager.test.ts`
Expected: FAIL with missing `launchThreadSession` wiring or IPC payload mismatch

- [ ] **Step 3: Add IPC contracts**

```ts
export const IPC_CHANNELS = {
  // ...
  terminalGetThreadSession: "terminal:getThreadSession",
  terminalLaunchThreadSession: "terminal:launchThreadSession",
  terminalThreadSessionDidChange: "terminal:threadSessionDidChange"
} as const;
```

```ts
export interface LaunchThreadSessionInput {
  threadId: string;
  provider: ThreadAgent;
  cwd: string;
  forceFresh?: boolean;
}
```

- [ ] **Step 4: Expose preload APIs and keep shell PTYs untouched**

```ts
getThreadSession: (threadId: string) => ipcRenderer.invoke(IPC_CHANNELS.terminalGetThreadSession, { threadId }),
launchThreadSession: (payload: LaunchThreadSessionInput) => ipcRenderer.invoke(IPC_CHANNELS.terminalLaunchThreadSession, payload),
onThreadSessionDidChange: (callback) => { /* subscribe / unsubscribe */ }
```

- [ ] **Step 5: Delegate thread-bound PTYs to the session manager**

```ts
// ptyService.ts
getOrCreate(sessionId, cwd, worktreeId, options?: { provider?: ThreadAgent; threadId?: string }) {
  if (options?.threadId && options.provider) {
    return this.sessionManager.attachThreadPty({ sessionId, threadId: options.threadId, provider: options.provider, cwd, worktreeId });
  }
  return this.getOrCreateShellPty(sessionId, cwd, worktreeId);
}
```

- [ ] **Step 6: Broadcast `terminal:threadSessionDidChange` from `mainApp.ts`**

```ts
sessionManager.setBroadcastListener((session) => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.terminalThreadSessionDidChange, session);
  }
});
```

- [ ] **Step 7: Re-run the IPC/session tests**

Run: `pnpm --filter workbench test -- apps/desktop/electron/sessionResume/__tests__/sessionManager.test.ts`
Expected: PASS

- [ ] **Step 8: Commit the IPC integration slice**

```bash
git add apps/desktop/src/shared/ipc.ts apps/desktop/electron/preload.ts apps/desktop/electron/services/ptyService.ts apps/desktop/electron/mainApp.ts apps/desktop/electron/sessionResume/__tests__/sessionManager.test.ts
git commit -m "feat: wire terminal session resume ipc"
```

---

### Task 5: Hydrate Renderer Session State and Resume-on-Open Behavior

**Files:**
- Modify: `apps/desktop/src/stores/workspaceStore.ts`
- Modify: `apps/desktop/src/components/TerminalPane.vue`
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`
- Test: `apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`

- [ ] **Step 1: Write failing renderer tests for resume-on-open**

```ts
it("launches the active thread via launchThreadSession", async () => {
  workspaceApi.getThreadSession.mockResolvedValue({ threadId: "thread-1", provider: "claude", resumeId: "sess-1", status: "resumable" });
  render(WorkspaceLayout);
  await selectThread("thread-1");
  expect(workspaceApi.launchThreadSession).toHaveBeenCalledWith({
    threadId: "thread-1",
    provider: "claude",
    cwd: "/repo",
    forceFresh: false
  });
});
```

- [ ] **Step 2: Run the layout tests to verify they fail**

Run: `pnpm --filter workbench test -- apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`
Expected: FAIL with missing `launchThreadSession` mocks or renderer state

- [ ] **Step 3: Extend workspace store with thread-session metadata**

```ts
state: () => ({
  // existing fields...
  threadSessions: {} as Record<string, ThreadSession>
}),
actions: {
  hydrateThreadSessions(sessions: ThreadSession[]) {
    this.threadSessions = Object.fromEntries(sessions.map((s) => [s.threadId, s]));
  },
  upsertThreadSession(session: ThreadSession) {
    this.threadSessions = { ...this.threadSessions, [session.threadId]: session };
  }
}
```

- [ ] **Step 4: Update `TerminalPane.vue` to launch thread sessions through the new API**

```ts
if (props.ptyKind === "agent" && props.threadId) {
  await api.launchThreadSession({ threadId: props.threadId, provider: props.threadAgent, cwd: props.cwd, forceFresh: false });
}
const { buffer } = await api.ptyCreate(sessionId, props.cwd, props.worktreeId);
```

- [ ] **Step 5: Subscribe to `onThreadSessionDidChange` in `WorkspaceLayout.vue`**

```ts
disposeThreadSessionChanged = api.onThreadSessionDidChange((session) => {
  workspace.upsertThreadSession(session);
});
```

- [ ] **Step 6: Re-run the layout tests**

Run: `pnpm --filter workbench test -- apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the renderer-state slice**

```bash
git add apps/desktop/src/stores/workspaceStore.ts apps/desktop/src/components/TerminalPane.vue apps/desktop/src/layouts/WorkspaceLayout.vue apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts
git commit -m "feat: resume thread sessions in renderer"
```

---

### Task 6: Add Thread Session Status UI

**Files:**
- Modify: `apps/desktop/src/components/ThreadSidebar.vue`
- Test: `apps/desktop/src/components/__tests__/ThreadSidebar.test.ts`

- [ ] **Step 1: Write failing sidebar tests for resumable and failed session states**

```ts
it("shows a resumable badge for threads with saved resume ids", () => {
  renderSidebar({
    threadSessions: {
      "thread-1": { threadId: "thread-1", provider: "claude", resumeId: "sess-1", status: "resumable", /* ... */ }
    }
  });
  expect(screen.getByText("Resumable")).toBeInTheDocument();
});

it("shows retry/start fresh actions when resume failed", () => {
  renderSidebar({
    threadSessions: {
      "thread-1": { threadId: "thread-1", provider: "claude", resumeId: "sess-1", status: "resumeFailed", /* ... */ }
    }
  });
  expect(screen.getByRole("button", { name: /retry resume/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the sidebar tests to verify they fail**

Run: `pnpm --filter workbench test -- apps/desktop/src/components/__tests__/ThreadSidebar.test.ts`
Expected: FAIL with missing thread-session props and status UI

- [ ] **Step 3: Add session props and small status affordances**

```ts
defineProps<{
  // ...
  threadSessions?: Record<string, ThreadSession>;
}>();
```

```vue
<span v-if="session?.status === 'resumable'" class="session-pill">Resumable</span>
<span v-else-if="session?.status === 'resumeFailed'" class="session-pill session-pill--warning">Resume failed</span>
```

- [ ] **Step 4: Bubble retry/start-fresh actions to the layout**

```ts
const emit = defineEmits<{
  retryResume: [threadId: string];
  startFresh: [threadId: string];
}>();
```

- [ ] **Step 5: Re-run the sidebar tests**

Run: `pnpm --filter workbench test -- apps/desktop/src/components/__tests__/ThreadSidebar.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the UI slice**

```bash
git add apps/desktop/src/components/ThreadSidebar.vue apps/desktop/src/components/__tests__/ThreadSidebar.test.ts
git commit -m "feat: show thread session resume state"
```

---

### Task 7: End-to-End Verification and Cleanup

**Files:**
- Modify: `docs/superpowers/specs/2026-04-07-terminal-session-resume-design.md` (only if implementation diverges materially)
- Modify: `docs/superpowers/plans/2026-04-07-terminal-session-resume.md` (check off completed steps during execution)

- [ ] **Step 1: Run targeted Electron, renderer, and storage tests together**

Run: `pnpm --filter workbench test -- apps/desktop/electron/storage/__tests__/store.test.ts apps/desktop/electron/services/__tests__/workspaceService.test.ts apps/desktop/electron/sessionResume/__tests__/providerAdapters.test.ts apps/desktop/electron/sessionResume/__tests__/sessionManager.test.ts apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts apps/desktop/src/components/__tests__/ThreadSidebar.test.ts`
Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter workbench typecheck`
Expected: PASS

- [ ] **Step 3: Run full desktop test suite**

Run: `pnpm --filter workbench test`
Expected: PASS

- [ ] **Step 4: Manual smoke test in Electron dev mode**

Run: `pnpm --filter workbench dev:electron`
Expected:
- create a fresh Claude/Codex/Gemini/Agent thread
- first prompt renames the thread once
- quit and relaunch app
- selecting the thread relaunches in resume mode
- forcing resume failure surfaces retry/start-fresh actions without deleting metadata

- [ ] **Step 5: Commit final verification or follow-up doc tweaks**

```bash
git add docs/superpowers/specs/2026-04-07-terminal-session-resume-design.md docs/superpowers/plans/2026-04-07-terminal-session-resume.md
git commit -m "chore: finalize terminal session resume rollout"
```
