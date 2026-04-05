# PTY Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake command-by-command terminal with a real persistent PTY so interactive programs like `claude`, `vim`, and `ssh` work correctly.

**Architecture:** One `node-pty` process per worktree, created lazily and kept alive when switching worktrees. Main process buffers the last 100 KB of output and replays it when the renderer reattaches. Output streams in real-time via IPC push events; xterm.js becomes a pure passthrough.

**Tech Stack:** `node-pty` (already installed), `xterm` (already installed), Electron IPC (`ipcMain`/`ipcRenderer`), Vue 3 Composition API.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `electron/services/ptyService.ts` | Owns PTY lifecycle, buffer, broadcast |
| Modify | `src/shared/ipc.ts` | Add PTY channels; remove `terminalExecute` + `TerminalExecuteResult` |
| Modify | `src/env.d.ts` | Update `WorkspaceApi` interface |
| Modify | `electron/preload.ts` | Replace `executeTerminalCommand` with PTY methods |
| Modify | `electron/main.ts` | Register PTY IPC handlers; remove old terminal handler |
| Modify | `src/components/TerminalPane.vue` | Pure PTY passthrough; remove manual line/prompt logic |
| Modify | `src/layouts/WorkspaceLayout.vue` | Remove terminal state; pass `worktreeId`+`cwd` to TerminalPane |
| Delete | `electron/services/terminalService.ts` | Replaced by PtyService |

---

## Task 1: Update IPC channels

**Files:**
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Replace `terminalExecute` with PTY channels and remove `TerminalExecuteResult`**

Open `src/shared/ipc.ts` and replace its entire contents with:

```typescript
import type { Project, Thread, Worktree } from "./domain";

export const IPC_CHANNELS = {
  workspaceGetSnapshot: "workspace:getSnapshot",
  workspaceAddProject: "workspace:addProject",
  workspaceAddWorktree: "workspace:addWorktree",
  workspaceSetActive: "workspace:setActive",
  workspaceCreateThread: "workspace:createThread",
  workspaceSetActiveThread: "workspace:setActiveThread",
  runStart: "run:start",
  runSendInput: "run:sendInput",
  runInterrupt: "run:interrupt",
  diffChangedFiles: "diff:changedFiles",
  diffFileDiff: "diff:fileDiff",
  diffWorkingTree: "diff:workingTree",
  diffStageAll: "diff:stageAll",
  diffDiscardAll: "diff:discardAll",
  editApplyPatch: "edit:applyPatch",
  previewSetUrl: "preview:setUrl",
  previewProbeUrl: "preview:probeUrl",
  terminalPtyCreate: "terminal:ptyCreate",
  terminalPtyWrite: "terminal:ptyWrite",
  terminalPtyResize: "terminal:ptyResize",
  terminalPtyKill: "terminal:ptyKill",
  terminalPtyData: "terminal:ptyData",
  dialogPickRepoDirectory: "dialog:pickRepoDirectory"
} as const;

export interface WorkspaceSnapshot {
  projects: Project[];
  worktrees: Worktree[];
  threads: Thread[];
  activeProjectId: string | null;
  activeWorktreeId: string | null;
  activeThreadId: string | null;
}

export interface CreateThreadInput {
  projectId: string;
  worktreeId: string;
  title: string;
  agent: "codex" | "claude";
}

export interface AddProjectInput {
  name: string;
  repoPath: string;
  defaultBranch?: string;
}

export interface AddWorktreeInput {
  projectId: string;
  branch: string;
  worktreePath: string;
}

/** Result of checking whether a preview URL responds (main process; no CORS). */
export type PreviewProbeResult =
  | { ok: true; status: number }
  | { ok: false; code: "invalid" | "network"; message: string };
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
npx tsc -p tsconfig.electron.json --noEmit
```

Expected: no errors (there will be errors about `executeTerminalCommand` in preload/main — that's fine, we'll fix those next).

---

## Task 2: Create PtyService

