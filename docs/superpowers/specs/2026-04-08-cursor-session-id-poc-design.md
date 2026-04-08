# Cursor Session ID Detection PoC — Design Spec

## Summary

Build a Cursor-only proof of concept that starts Cursor threads through an app-owned wrapper instead of the raw `cursor agent` command. The wrapper runs inside the existing integrated terminal PTY, forwards stdin/stdout/stderr unchanged, watches for Cursor chat/session ID signals, and notifies the Electron main process when it detects one.

When the app receives the first detected Cursor session ID for a thread, it persists the value into the existing `thread_sessions` row and immediately alerts the user in the renderer with a visible notification. The PoC stops there. It does not implement full resume-on-open yet.

## Problem

The app already has an integrated PTY per thread and already persists `thread_sessions`, but Cursor threads still launch through a plain bootstrap command. That means:

- the app does not control Cursor startup enough to attach session-ID capture logic
- no Cursor chat ID is persisted while the session is live
- there is no user-visible confirmation that the app detected a resumable Cursor session

For a PoC, the goal is to prove that a Cursor thread launched by the app can surface a session/chat identifier while staying interactive.

## Goals

- Start Cursor threads through an app-owned wrapper command.
- Keep the terminal experience interactive and unchanged from the user's perspective.
- Detect a Cursor session/chat identifier while the session is live.
- Persist the detected ID to the thread's `thread_sessions.resumeId`.
- Show an immediate UI alert or toast when the ID is first detected.
- Limit the change to Cursor threads only.

## Non-Goals

- Full resume flow for Cursor threads.
- Generalized provider wrapper infrastructure for Claude, Codex, or Gemini.
- Perfectly reliable detection across all Cursor CLI versions.
- Detecting session IDs for manually launched `cursor-agent` commands in arbitrary shell tabs.
- Replacing the existing PTY architecture.

## Key Decisions

| Decision | Choice |
|----------|--------|
| Scope | Cursor threads only |
| Launch path | Replace Cursor bootstrap command with app-owned wrapper |
| PTY model | Keep existing PTY; wrapper runs inside it |
| Detection timing | While session is live, not only on shutdown |
| Detection method | Output parsing first, designed so artifact-based lookup can be added later |
| Persistence target | Existing `thread_sessions.resumeId` |
| User feedback | Renderer toast on first successful detection |

## Proposed Flow

### Starting a Cursor thread

1. User creates or opens a Cursor thread.
2. The renderer boots the terminal as it does today.
3. Instead of injecting raw `cursor agent`, the app injects a wrapper command.
4. The wrapper starts the real Cursor CLI process in interactive mode.
5. The wrapper forwards terminal I/O unchanged.
6. While forwarding output, the wrapper scans for Cursor session/chat ID signals.
7. On first detection, the wrapper emits a sideband event to Electron main.
8. Electron persists `resumeId` on the matching thread session row.
9. Electron broadcasts a renderer event.
10. The renderer shows a visible toast containing the detected session ID.

### Detection semantics

The PoC should treat detection as write-once per live session:

- first valid detected ID wins
- repeated sightings of the same ID are ignored
- conflicting later IDs are ignored for the PoC and logged for debugging

This keeps the behavior deterministic while validating whether Cursor exposes stable enough signals for this app to use.

## Architecture

### Wrapper entrypoint

Add a Cursor-specific wrapper script under the desktop app, for example:

`apps/desktop/scripts/session-resume/instrument-cursor.js`

Responsibilities:

- accept thread-scoped metadata from the app, especially `threadId`
- spawn the real Cursor CLI command
- proxy stdin/stdout/stderr without changing terminal behavior
- parse output chunks for candidate session/chat IDs
- emit a normalized sideband event once an ID is detected

The wrapper is intentionally narrow. It should not own persistence or UI behavior.

### Sideband event contract

For the PoC, one event is enough:

```json
{
  "type": "session.resume_id_discovered",
  "threadId": "thread_123",
  "provider": "cursor",
  "resumeId": "chat-id-here",
  "occurredAt": "2026-04-08T12:00:00.000Z"
}
```

Transport can be minimal and local to the Electron app. The important part is that the terminal byte stream and the metadata stream stay separate.

### Persistence

Reuse the existing `thread_sessions` table and `resumeId` column.

On first detected Cursor ID:

- create or update the thread session row if needed
- set `provider` to `cursor`
- set `resumeId` to the detected chat ID
- set `status` to `resumable`
- update `lastActivityAt` and `updatedAt`

No migration is required for the PoC because the session table already exists.

### Renderer notification

The renderer should show a toast when a Cursor session ID is first captured for the active thread.

Toast content:

- title: `Cursor session detected`
- description: include the detected session ID

This is enough for the PoC. A modal or blocking alert is unnecessary.

## Detection Strategy

The primary challenge is that Cursor's interactive CLI does not appear to expose a documented hook-style machine-readable session-ID feed equivalent to Claude's hooks. The PoC therefore starts with output parsing inside the wrapper.

Candidate signals to watch for:

- explicit resume instructions printed by Cursor
- chat/session IDs shown in status lines
- other stable CLI text that includes the resumable identifier

The parser should:

- strip ANSI escape sequences before matching
- tolerate chunk boundaries by keeping a rolling text buffer
- use provider-specific regexes isolated to the Cursor wrapper

The wrapper should be implemented so a second detection backend can be added later:

- local artifact lookup if Cursor stores session metadata on disk in a stable location
- structured non-interactive capture if Cursor exposes a compatible launch path

## Failure Handling

If no ID is detected:

- Cursor still runs normally
- no toast is shown
- the thread remains usable
- the session row is left unchanged apart from optional activity timestamps

If the wrapper fails to launch Cursor:

- surface the failure in the terminal just like any other bootstrap failure
- do not silently fall back to raw Cursor launch, because that would hide PoC failures

## Testing

### Unit tests

- wrapper parser extracts a valid chat ID from representative Cursor output
- parser ignores unrelated output
- repeated detections do not emit duplicate events
- persistence path updates `thread_sessions.resumeId`

### Integration tests

- creating a Cursor thread injects the wrapper bootstrap command instead of raw `cursor agent`
- receiving a discovery event triggers persistence and renderer notification

## Open Questions

- What exact output shape does the installed Cursor CLI print when a session becomes resumable in interactive mode?
- Does the local Cursor installation expose session artifacts that are more stable than terminal output?
- Should the PoC notify only for the active thread, or for any background Cursor thread that gets a detected ID?

## Recommendation

Implement this as a narrow Cursor-only PoC with a wrapper and a toast. If detection works reliably enough on the installed Cursor CLI, the app can generalize the same shape into a provider adapter system later. If detection is noisy, the next step should be artifact-based lookup rather than doubling down on shutdown-time scraping.
