# Terminal Session Resume — Design Spec

## Summary

Terminal PTYs are ephemeral and disappear when the app restarts, but the underlying model conversations can often be resumed if the app retains the provider-specific session identifier. The design is to persist a durable "thread session" record per app thread, launch each provider through an app-owned wrapper, capture the provider's native resume ID plus the first submitted prompt, and use that metadata to relaunch the provider in resume mode after restart.

This design does not attempt to keep the exact PTY process alive across app restarts. Instead, it restores the more valuable state: the model conversation identity and a stable thread title derived from the first prompt.

## Key Decisions

| Decision | Choice |
|----------|--------|
| Persistence unit | One durable provider session record per app thread |
| PTY lifetime | Ephemeral; recreated after restart |
| Resume source of truth | Persisted provider `resumeId`, not in-memory PTY state |
| Launch path | App-owned wrappers for all supported providers |
| Title source | First submitted prompt captured from stdin |
| Title policy | Raw prompt truncated once; no later auto-renames |
| Resume behavior | Fresh PTY launches wrapper with saved `resumeId` when available |
| Failure behavior | Keep saved metadata, surface resume failure, allow "start fresh" |

## Problem

The current integrated terminal persists only live PTY sessions in memory (`PtyService.sessions`). When the app restarts:

- the PTY process is gone
- scrollback buffer is gone
- there is no saved provider session ID
- there is no way to invoke provider-native resume commands such as:
  - `claude --resume <session_id>`
  - `codex resume <SESSION_ID>`
  - `agent --resume="<chat-id>"`
  - `gemini --resume <id>`

The app also has no durable record of the thread's first prompt, so it cannot derive or restore a stable thread title from the terminal workflow.

## Goals

- Resume model conversations after app restart using each provider's native resume mechanism
- Capture the first submitted user prompt for each thread
- Rename the app thread once using the raw first prompt truncated to a short title
- Keep provider-specific resume behavior behind a normalized app contract
- Preserve resumability even if the PTY process exits or resume fails temporarily

## Non-Goals

- Preserving the original PTY process across app restart
- Reconstructing exact shell state such as exported env vars, shell functions, or cwd changes inside the old PTY
- Auto-renaming thread titles after the initial prompt-derived title is set
- Solving provider-auth issues beyond surfacing resume failure clearly

## Architecture

### Durable Session Record

Add a new persisted session record associated 1:1 with an app thread.

```ts
export interface ThreadSession {
  threadId: string;
  provider: ThreadAgent;
  resumeId: string | null;
  initialPrompt: string | null;
  titleCapturedAt: string | null;
  launchMode: "fresh" | "resume";
  status: "idle" | "active" | "resumable" | "resumeFailed";
  lastActivityAt: string;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
}
```

This record survives app restarts. The PTY does not.

### Wrapper-Based Launch

The app launches provider CLIs through wrapper commands rather than invoking raw providers directly from the PTY service.

Examples:

- `instrument-claude`
- `instrument-codex`
- `instrument-agent`
- `instrument-gemini`

Each wrapper:

1. launches the real provider CLI in a PTY-compatible way
2. proxies stdin/stdout/stderr through unchanged
3. captures the first submitted prompt from stdin
4. detects or retrieves the provider's native resume ID
5. emits normalized metadata events back to the app

The wrapper is intentionally thin. Its job is metadata capture and normalization, not UI policy.

### Sideband Metadata Channel

The wrapper emits metadata updates over an app-local side channel. The transport can be a local NDJSON event file, Unix domain socket, or another local IPC mechanism. The design requirement is a normalized event stream that survives wrapper restarts well enough for the main process to persist canonical state.

Normalized events:

- `session.started`
- `session.initial_prompt_captured`
- `session.resume_id_discovered`
- `session.activity`
- `session.resume_failed`
- `session.exited`

Example payload:

```json
{
  "type": "session.resume_id_discovered",
  "threadId": "thread_123",
  "provider": "claude",
  "resumeId": "abc123",
  "occurredAt": "2026-04-07T10:00:00.000Z"
}
```

The Electron main process persists the canonical copy into SQLite and broadcasts UI updates to the renderer.

## Provider Adapter Model

The app should not know how each provider exposes its resume handle. That logic lives in provider-specific wrapper adapters behind one contract.

```ts
interface ResumeCaptureAdapter {
  provider: ThreadAgent;
  freshCommand(cwd: string): { file: string; args: string[] };
  resumeCommand(cwd: string, resumeId: string): { file: string; args: string[] };
  detectResumeId(chunk: string): string | null;
}
```

Preferred capture order:

1. machine-readable provider API or session artifact, if available
2. provider-specific stdout/stderr parsing
3. explicit failure event if no resume ID can be discovered

This keeps provider breakage isolated. A Claude CLI output change should not affect Codex resume behavior.

## First Prompt Capture

Thread title derivation comes from user input, not model output.

The wrapper buffers submitted text from stdin:

- append printable characters
- handle backspace/delete
- ignore control sequences
- on Enter, submit the accumulated line

The first non-empty submitted line after provider start becomes `initialPrompt`. The wrapper emits it exactly once:

```json
{
  "type": "session.initial_prompt_captured",
  "threadId": "thread_123",
  "provider": "codex",
  "initialPrompt": "fix the flaky sidebar ordering test and explain why it broke",
  "occurredAt": "2026-04-07T10:00:05.000Z"
}
```

The app truncates that raw prompt and renames the thread once. After `titleCapturedAt` is set, later prompts do not rewrite the title unless the user manually renames the thread.

## Startup And Resume Flow

### Fresh Thread

1. User opens a thread with no saved `resumeId`
2. App creates a fresh PTY session
3. App launches the provider wrapper in fresh mode
4. Wrapper emits `session.started`
5. Wrapper captures `initialPrompt`
6. Wrapper discovers `resumeId`
7. Main process persists both and updates thread title if not already set

### Restarted App

1. App hydrates workspace state and thread sessions from SQLite
2. Threads with a non-null `resumeId` are marked resumable
3. Selecting such a thread creates a new PTY session
4. App launches the wrapper in resume mode using saved `resumeId`
5. Wrapper reattaches the provider conversation
6. UI shows the thread as active again under a fresh PTY

### Resume Failure

If resume fails:

1. wrapper emits `session.resume_failed`
2. app preserves the existing `resumeId` and `initialPrompt`
3. UI marks the thread as `resumeFailed`
4. user can retry resume or choose "Start Fresh"

Starting fresh does not delete history immediately. It creates a new fresh launch for the same thread session record, replacing `resumeId` only once a new one is successfully captured.

## Database Changes

Add a new table:

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
```

Suggested index:

```sql
CREATE INDEX IF NOT EXISTS idx_thread_sessions_status ON thread_sessions(status);
```

## IPC Changes

Add main/renderer APIs for reading thread session state and for launching a thread terminal in fresh or resume mode.

New channels:

| Channel | Input | Output | Purpose |
|---------|-------|--------|---------|
| `terminal:getThreadSession` | `{ threadId }` | `ThreadSession \| null` | Fetch persisted session metadata |
| `terminal:launchThreadSession` | `{ threadId, forceFresh?: boolean }` | `{ sessionId, resumed: boolean }` | Create PTY and launch wrapper |
| `terminal:threadSessionDidChange` | `ThreadSession` | — | Push metadata updates to renderer |

Existing PTY channels remain responsible only for terminal byte transport.

## Renderer UX

Threads gain lightweight session state:

- provider badge
- `resumable` state when `resumeId` exists and no live PTY is attached
- `resume failed` state when last resume attempt failed
- last activity timestamp

Thread open behavior:

- if the thread has a saved `resumeId`, default to resume
- if resume fails, show inline actions:
  - `Retry Resume`
  - `Start Fresh`

Title behavior:

- when `initialPrompt` is first captured, rename the thread using a truncated raw prompt
- never auto-rename again after that point

## Components And Services Affected

| Area | Change |
|------|--------|
| `electron/services/ptyService.ts` | Launch wrappers instead of raw provider CLIs for thread-bound sessions |
| `electron/runtime/ptyManager.ts` | No architectural change; still owns live PTY instances |
| `electron/storage/schema.sql` | Add `thread_sessions` table |
| `electron/storage/store.ts` | Persist, read, and update thread session records |
| `src/shared/ipc.ts` | Add thread-session IPC contracts |
| `src/shared/domain.ts` | Add `ThreadSession` type |
| `src/stores/workspaceStore.ts` or new store | Hydrate renderer-visible session metadata |
| `src/components/ThreadSidebar.vue` | Render resumable / failed session state |
| wrapper scripts | New provider launch wrappers and event emission |

## Implementation Notes

- Keep title truncation policy in the Electron main process, not in the wrapper
- Keep provider-specific resume extraction logic out of renderer code
- Treat `resumeId` as durable but replaceable metadata; only overwrite it after successful discovery
- Store provider-specific extras in `metadataJson` instead of adding columns prematurely

## Rollout Plan

1. Add durable `thread_sessions` persistence and renderer hydration
2. Implement wrapper contract plus one provider vertical slice, preferably `claude`
3. Add first-prompt capture and one-time thread title rename
4. Add provider adapters for `codex`, `agent`, and `gemini`
5. Add resume-failure UX and regression tests

## Risks

- Some providers may not expose resume IDs in a stable, machine-readable way
- Wrapper parsing could drift if a provider changes CLI output
- Input capture must avoid misidentifying shell keystrokes or control sequences as prompts
- Resume semantics may differ between providers even if the wrapper contract is unified

## Out Of Scope

- Persisting full terminal scrollback across app restart
- Auto-summarizing prompts into titles
- Sharing one provider conversation across multiple app threads
- Migrating existing unnamed threads beyond capturing titles on future launches