**Files:**
- Create: `electron/services/ptyService.ts`

- [ ] **Step 1: Create the PtyService file**

Create `electron/services/ptyService.ts`:

```typescript
import { BrowserWindow } from "electron";
import * as pty from "node-pty";
import { IPC_CHANNELS } from "../../src/shared/ipc.js";

const MAX_BUFFER_BYTES = 100 * 1024; // 100 KB

interface PtySession {
  pty: pty.IPty;
  buffer: string;
}

export class PtyService {
  private sessions = new Map<string, PtySession>();

  getOrCreate(worktreeId: string, cwd: string): { buffer: string } {
    const existing = this.sessions.get(worktreeId);
    if (existing) {
      return { buffer: existing.buffer };
    }

    const shell = process.env.SHELL ?? "/bin/zsh";
    const instance = pty.spawn(shell, [], {
      name: "xterm-256color",
      cwd,
      env: process.env as Record<string, string>,
      cols: 80,
      rows: 24
    });

    const session: PtySession = { pty: instance, buffer: "" };
    this.sessions.set(worktreeId, session);

    instance.onData((data) => {
      session.buffer += data;
      if (Buffer.byteLength(session.buffer, "utf8") > MAX_BUFFER_BYTES) {
        // Trim from the front, keeping roughly the last MAX_BUFFER_BYTES
        session.buffer = session.buffer.slice(-MAX_BUFFER_BYTES);
      }
      const payload = { worktreeId, data };
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC_CHANNELS.terminalPtyData, payload);
      }
    });

    instance.onExit(() => {
      this.sessions.delete(worktreeId);
    });

    return { buffer: "" };
  }

  write(worktreeId: string, data: string): void {
    this.sessions.get(worktreeId)?.pty.write(data);
  }

  resize(worktreeId: string, cols: number, rows: number): void {
    this.sessions.get(worktreeId)?.pty.resize(cols, rows);
  }

  kill(worktreeId: string): void {
    const session = this.sessions.get(worktreeId);
    if (session) {
      session.pty.kill();
      this.sessions.delete(worktreeId);
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles with no errors in PtyService**

```bash
npx tsc -p tsconfig.electron.json --noEmit
```

Expected: errors only about `executeTerminalCommand` still referenced in preload/main (not about ptyService.ts).

---

## Task 3: Update main.ts — swap TerminalService for PtyService

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Replace the TerminalService import and instantiation**

In `electron/main.ts`, find:
```typescript
import { TerminalService } from "./services/terminalService.js";
```
Replace with:
```typescript
import { PtyService } from "./services/ptyService.js";
```

Find:
```typescript
const terminalService = new TerminalService();
```
Replace with:
```typescript
const ptyService = new PtyService();
```

- [ ] **Step 2: Replace the terminal IPC handler**

Find and remove this entire block:
```typescript
  ipcMain.handle(IPC_CHANNELS.terminalExecute, (_, payload: { sessionId: string; cwd: string; command: string }) =>
    terminalService.execute(payload.sessionId, payload.cwd, payload.command)
  );
```

Add these four handlers in its place (add them just before the `dialogPickRepoDirectory` handler):
```typescript
  ipcMain.handle(IPC_CHANNELS.terminalPtyCreate, (_, payload: { worktreeId: string; cwd: string }) =>
    ptyService.getOrCreate(payload.worktreeId, payload.cwd)
  );
  ipcMain.handle(IPC_CHANNELS.terminalPtyWrite, (_, payload: { worktreeId: string; data: string }) => {
    ptyService.write(payload.worktreeId, payload.data);
  });
  ipcMain.handle(IPC_CHANNELS.terminalPtyResize, (_, payload: { worktreeId: string; cols: number; rows: number }) => {
    ptyService.resize(payload.worktreeId, payload.cols, payload.rows);
  });
  ipcMain.handle(IPC_CHANNELS.terminalPtyKill, (_, payload: { worktreeId: string }) => {
    ptyService.kill(payload.worktreeId);
  });
