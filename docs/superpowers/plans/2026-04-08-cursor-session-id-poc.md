# Cursor Session ID Detection PoC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect a Cursor session/chat identifier from PTY output, persist it to `thread_sessions.resumeId`, and show a toast in the renderer.

**Architecture:** Add a `resumeIdCapture` parser and `CursorCliAdapter` in the electron adapters layer. Hook a raw-data listener into `PtyService` so `mainApp` can scan Cursor thread output for session IDs. On first detection per thread, call a new `workspaceService.captureResumeId` method, emit a dedicated IPC event, and display a toast in `WorkspaceLayout`.

**Tech Stack:** TypeScript, Electron, node-pty, Vitest, Vue 3 + Pinia

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `electron/adapters/resumeIdCapture.ts` | ANSI-stripping parser; `extractResumeIdFromStdout` |
| Create | `electron/adapters/cursorCliAdapter.ts` | `CursorCliAdapter` class; wraps the parser |
| Create | `electron/adapters/__tests__/cursorAdapter.test.ts` | Unit tests for parser + adapter |
| Modify | `src/shared/ipc.ts` | Add `cursorSessionIdDetected` channel |
| Modify | `electron/services/ptyService.ts` | Add `setRawDataListener` hook |
| Modify | `electron/services/workspaceService.ts` | Add `captureResumeId(threadId, resumeId): boolean` |
| Modify | `electron/services/__tests__/workspaceService.test.ts` | Tests for `captureResumeId` |
| Modify | `electron/mainApp.ts` | Wire detection → persist → emit IPC event |
| Modify | `electron/preload.ts` | Expose `onCursorSessionDetected` to renderer |
| Modify | `src/env.d.ts` | Add `onCursorSessionDetected` to `WorkspaceApi` interface |
| Modify | `src/layouts/WorkspaceLayout.vue` | Subscribe to event and show toast |
| Modify | `src/layouts/__tests__/WorkspaceLayout.test.ts` | Test toast appears on cursor session event |

---

## Task 1: Create the resume-ID parser

**Files:**
- Create: `electron/adapters/resumeIdCapture.ts`

- [ ] **Step 1: Write the failing test**

Create `electron/adapters/__tests__/cursorAdapter.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { extractResumeIdFromStdout } from "../resumeIdCapture";

describe("extractResumeIdFromStdout", () => {
  it("extracts session_id from JSON fragment", () => {
    expect(extractResumeIdFromStdout('"session_id":"abc-def-12345678"')).toBe("abc-def-12345678");
  });

  it("extracts chat_id label", () => {
    expect(extractResumeIdFromStdout("chat_id: chatABC123")).toBe("chatABC123");
  });

  it("extracts a bare UUID", () => {
    expect(extractResumeIdFromStdout("Connected. Session 550e8400-e29b-41d4-a716-446655440000 ready.")).toBe(
      "550e8400-e29b-41d4-a716-446655440000"
    );
  });

  it("strips ANSI escape sequences before matching", () => {
    expect(extractResumeIdFromStdout("\x1b[32msession_id: abcdef99\x1b[0m")).toBe("abcdef99");
  });

  it("returns null for unrelated output", () => {
    expect(extractResumeIdFromStdout("Welcome to Cursor. Type your query.")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/desktop && npx vitest run electron/adapters/__tests__/cursorAdapter.test.ts
```

Expected: FAIL — `Cannot find module '../resumeIdCapture'`

- [ ] **Step 3: Create `electron/adapters/resumeIdCapture.ts`**

