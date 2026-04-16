# Hooks Reliability Design

**Date:** 2026-04-16
**Scope:** All 4 agents — Claude Code, Gemini CLI, Codex, Cursor

## Problem

Three features currently rely on PTY output scraping and submitted-input heuristics:

1. **Notifications** — completion detected by scanning terminal output patterns
2. **Thread renaming** — `maybeRenameThreadFromPrompt` fires on every PTY input line, including non-prompt commands
3. **Session ID capture** — regex on terminal buffer (`sessionIdStatusLine.ts`) races with output rendering and can miss IDs

All four agents support structured lifecycle hooks that fire at precise points and deliver clean JSON. This design replaces the fragile scraping with hook-driven events.

---

## Architecture

### HTTP Hook Server

Instrument starts a lightweight HTTP server at app launch using Node's built-in `http` module (no new dependencies). It binds to `127.0.0.1` only (never externally reachable) on a random free port.

- Port stored in app state at launch
- Single endpoint: `POST /hook`
- Reads `hook_event_name` from body, dispatches to the appropriate handler
- Stays alive for the lifetime of the Electron app

### Per-session env var injection

When `ptyService.getOrCreate` creates a PTY for a thread, Instrument injects:

```
INSTRUMENT_HOOK_URL=http://127.0.0.1:<port>
```

Hook scripts check for this variable first and `exit 0` silently if it is absent — hooks are inert outside Instrument sessions.

---

## Global Hook Registration

`HookRegistrationService` runs once at app launch (idempotent).

### Hook scripts

Written to `~/.instrument/hooks/`, one per agent:

- `claude-hook.sh`
- `gemini-hook.sh`
- `codex-hook.sh`
- `cursor-hook.sh`

Each script:
1. Exits 0 immediately if `INSTRUMENT_HOOK_URL` is unset
2. Reads stdin JSON
3. POSTs it to `$INSTRUMENT_HOOK_URL/hook` in the background (non-blocking — never slows the agent)

Scripts are versioned by a content hash stored alongside them (e.g. `claude-hook.hash`). On each app launch, if the hash is stale, the script is rewritten automatically so Instrument upgrades propagate without user action.

### Agent settings (merge-safe)

For each agent, `HookRegistrationService` reads the existing settings file, checks whether our hook entry is already present (matched by script path), and appends only if missing. Existing hooks for other purposes are never modified.

| Agent | Settings file | Events registered |
|---|---|---|
| Claude Code | `~/.claude/settings.json` | `SessionStart`, `UserPromptSubmit`, `Stop`, `StopFailure`, `Notification` |
| Gemini CLI | `~/.gemini/settings.json` | `SessionStart`, `BeforeAgent`, `AfterAgent`, `Notification` |
| Codex | `~/.codex/config.json` | `SessionStart`, `UserPromptSubmit`, `Stop` |
| Cursor | `~/.cursor/settings.json` | `SessionStart`, `UserPromptSubmit`, `Stop` |

> **Note:** Codex and Cursor settings paths and hook event names should be verified against their current docs before implementation. Claude Code and Gemini CLI paths are confirmed.

---

## Event → Handler Mapping

| Hook event | Agent(s) | Handler |
|---|---|---|
| `SessionStart` | All | Session ID capture |
| `UserPromptSubmit` / `BeforeAgent` | All | Thread rename — Phase 1 |
| `Stop` / `AfterAgent` | All | Notification (done) + Thread rename — Phase 2 |
| `StopFailure` | Claude, Codex, Cursor | Notification (failed) |
| `Notification` | Claude, Gemini | Forward to NotificationService |

---

## The Three Improvements

### 1. Session ID capture

`SessionStart` JSON always contains `session_id` as a top-level field. The HTTP handler calls `workspaceService.captureResumeId(threadId, sessionId)` directly — no regex, no buffer scanning, no timing race.

`sessionIdStatusLine.ts` is retained as a fallback for agent versions that predate hook support.

### 2. Thread renaming

Replaces `maybeRenameThreadFromPrompt` with a two-phase approach:

**Phase 1** — on `UserPromptSubmit` / `BeforeAgent`: extract the prompt text from hook JSON and rename the thread immediately. This is structurally the first user message, not an arbitrary PTY input line.

**Phase 2** — on `Stop` / `AfterAgent`: if the stop payload contains an agent-suggested conversation title, call `workspaceService.renameThread` again with that title. If no title is present, the Phase 1 name is kept.

`maybeRenameThreadFromPrompt` is retained as a fallback for sessions without hooks.

### 3. Notifications

`Stop` / `AfterAgent` replaces PTY output scanning for completion detection. `StopFailure` maps to `kind: "failed"`. The `Notification` event from Claude Code and Gemini forwards message text directly to `NotificationService`. No polling, no output parsing.

---

## Fallback behaviour

All three existing mechanisms (`sessionIdStatusLine.ts`, `maybeRenameThreadFromPrompt`, PTY output scanning for notifications) are retained. Hook-driven paths take priority when `INSTRUMENT_HOOK_URL` is set and a hook fires. This means the feature degrades gracefully for:

- Agent versions that predate hook support
- Threads started before `HookRegistrationService` completes
- Users who have disabled hooks in their agent settings

---

## Out of scope

- UI for managing which hooks are registered
- Hook event forwarding to the renderer (hooks are handled entirely in the main process)
- Supporting agents beyond the four listed
