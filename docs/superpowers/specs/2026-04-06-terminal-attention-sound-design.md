# Terminal attention sound — Design spec

**Date:** 2026-04-06  
**Status:** Draft (pending user review)

## Problem

Users miss PTY activity when another thread is selected or when the center panel is not on the Terminal tab. The integrated terminal uses xterm.js, but only the **active** thread’s session is written into xterm; output for other sessions still reaches the renderer via IPC. Standard terminal **bell** (BEL, `0x07`) should be audible when appropriate, including for **background** sessions.

## Goals

- **Short sound only** — no OS notifications, no in-app badges for this feature.
- **Terminal bell:** honor BEL in the PTY byte stream for **any** session (including when that session is not shown in xterm).
- **Background output:** optional one-shot alert when output arrives while that session is **not in view**; stay silent until the user views that session again.
- **User control:** separate toggles for bell vs background-output sounds.

## Non-goals

- System Notification Center integration.
- Visual badges, tab dots, or unread counts (out of scope for this spec).
- Per-session volume, custom sound files, or sound themes (YAGNI).

## Definitions

- **Session id:** Same as today — thread id when a thread exists (see `TerminalPane` / `PtyService`).
- **Terminal output is in view** when **both** are true:
  1. Center panel active tab is **Terminal** (not Diff, etc.).
  2. `workspace.activeThreadId === sessionId` for that PTY session.

Otherwise the session is **not in view**.

## User settings

Persist with existing workspace/store patterns.

| Key | Meaning | Default |
| --- | --- | --- |
| `terminalBellSound` | Play a short sound when BEL (`0x07`) appears in PTY data for any session. | **on** |
| `terminalBackgroundOutputSound` | One-shot sound when non-empty PTY data arrives for a session that is **not in view**. | **off** |

Rationale: background output can be noisy; default off avoids surprise. Bell default on matches conventional terminal behavior.

## Behavior

### Bell

- On each `onPtyData` chunk, if `terminalBellSound` is enabled and the chunk contains at least one `0x07`, schedule **at most one** audible event for that chunk (multiple BELs in one chunk still yield one sound).

### Background output

- If `terminalBackgroundOutputSound` is enabled, session is **not in view**, chunk is non-empty (for purposes of this rule, treat BEL-only chunks as handled by the bell rule only; do not double-count for “output”), and the session’s **one-shot is armed** → play **one** short sound and **disarm** the one-shot for that session.
- **Re-arm:** When the user transitions **into** “in view” for session `S`, set `S`’s one-shot back to **armed** so the next spell of background activity can alert again.

### Combined (same chunk)

- If both bell and background rules would fire for the same chunk, the user hears **one** sound total for that chunk.

### Audio implementation

- **Renderer-only:** Web Audio API (e.g. short oscillator beep) in a small helper `playTerminalChirp()`.
- **Autoplay:** Chromium may block audio until user gesture. Document that the first sound may be silent until the user has interacted with the app; optional follow-up: unlock audio context on first click/keypress in the shell (implementation detail in the plan phase).

### xterm interaction

- Today, only the active session’s stream is passed to `terminal.write()`. BEL in **other** sessions never reaches xterm’s `onBell`.
- **Global handling** is therefore required for cross-session bell.
- For the **active** session, BEL is both in the IPC stream and would be handled by xterm — **recommended:** set xterm **`bellStyle: 'none'`** and handle all BEL in the global listener so every session uses one code path and **exactly one** bell sound fires per chunk when applicable.

## Architecture

**Chosen approach:** global renderer subscription to `workspaceApi.onPtyData` + Web Audio.

```
PtyService (existing) → IPC terminalPtyData (all sessions) → preload onPtyData
       → attention module (WorkspaceLayout or composable)
              → reads activeThreadId + center tab + settings
              → updates per-session one-shot state
              → playTerminalChirp() when rules fire
TerminalPane → unchanged PTY attach/write path; optional xterm bellStyle tweak
```

**Why not xterm-only:** Inactive sessions never receive bytes in xterm; bell would be lost.

**Why not main-process beep:** Extra IPC, inconsistent OS behavior, unnecessary for “short chirp” in Electron.

## Error handling and edge cases

- **Empty string chunks:** Ignore for background-output rule.
- **Thread removed / PTY killed:** Drop or ignore one-shot state for that `sessionId` when no longer relevant (e.g. on kill notification if available; otherwise stale map entries are harmless).
- **Multiple windows:** Main already broadcasts to all windows; each renderer instance may play sound — acceptable for rare multi-window use; document as known limitation unless deduped later.

## Testing

- Manual: BEL in foreground terminal; BEL while another thread selected; long-running command on background thread (verify one shot until refocus); switch to Terminal tab for that thread (re-arm); toggle settings.
- Optional unit tests: BEL detection helper, “in view” predicate if extracted as pure functions.

## References

- Existing PTY broadcast: `electron/services/ptyService.ts` (`terminalPtyData` to all `BrowserWindow`s).
- Terminal UI: `src/components/TerminalPane.vue`, `src/layouts/WorkspaceLayout.vue` (single `TerminalPane` bound to `activeThreadId`, center tabs).