```

- [ ] **Step 3: Verify TypeScript compiles with no errors in main.ts**

```bash
npx tsc -p tsconfig.electron.json --noEmit
```

Expected: errors only in preload.ts about `executeTerminalCommand`.

---

## Task 4: Update preload.ts

**Files:**
- Modify: `electron/preload.ts`

- [ ] **Step 1: Replace `executeTerminalCommand` with PTY methods**

Open `electron/preload.ts`. Find:
```typescript
  executeTerminalCommand: (sessionId: string, cwd: string, command: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.terminalExecute, { sessionId, cwd, command }),
```
Replace with:
```typescript
  ptyCreate: (worktreeId: string, cwd: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.terminalPtyCreate, { worktreeId, cwd }),
  ptyWrite: (worktreeId: string, data: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.terminalPtyWrite, { worktreeId, data }),
  ptyResize: (worktreeId: string, cols: number, rows: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.terminalPtyResize, { worktreeId, cols, rows }),
  ptyKill: (worktreeId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.terminalPtyKill, { worktreeId }),
  onPtyData: (callback: (worktreeId: string, data: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { worktreeId: string; data: string }) => {
      callback(payload.worktreeId, payload.data);
    };
    ipcRenderer.on(IPC_CHANNELS.terminalPtyData, handler);
    return () => ipcRenderer.off(IPC_CHANNELS.terminalPtyData, handler);
  },
```

- [ ] **Step 2: Verify TypeScript compiles clean**

```bash
npx tsc -p tsconfig.electron.json --noEmit
```

Expected: 0 errors.

---

## Task 5: Update WorkspaceApi type in env.d.ts

**Files:**
- Modify: `src/env.d.ts`

- [ ] **Step 1: Replace `executeTerminalCommand` with PTY methods in the WorkspaceApi interface**

Open `src/env.d.ts`. Remove the top import:
```typescript
import type { TerminalExecuteResult } from "@shared/ipc";
```

Find:
```typescript
  executeTerminalCommand: (sessionId: string, cwd: string, command: string) => Promise<TerminalExecuteResult>;
```
Replace with:
```typescript
  ptyCreate: (worktreeId: string, cwd: string) => Promise<{ buffer: string }>;
  ptyWrite: (worktreeId: string, data: string) => Promise<void>;
  ptyResize: (worktreeId: string, cols: number, rows: number) => Promise<void>;
  ptyKill: (worktreeId: string) => Promise<void>;
  onPtyData: (callback: (worktreeId: string, data: string) => void) => () => void;
```

- [ ] **Step 2: Verify TypeScript compiles (Vite/renderer side)**

```bash
npx tsc -p tsconfig.json --noEmit
```

Expected: errors only in `WorkspaceLayout.vue` (still references old terminal functions) and `TerminalPane.vue`. We'll fix those next.

---

## Task 6: Rewrite TerminalPane.vue

**Files:**
- Modify: `src/components/TerminalPane.vue`

- [ ] **Step 1: Replace the entire TerminalPane.vue**

Replace the full file with:

```vue
<script setup lang="ts">
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import { onBeforeUnmount, onMounted, watch } from "vue";
import { ref } from "vue";

const props = defineProps<{
  worktreeId: string;
  cwd: string;
}>();

const containerRef = ref<HTMLElement | null>(null);
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;
let themeObserver: MutationObserver | null = null;
let ptyDataDisposer: (() => void) | null = null;

function getApi(): WorkspaceApi | null {
  return window.workspaceApi ?? null;
}

function applyTheme(): void {
  if (!terminal || !containerRef.value) return;
  const cs = getComputedStyle(containerRef.value);
  const bg = cs.backgroundColor || "#ffffff";
  const fg = cs.color || "#0a0a0a";
  terminal.options.theme = { background: bg, foreground: fg, cursor: fg };
}

function fit(): void {
  if (!terminal || !fitAddon || !containerRef.value) return;
  const { clientWidth, clientHeight } = containerRef.value;
  if (clientWidth < 2 || clientHeight < 2) return;
  fitAddon.fit();
}

