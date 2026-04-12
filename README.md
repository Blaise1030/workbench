<img width="221" height="50" alt="Screenshot 2026-04-10 at 10 02 57 AM" src="https://github.com/user-attachments/assets/5a56b748-14d4-4eec-9944-f5c80dca0a6a" />

# Workbench

A desktop workspace for running and managing local coding agents — built with Electron, Vue 3, and TypeScript.

## What is it?

Workbench is a native desktop application that gives you a dedicated environment to run AI coding agents (e.g. Claude Code, Cursor) across multiple projects. Instead of juggling terminals and editor windows, Workbench provides a unified interface with threads, an integrated terminal, code editing, and Git tooling — all in one place.

## Features

- **Agent Threads** — create and manage multiple agent sessions per project, with thread history in a sidebar
- **Resumable Sessions** — pick up where you left off; threads automatically resume their previous agent session when reopened
- **Integrated Terminal** — full PTY-backed terminal per thread, so agents can run commands natively
- **Code Editor** — CodeMirror-powered editor with syntax highlighting for many languages, find/replace, and quick-edit panel
- **Diff Review** — review agent-generated diffs before accepting changes
- **Source Control** — built-in Git panel with branch picker and worktree switcher
- **Multi-project Workspace** — open and switch between multiple projects via tabbed workspace launcher
- **Theme Toggle** — light and dark mode support

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron |
| Frontend | Vue 3 + Pinia |
| Editor | CodeMirror 6 |
| Terminal | node-pty |
| Language | TypeScript |
| Build | Vite + electron-builder |
| Testing | Vitest |
| Package manager | pnpm (monorepo) |

## Architecture

Workbench is an Electron app: the **renderer** (Vue) never touches the filesystem or shells directly. A small **preload** script exposes a typed `workspaceApi` via `contextBridge`, and the **main** process implements IPC handlers that delegate to services (`WorkspaceService`, PTY/run orchestration, file I/O, Git/diff). Workspace state is persisted through `WorkspaceStore`. The **landing page** is a separate Vite app in the same monorepo for marketing and downloads.

```mermaid
flowchart TB
  subgraph mono["Monorepo (pnpm)"]
    LP["apps/landing-page<br/>Vite static site"]
    subgraph desktop["apps/desktop — Workbench"]
      direction TB
      R["Renderer<br/>Vue 3 · Pinia · CodeMirror 6"]
      PR["Preload<br/>contextBridge → window.workspaceApi"]
      MP["Main process<br/>ipcMain · BrowserWindow"]
      subgraph svc["Main-process services"]
        direction LR
        WS["WorkspaceService"]
        RUN["PtyService / RunService"]
        FE["FileService / EditService"]
        DG["DiffService · Git"]
      end
      ST[("WorkspaceStore")]
    end
  end

  R <-->|invoke / events| PR
  PR <-->|IPC_CHANNELS| MP
  MP --> WS
  MP --> RUN
  MP --> FE
  MP --> DG
  WS --> ST
```

## Project Structure

```
apps/
  desktop/       # Electron app (main workbench)
  landing-page/  # Marketing/download page
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8.14+

### Development

```bash
# Install dependencies
pnpm install

# Run the desktop app in dev mode
pnpm dev:electron

# Run the landing page in dev mode
pnpm dev:landing
```

### Building

```bash
# Build the desktop app
pnpm build:app

# Package for distribution
pnpm dist
```

### Testing

```bash
pnpm test
```

## Links

- [Releases](https://github.com/Blaise1030/workbench/releases/latest)
- [GitHub](https://github.com/Blaise1030/workbench)
