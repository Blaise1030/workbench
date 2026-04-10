# Thread Activity Notification — Design Spec

**Date:** 2026-04-11  
**Status:** Approved

## Problem

The current notification system has two issues:

1. The idle timeout (5 seconds) is too long — threads sit in `"running"` state for 5s before being marked as needing attention.
2. `inFocus` is determined by which PTY pane is rendered (`visiblePtySessionId`), not which thread the user is actually on. This means switching to a shell tab in the bottom panel can cause the active thread to ring its bell when it goes idle, even though the user is still "on" that thread.
3. User keystrokes sent to the terminal are echoed back as PTY output and incorrectly treated as program activity, resetting the idle timer.

## Goals

- Show the green pulsing indicator while a thread has terminal activity (unchanged).
- After **1 second** of no meaningful program output, if the thread is not the user's active thread, mark it as needing attention and play the chirp.
- A thread is considered "active" if `activeThreadId === threadId` — regardless of which terminal pane (agent vs. shell) is currently shown.
- User keyboard input to the terminal must not count as program activity.

## Changes

### 1. `useThreadPtyRunStatus.ts` — idle timeout

```diff
- const IDLE_MS = 5000;
+ const IDLE_MS = 1000;
```

### 2. `useThreadPtyRunStatus.ts` — `inFocus` definition

Add `activeThreadId: Ref<string | null>` to `UseThreadPtyRunStatusOpts`.

```diff
  export type UseThreadPtyRunStatusOpts = {
    visibleSessionId: Ref<string | null>;
+   activeThreadId: Ref<string | null>;
    notificationsEnabled: Ref<boolean>;
    activitySensitivity: Ref<TerminalActivitySensitivity>;
  };
```

In `scheduleIdle`'s timeout callback, replace:

```diff
- const vis = opts.visibleSessionId.value;
- const inFocus = vis != null && vis === threadId;
+ const inFocus = opts.activeThreadId.value === threadId;
```

### 3. `useThreadPtyRunStatus.ts` — watcher

Replace the watcher that clears idle attention when `visibleSessionId` changes with one that watches `activeThreadId`:

```diff
  watch(
-   () => opts.visibleSessionId.value,
-   (id) => {
-     if (id != null && !id.startsWith("__")) {
-       clearIdleAttention(id);
-     }
-   },
+   () => opts.activeThreadId.value,
+   (id) => {
+     if (id != null) clearIdleAttention(id);
+   },
    { flush: "sync" }
  );
```

### 4. `useThreadPtyRunStatus.ts` — user input suppression

Add a `lastUserInputMs: Map<string, number>` inside the composable. Add `markUserInput(sessionId: string)` that records `Date.now()` for that session.

In `applyChunk`, before any processing:

```ts
if (Date.now() - (lastUserInputMs.get(threadId) ?? 0) < 300) return;
```

Return `markUserInput` from the composable alongside the existing exports.

### 5. `TerminalPane.vue` — emit user-typed

Add a `user-typed` emit fired whenever the terminal sends input to the PTY:

```ts
const emit = defineEmits<{
  // ... existing emits
  (e: "user-typed", sessionId: string): void;
}>();
```

Called inside the existing PTY write path:

```ts
emit("user-typed", props.ptySessionId);
```

### 6. `WorkspaceLayout.vue` — wiring

Destructure `markUserInput` from `useThreadPtyRunStatus` and pass `activeThreadId`:

```ts
const {
  runStatusByThreadId: ptyRunStatusByThreadId,
  idleAttentionByThreadId: ptyIdleAttentionByThreadId,
  clearIdleAttention: clearPtyIdleAttention,
  markUserInput: markPtyUserInput
} = useThreadPtyRunStatus(computed(() => workspace.threads), {
  visibleSessionId: visiblePtySessionId,
  activeThreadId: computed(() => workspace.activeThreadId),
  notificationsEnabled: terminalNotificationsEnabled,
  activitySensitivity: terminalActivitySensitivity
});
```

Wire `@user-typed` on the agent terminal pane and each shell terminal pane:

```html
<TerminalPane
  ...
  @user-typed="markPtyUserInput"
/>
```

## Non-changes

- `ThreadRow.vue` — no changes. Green pulsing indicator logic is unchanged.
- `attentionRules.ts` — no changes.

## Notes

- After these changes, `visibleSessionId` in `UseThreadPtyRunStatusOpts` is no longer used inside the composable (neither `inFocus` nor the watcher reference it). It can be removed from the opts type and all call sites as part of this PR, or left and cleaned up separately. The spec treats it as removable.

## Files affected

| File | Change |
|------|--------|
| `apps/desktop/src/composables/useThreadPtyRunStatus.ts` | IDLE_MS, inFocus, watcher, markUserInput |
| `apps/desktop/src/components/TerminalPane.vue` | Add user-typed emit |
| `apps/desktop/src/layouts/WorkspaceLayout.vue` | Pass activeThreadId, wire markUserInput |
