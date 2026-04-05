# PTY Terminal — Design Spec

**Date:** 2026-04-05  
**Status:** Approved

## Problem

The current `TerminalService` spawns a new shell process per command (`spawn(shell, ["-lc", command])`). This means:

- No TTY allocated → interactive programs (`claude`, `vim`, `ssh`) hang or error
- Output only appears after a command completes (no streaming)
- Shell state doesn't persist (env vars set in one command are gone in the next)
- `cd` is handled manually in code rather than by the shell

`node-pty` is already installed. The fix is to replace the fake shell with a real PTY.

## Requirements

- Each worktree gets one persistent PTY session
- Switching worktrees does **not** kill the PTY — it stays alive
- Switching back to a worktree replays the scrollback buffer so the terminal looks as it was
- All interactive programs work (full TTY support)
- Output streams in real-time
- Terminal resizes correctly when the window or panel is resized

## Architecture

Five pieces change; everything else is untouched.

```
User types → xterm.onData → api.ptyWrite(worktreeId, data) → IPC → PtyService → PTY stdin
PTY stdout → PtyService buffers + webContents.send("terminal:ptyData") → preload → xterm.write(data)
```

### 1. PtyService (`electron/services/ptyService.ts`)

Replaces `TerminalService`. Holds a `Map<worktreeId, { pty: IPty, buffer: string }>`.

**Methods:**

- `getOrCreate(worktreeId, cwd)` — spawns a `node-pty` PTY using `$SHELL` (fallback `/bin/zsh`) if one doesn't exist. Registers `pty.onData` to append to buffer (capped at 100 KB) and broadcast to all windows via `BrowserWindow.getAllWindows().forEach(w => w.webContents.send("terminal:ptyData", { worktreeId, data }))`. Returns `{ buffer }`.
- `write(worktreeId, data)` — writes raw data to PTY stdin.
- `resize(worktreeId, cols, rows)` — calls `pty.resize(cols, rows)`.
- `kill(worktreeId)` — kills PTY and removes from map.

### 2. IPC Channels (`src/shared/ipc.ts`)

Remove `terminalExecute` and the `TerminalExecuteResult` interface. Add:


| Channel              | Direction              | Payload                      | Response             |
| -------------------- | ---------------------- | ---------------------------- | -------------------- |
| `terminal:ptyCreate` | renderer → main        | `{ worktreeId, cwd }`        | `{ buffer: string }` |
| `terminal:ptyWrite`  | renderer → main        | `{ worktreeId, data }`       | void                 |
| `terminal:ptyResize` | renderer → main        | `{ worktreeId, cols, rows }` | void                 |
| `terminal:ptyKill`   | renderer → main        | `{ worktreeId }`             | void                 |
| `terminal:ptyData`   | main → renderer (push) | `{ worktreeId, data }`       | —                    |


### 3. Preload (`electron/preload.ts`)

Remove `executeTerminalCommand`. Add:

```ts
ptyCreate: (worktreeId, cwd) => ipcRenderer.invoke("terminal:ptyCreate", { worktreeId, cwd })
ptyWrite:  (worktreeId, data) => ipcRenderer.invoke("terminal:ptyWrite", { worktreeId, data })
ptyResize: (worktreeId, cols, rows) => ipcRenderer.invoke("terminal:ptyResize", { worktreeId, cols, rows })
ptyKill:   (worktreeId) => ipcRenderer.invoke("terminal:ptyKill", { worktreeId })
onPtyData: (cb) => {
  const handler = (_event, payload) => cb(payload.worktreeId, payload.data)
  ipcRenderer.on("terminal:ptyData", handler)
  return () => ipcRenderer.off("terminal:ptyData", handler)
}
```

### 4. TerminalPane.vue (`src/components/TerminalPane.vue`)

**Props:** `{ worktreeId: string, cwd: string }` (replaces `lines`, `busy`)  
**Emits:** none (replaces `send`)

**On mount:**

1. `api.ptyCreate(worktreeId, cwd)` → get `{ buffer }`
2. `terminal.write(buffer)` — replay scrollback
3. Register `api.onPtyData((wid, data) => { if (wid === worktreeId) terminal.write(data) })`
4. `terminal.onData(data => api.ptyWrite(worktreeId, data))` — raw passthrough
5. `terminal.onResize(({ cols, rows }) => api.ptyResize(worktreeId, cols, rows))`

**On unmount:** call the disposer returned by `onPtyData`. Do NOT kill the PTY.

**Watch `worktreeId`:** when it changes, call the old `onPtyData` disposer, clear xterm (`terminal.reset()`), call `ptyCreate` for the new worktree, replay its buffer, register new listener.

Delete: `handleInput`, `currentLine`, `promptVisible`, `writePrompt`, `printNewLines`, `lastPrintedCount`.

### 5. WorkspaceLayout.vue (`src/layouts/WorkspaceLayout.vue`)

Remove: `terminalLines`, `terminalBusy`, `terminalCwd` refs, `handleTerminalInput`, `appendTerminalChunk`, and the `watch(activeWorktreeId)` block that managed terminal state.

Pass to TerminalPane: `:worktree-id="workspace.activeWorktreeId ?? ''"` and `:cwd="workspace.activeWorktree?.path ?? ''"`.

## Scrollback Buffer

- Stored as raw xterm data (includes ANSI escape codes)
- Capped at 100 KB; trim from the front when exceeded
- Replayed verbatim into xterm on reattach

## What is NOT changing

- xterm.js setup (FitAddon, theme, resize observer) — stays the same
- All other IPC channels and services
- WorkspaceLayout layout, panels, tabs
- Diff, preview, threads panels