```typescript
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const JSON_SESSION_ID_RE = /"session_id"\s*:\s*"([^"]+)"/;
const LABEL_PATTERNS = [
  /session[_\s-]?id[:\s=]+([^\s"'`[\]{}|,]+)/i,
  /\bsession\s*:\s*([a-zA-Z0-9_-]{6,})/i,
  /chat[_\s-]?id[:\s=]+([^\s"'`[\]{}|,]+)/i,
  /conversation[_\s-]?id[:\s=]+([^\s"'`[\]{}|,]+)/i,
  /resum(?:e|ing)(?:\s+session)?[:\s]+([a-zA-Z0-9_-]{8,})/i,
];

/**
 * Extract a resumable session ID from a PTY output chunk.
 * Strips ANSI escape sequences before matching.
 * Returns the first plausible ID found, or null.
 */
export function extractResumeIdFromStdout(chunk: string): string | null {
  const trimmed = chunk.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");

  const jsonMatch = JSON_SESSION_ID_RE.exec(trimmed);
  if (jsonMatch?.[1]) {
    const v = jsonMatch[1].trim();
    if (v.length >= 8) return v;
  }

  for (const re of LABEL_PATTERNS) {
    const m = re.exec(trimmed);
    if (m?.[1]) {
      const v = m[1].trim();
      if (v.length >= 6) return v;
    }
  }

  const uuidMatch = UUID_RE.exec(trimmed);
  if (uuidMatch?.[0]) return uuidMatch[0];

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/desktop && npx vitest run electron/adapters/__tests__/cursorAdapter.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/adapters/resumeIdCapture.ts apps/desktop/electron/adapters/__tests__/cursorAdapter.test.ts
git commit -m "feat: add cursor resume-ID parser"
```

---

## Task 2: Create the CursorCliAdapter

**Files:**
- Create: `electron/adapters/cursorCliAdapter.ts`
- Modify: `electron/adapters/__tests__/cursorAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `electron/adapters/__tests__/cursorAdapter.test.ts`:

```typescript
import { CursorCliAdapter } from "../cursorCliAdapter";

describe("CursorCliAdapter", () => {
  it("detects resume ID from output", () => {
    const adapter = new CursorCliAdapter();
    expect(adapter.detectResumeId("session_id: resumable-session-99")).toBe("resumable-session-99");
  });

  it("returns null for non-session output", () => {
    const adapter = new CursorCliAdapter();
    expect(adapter.detectResumeId("Running test suite...")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/desktop && npx vitest run electron/adapters/__tests__/cursorAdapter.test.ts
```

Expected: FAIL — `Cannot find module '../cursorCliAdapter'`

- [ ] **Step 3: Create `electron/adapters/cursorCliAdapter.ts`**

```typescript
import { extractResumeIdFromStdout } from "./resumeIdCapture.js";

export class CursorCliAdapter {
  readonly provider = "cursor" as const;

  detectResumeId(chunk: string): string | null {
    return extractResumeIdFromStdout(chunk);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/desktop && npx vitest run electron/adapters/__tests__/cursorAdapter.test.ts
```

Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/adapters/cursorCliAdapter.ts apps/desktop/electron/adapters/__tests__/cursorAdapter.test.ts
git commit -m "feat: add CursorCliAdapter with detectResumeId"
```

---

## Task 3: Add IPC channel for cursor session detection

**Files:**
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Read the file**

```
Read apps/desktop/src/shared/ipc.ts
```

- [ ] **Step 2: Add the channel**

In `IPC_CHANNELS`, after `uiOpenWorkspaceSettings`, add:

```typescript
cursorSessionIdDetected: "cursor:sessionIdDetected",
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/shared/ipc.ts
git commit -m "feat: add cursorSessionIdDetected IPC channel"
```

---

## Task 4: Add raw-data listener hook to PtyService

**Files:**
- Modify: `electron/services/ptyService.ts`

- [ ] **Step 1: Read the file**

```
Read apps/desktop/electron/services/ptyService.ts
```

- [ ] **Step 2: Add the listener field and setter**

After the existing `private submittedInputListener` field, add:

```typescript
private rawDataListener: ((sessionId: string, data: string) => void) | null = null;

setRawDataListener(listener: ((sessionId: string, data: string) => void) | null): void {
  this.rawDataListener = listener;
}
```

- [ ] **Step 3: Call the listener in onData**

Inside the `instance.onData((data) => { ... })` callback, after updating `session.buffer` and before `win.webContents.send(...)`, add:

```typescript
this.rawDataListener?.(sessionId, data);
```

The full `onData` block becomes:

```typescript
instance.onData((data) => {
  session.buffer += data;
  if (Buffer.byteLength(session.buffer, "utf8") > MAX_BUFFER_BYTES) {
    session.buffer = session.buffer.slice(-MAX_BUFFER_BYTES);
  }
  this.rawDataListener?.(sessionId, data);
  const payload = { sessionId, data };
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.terminalPtyData, payload);
  }
});
```

- [ ] **Step 4: Run existing tests to confirm no regressions**

```bash
cd apps/desktop && npx vitest run electron/
```

Expected: all existing electron tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/services/ptyService.ts
git commit -m "feat: add setRawDataListener hook to PtyService"
```

---

## Task 5: Add captureResumeId to WorkspaceService

**Files:**
- Modify: `electron/services/workspaceService.ts`
- Modify: `electron/services/__tests__/workspaceService.test.ts`

- [ ] **Step 1: Write the failing test**

Read `electron/services/__tests__/workspaceService.test.ts` first, then append a new describe block:

```typescript
describe("captureResumeId", () => {
  it("persists resumeId and returns true on first call", () => {
    const { service, store } = buildWorkspace();
    const project = service.addProject("P", "/repo");
    service.addWorktree(project.id, "main", "/repo", true);
    const thread = service.createThread({
      projectId: project.id,
      worktreeId: store.listWorktrees()[0]!.id,
      title: "Cursor Agent",
      agent: "cursor",
    });

    const captured = service.captureResumeId(thread.id, "session-abc-123");
    expect(captured).toBe(true);

    const session = store.getThreadSession(thread.id);
    expect(session?.resumeId).toBe("session-abc-123");
    expect(session?.status).toBe("resumable");
    expect(session?.provider).toBe("cursor");
  });

  it("is write-once: second call with different ID returns false and does not overwrite", () => {
    const { service, store } = buildWorkspace();
    const project = service.addProject("P", "/repo");
    service.addWorktree(project.id, "main", "/repo", true);
    const thread = service.createThread({
      projectId: project.id,
      worktreeId: store.listWorktrees()[0]!.id,
      title: "Cursor Agent",
      agent: "cursor",
    });

    service.captureResumeId(thread.id, "session-first");
    const second = service.captureResumeId(thread.id, "session-second");
    expect(second).toBe(false);
    expect(store.getThreadSession(thread.id)?.resumeId).toBe("session-first");
  });

  it("returns false for non-cursor threads", () => {
    const { service, store } = buildWorkspace();
    const project = service.addProject("P", "/repo");
    service.addWorktree(project.id, "main", "/repo", true);
    const thread = service.createThread({
      projectId: project.id,
      worktreeId: store.listWorktrees()[0]!.id,
      title: "Claude Code",
      agent: "claude",
    });

    expect(service.captureResumeId(thread.id, "session-xyz")).toBe(false);
  });
});
```

**Note:** Look at the existing test file to understand how `buildWorkspace()` is defined. If it doesn't exist as a helper, extract one from the existing test setup pattern.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/desktop && npx vitest run electron/services/__tests__/workspaceService.test.ts
```

Expected: FAIL — `service.captureResumeId is not a function`

- [ ] **Step 3: Add captureResumeId to workspaceService.ts**

Read `electron/services/workspaceService.ts`, then add after the `captureInitialPrompt` method:

```typescript
captureResumeId(threadId: string, resumeId: string): boolean {
  const thread = this.store.getThread(threadId);
  if (!thread || thread.agent !== "cursor") return false;

  const existing = this.store.getThreadSession(threadId);
  if (existing?.resumeId) return false;

  const now = new Date().toISOString();
  this.store.upsertThreadSession({
    threadId,
    provider: "cursor",
    resumeId,
    initialPrompt: existing?.initialPrompt ?? null,
    titleCapturedAt: existing?.titleCapturedAt ?? null,
    launchMode: existing?.launchMode ?? "fresh",
    status: "resumable",
    lastActivityAt: now,
    metadataJson: existing?.metadataJson ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/desktop && npx vitest run electron/services/__tests__/workspaceService.test.ts
```

Expected: new tests PASS; no regressions

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/services/workspaceService.ts apps/desktop/electron/services/__tests__/workspaceService.test.ts
git commit -m "feat: add captureResumeId to WorkspaceService"
```

---

## Task 6: Wire cursor session detection in mainApp

**Files:**
- Modify: `electron/mainApp.ts`

- [ ] **Step 1: Read the file**

```
Read apps/desktop/electron/mainApp.ts
```

- [ ] **Step 2: Import CursorCliAdapter**

At the top of the imports, add:

```typescript
import { CursorCliAdapter } from "./adapters/cursorCliAdapter.js";
```

- [ ] **Step 3: Instantiate adapter and set up listener**

After the line `const store = new WorkspaceStore(dataDir);` and `store.migrate(schemaSql);` but before `registerIpc(workspaceService)`, add:

```typescript
const cursorAdapter = new CursorCliAdapter();
const detectedCursorSessions = new Set<string>();

ptyService.setRawDataListener((sessionId, data) => {
  if (detectedCursorSessions.has(sessionId)) return;
  const snapshot = workspaceService.getSnapshot();
  const thread = snapshot.threads.find((t) => t.id === sessionId);
  if (thread?.agent !== "cursor") return;
  const resumeId = cursorAdapter.detectResumeId(data);
  if (!resumeId) return;
  detectedCursorSessions.add(sessionId);
  const captured = workspaceService.captureResumeId(sessionId, resumeId);
  if (captured) {
    emitWorkspaceDidChange();
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS.cursorSessionIdDetected, { threadId: sessionId, resumeId });
    }
  }
});
```

- [ ] **Step 4: Build and check for TypeScript errors**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/mainApp.ts
git commit -m "feat: wire cursor session ID detection in mainApp"
```

---

## Task 7: Expose onCursorSessionDetected in preload

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/env.d.ts`

- [ ] **Step 1: Read both files**

```
Read apps/desktop/electron/preload.ts
Read apps/desktop/src/env.d.ts
```

- [ ] **Step 2: Add the listener to preload.ts**

Inside the `contextBridge.exposeInMainWorld("workspaceApi", { ... })` object, after `onOpenWorkspaceSettings`, add:

```typescript
onCursorSessionDetected: (
  callback: (payload: { threadId: string; resumeId: string }) => void
) => {
  const handler = (
    _event: Electron.IpcRendererEvent,
    payload: { threadId: string; resumeId: string }
  ) => {
    callback(payload);
  };
  ipcRenderer.on(IPC_CHANNELS.cursorSessionIdDetected, handler);
  return () => ipcRenderer.off(IPC_CHANNELS.cursorSessionIdDetected, handler);
},
```

- [ ] **Step 3: Add the type to env.d.ts**

In the `WorkspaceApi` interface, after `onOpenWorkspaceSettings?`, add:

```typescript
onCursorSessionDetected?: (
  callback: (payload: { threadId: string; resumeId: string }) => void
) => () => void;
```

- [ ] **Step 4: Build and check for TypeScript errors**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/preload.ts apps/desktop/src/env.d.ts
git commit -m "feat: expose onCursorSessionDetected in preload"
```

---

## Task 8: Show toast in WorkspaceLayout on cursor session detection

**Files:**
- Modify: `src/layouts/WorkspaceLayout.vue`
- Modify: `src/layouts/__tests__/WorkspaceLayout.test.ts`

- [ ] **Step 1: Write the failing test**

Read `src/layouts/__tests__/WorkspaceLayout.test.ts` to understand the test setup, then add a test:

```typescript
it("shows toast when cursor session ID is detected for active thread", async () => {
  // Set up: mock api with onCursorSessionDetected
  let capturedCursorCallback: ((payload: { threadId: string; resumeId: string }) => void) | null =
    null;
  const mockApi = buildMockApi({
    onCursorSessionDetected: (
      cb: (payload: { threadId: string; resumeId: string }) => void
    ) => {
      capturedCursorCallback = cb;
      return () => {};
    },
  });

  // Mount WorkspaceLayout with a cursor thread active
  const { wrapper, toastStore } = mountWorkspaceLayout({ api: mockApi, activeThreadAgent: "cursor" });

  // Fire the event
  capturedCursorCallback!({ threadId: "thread-cursor-1", resumeId: "chat-resume-abc" });
  await nextTick();

  const toasts = toastStore.items;
  expect(toasts.some((t) => t.title === "Cursor session detected")).toBe(true);
  expect(toasts.some((t) => t.description.includes("chat-resume-abc"))).toBe(true);

  wrapper.unmount();
});
```

**Note:** Look at the existing test file to understand `buildMockApi` and `mountWorkspaceLayout` helpers. Match the pattern exactly. If `activeThreadAgent` isn't a supported option, pass the thread ID as the active thread ID and add a cursor thread to the mock snapshot.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/desktop && npx vitest run src/layouts/__tests__/WorkspaceLayout.test.ts
```

Expected: FAIL

- [ ] **Step 3: Read WorkspaceLayout.vue**

```
Read apps/desktop/src/layouts/WorkspaceLayout.vue
```

Find the `onMounted` / `onBeforeUnmount` section to locate where `disposeWorkspaceChanged` is set up.

- [ ] **Step 4: Subscribe to cursor session event in WorkspaceLayout.vue**

Declare a dispose variable alongside `disposeWorkspaceChanged`:

```typescript
let disposeCursorSessionDetected: (() => void) | null = null;
```

In `onMounted` (or wherever `disposeWorkspaceChanged` is registered), add:

```typescript
if (api?.onCursorSessionDetected) {
  disposeCursorSessionDetected = api.onCursorSessionDetected(({ threadId, resumeId }) => {
    if (threadId === workspace.activeThreadId) {
      toast.success("Cursor session detected", resumeId);
    }
  });
}
```

In `onBeforeUnmount`, add:

```typescript
disposeCursorSessionDetected?.();
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/desktop && npx vitest run src/layouts/__tests__/WorkspaceLayout.test.ts
```

Expected: new test PASS; no regressions

- [ ] **Step 6: Run all tests**

```bash
cd apps/desktop && npx vitest run
```

Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/layouts/WorkspaceLayout.vue apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts
git commit -m "feat: show toast when cursor session ID detected"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run full test suite**

```bash
cd apps/desktop && npx vitest run
```

Expected: all tests PASS

- [ ] **Step 2: TypeScript check**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Build the app**

```bash
cd apps/desktop && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no errors

- [ ] **Step 4: Commit if anything was missed**

```bash
git status
```

If clean, done. If not, add and commit remaining files.