async function attachPty(worktreeId: string, cwd: string): Promise<void> {
  const api = getApi();
  if (!api || !terminal) return;

  // Detach previous listener
  ptyDataDisposer?.();
  ptyDataDisposer = null;

  terminal.reset();

  const { buffer } = await api.ptyCreate(worktreeId, cwd);
  if (buffer) {
    terminal.write(buffer);
  }

  ptyDataDisposer = api.onPtyData((wid, data) => {
    if (wid === worktreeId) terminal?.write(data);
  });
}

onMounted(async () => {
  const el = containerRef.value;
  if (!el) return;

  terminal = new Terminal({
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    lineHeight: 1.35,
    cursorBlink: true,
    cursorStyle: "block",
    convertEol: false,
    disableStdin: false
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(el);
  applyTheme();
  fit();

  const api = getApi();
  if (api) {
    terminal.onData((data) => {
      api.ptyWrite(props.worktreeId, data);
    });
    terminal.onResize(({ cols, rows }) => {
      api.ptyResize(props.worktreeId, cols, rows);
    });
  }

  resizeObserver = new ResizeObserver(() => {
    fit();
    applyTheme();
  });
  resizeObserver.observe(el);

  themeObserver = new MutationObserver(() => applyTheme());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  await attachPty(props.worktreeId, props.cwd);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  themeObserver?.disconnect();
  themeObserver = null;
  ptyDataDisposer?.();
  ptyDataDisposer = null;
  terminal?.dispose();
  terminal = null;
  fitAddon = null;
});

watch(
  () => props.worktreeId,
  async (newId) => {
    await attachPty(newId, props.cwd);
  }
);
</script>

<template>
  <section
    ref="containerRef"
    class="terminal-pane h-full min-h-0 min-w-0 overflow-hidden bg-card p-3 text-card-foreground text-xs"
    role="document"
    aria-label="Terminal"
  />
</template>

<style scoped>
.terminal-pane :deep(.xterm) {
  height: 100%;
  width: 100%;
  padding: 0;
}

.terminal-pane :deep(.xterm-viewport) {
  overflow-y: auto !important;
}
</style>
```

- [ ] **Step 2: Verify TypeScript compiles (renderer)**

```bash
npx tsc -p tsconfig.json --noEmit
```

Expected: errors only in `WorkspaceLayout.vue` (still passes old props).

---

## Task 7: Update WorkspaceLayout.vue

**Files:**
- Modify: `src/layouts/WorkspaceLayout.vue`

- [ ] **Step 1: Remove terminal state refs**

In the `<script setup>` block, remove these three lines:
```typescript
const terminalLines = ref<string[]>([]);
const terminalBusy = ref(false);
const terminalCwd = ref<string>("");
```

- [ ] **Step 2: Remove `appendTerminalChunk` function**

Remove this entire function:
```typescript
function appendTerminalChunk(chunk: string): void {
  const normalized = chunk.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = normalized.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) return;
  terminalLines.value.push(...lines);
}
```

- [ ] **Step 3: Remove `handleTerminalInput` function**

Remove this entire function:
```typescript
async function handleTerminalInput(command: string): Promise<void> {
  const api = getApi();
  const next = command.trim();
  if (!next) return;
  if (!api) {
    terminalLines.value.push("[error] Workspace API is not available.");
    return;
  }
  if (!workspace.activeWorktree) {
    terminalLines.value.push("[error] No active worktree selected.");
    return;
  }

  const sessionId = workspace.activeWorktreeId ?? workspace.activeProjectId ?? "default";
  const cwd = terminalCwd.value || workspace.activeWorktree.path;
  terminalLines.value.push(`${cwd} $ ${next}`);
  terminalBusy.value = true;

  try {
    const result = await api.executeTerminalCommand(sessionId, cwd, next);
    terminalCwd.value = result.cwd;
    appendTerminalChunk(result.stdout);
    appendTerminalChunk(result.stderr);
    if (result.exitCode && result.exitCode !== 0) {
      terminalLines.value.push(`[exit ${result.exitCode}]`);
    }
  } catch (error) {
    terminalLines.value.push(`[error] ${error instanceof Error ? error.message : "Terminal command failed."}`);
  } finally {
    terminalBusy.value = false;
  }
}
```

- [ ] **Step 4: Trim the `onMounted` and `watch` blocks**

Find the `onMounted` block:
```typescript
onMounted(async () => {
  window.addEventListener("mousemove", handleCenterPreviewResizeMove);
  window.addEventListener("mouseup", handleCenterPreviewResizeUp);
  await refreshSnapshot();
  await refreshChangedFiles();
  terminalCwd.value = workspace.activeWorktree?.path ?? "";
  terminalLines.value = workspace.activeWorktree
    ? [`[cwd] ${workspace.activeWorktree.path}`]
    : ["No active worktree selected."];
});
```
Replace with:
```typescript
onMounted(async () => {
  window.addEventListener("mousemove", handleCenterPreviewResizeMove);
  window.addEventListener("mouseup", handleCenterPreviewResizeUp);
  await refreshSnapshot();
  await refreshChangedFiles();
});
```

Find the `watch` block:
```typescript
watch(
  () => workspace.activeWorktreeId,
  async () => {
    await refreshChangedFiles();
    terminalCwd.value = workspace.activeWorktree?.path ?? "";
    terminalLines.value = workspace.activeWorktree
      ? [`[cwd] ${workspace.activeWorktree.path}`]
      : ["No active worktree selected."];
  }
);
```
Replace with:
```typescript
watch(
  () => workspace.activeWorktreeId,
  async () => {
    await refreshChangedFiles();
  }
);
```

- [ ] **Step 5: Update the TerminalPane usage in the template**

Find:
```html
            <TerminalPane
              :key="workspace.activeWorktreeId ?? 'no-worktree'"
              :lines="terminalLines"
              :busy="terminalBusy"
              @send="handleTerminalInput"
            />
```
Replace with:
```html
            <TerminalPane
              :worktree-id="workspace.activeWorktreeId ?? ''"
              :cwd="workspace.activeWorktree?.path ?? ''"
            />
```

- [ ] **Step 6: Verify TypeScript compiles clean**

```bash
npx tsc -p tsconfig.json --noEmit
```

Expected: 0 errors.

---

## Task 8: Delete TerminalService

**Files:**
- Delete: `electron/services/terminalService.ts`

- [ ] **Step 1: Delete the file**

```bash
rm electron/services/terminalService.ts
```

- [ ] **Step 2: Final TypeScript check (both configs)**

```bash
npx tsc -p tsconfig.electron.json --noEmit && npx tsc -p tsconfig.json --noEmit
```

Expected: 0 errors from both.

---

## Task 9: Manual verification

- [ ] **Step 1: Build electron files**

```bash
npm run dev:electron:tsc
```

Wait for: `Found 0 errors. Watching for file changes.`

- [ ] **Step 2: Start the full dev stack**

```bash
npm run dev:electron
```

Wait for the Electron window to open.

- [ ] **Step 3: Add a workspace and verify the terminal works**

1. Click "Add workspace", select any local Git repo folder
2. The workspace should open with the terminal panel showing a shell prompt
3. Type `echo hello` → should print `hello`
4. Type `cd ..` → CWD should update (verify with `pwd`)
5. Type `claude --print` → should NOT hang; should show an error about missing input (not the stdin timeout error from before)
6. Type `ls -la` → output should stream in real-time

- [ ] **Step 4: Verify worktree switching persists the session**

1. Add a second workspace
2. Run `export FOO=bar` in the terminal of workspace 1
3. Switch to workspace 2 (different terminal session — fresh shell)
4. Switch back to workspace 1
5. Run `echo $FOO` → should print `bar` (session was kept alive)
