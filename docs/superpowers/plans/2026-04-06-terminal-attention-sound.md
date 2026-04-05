# Terminal attention sound — Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play short Web Audio chirps for terminal BEL and optional one-shot background PTY output, with user toggles persisted in `localStorage`, using one global `onPtyData` listener and xterm `bellStyle: 'none'`.

**Architecture:** Pure helpers decide “in view” and what each chunk triggers; a composable owns `onPtyData`, per-session one-shot armed state, and re-arming when the visible session changes; `TerminalPane` only disables xterm’s native bell to avoid duplicates.

**Tech stack:** Vue 3, Pinia (`workspaceStore`), Electron preload `workspaceApi.onPtyData`, Vitest, xterm.js 5.x.

**Spec:** `docs/superpowers/specs/2026-04-06-terminal-attention-sound-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `src/terminal/attentionRules.ts` | Pure: BEL detection, non-BEL content, visible session id, decision to play once per chunk |
| `src/terminal/__tests__/attentionRules.test.ts` | Vitest for `attentionRules.ts` |
| `src/terminal/playTerminalChirp.ts` | Web Audio one-shot beep; resume `AudioContext` on user gesture if needed |
| `src/composables/useTerminalSoundSettings.ts` | Read/write two booleans in `localStorage` (mirror `useColorScheme` style) |
| `src/composables/useTerminalAttentionSounds.ts` | Register `onPtyData`, maintain `Map<sessionId, armed>`, call `playTerminalChirp`, watch store + `centerTab` for re-arm |
| `src/layouts/WorkspaceLayout.vue` | Call composable with `workspace.activeThreadId`, `workspace.activeWorktreeId`, `centerTab` ref |
| `src/components/TerminalPane.vue` | `bellStyle: 'none'` in `Terminal` ctor options |
| `src/components/TerminalSoundSettings.vue` (name flexible) | Two labeled checkboxes bound to `useTerminalSoundSettings` |
| `src/layouts/WorkspaceLayout.vue` (template) | Mount settings control near center panel chrome (e.g. next to `PillTabs` or header row) |

---

### Task 1: Pure attention rules + tests

**Files:**

- Create: `src/terminal/attentionRules.ts`
- Create: `src/terminal/__tests__/attentionRules.test.ts`

- [ ] **Step 1: Write failing tests**

Implement tests for (names illustrative):

- `chunkContainsBell("\x07")` → true; `"hello"` → false; mixed string → true
- `chunkHasNonBellContent("\x07")` → false; `"\x07a"` → true; `"a\x07"` → true
- `visibleTerminalSessionId(activeThreadId, activeWorktreeId)` → `null` if no worktree; thread id when `activeThreadId` non-null non-empty; `` `__wt:${activeWorktreeId}` `` when thread id empty/null
- `decideTerminalAttentionChunk({ ... })` returns at most one `"chirp"` for combined bell+background per spec (table-driven cases: in-view + bell, not-in-view + bell, not-in-view + text + armed, not-in-view + text + disarmed, BEL-only + background flag)

```ts
// Example shape for decideTerminalAttentionChunk (adjust names to match implementation):
// export type AttentionDecision = { playSound: boolean };
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- src/terminal/__tests__/attentionRules.test.ts`  
Expected: FAIL (missing module or undefined exports)

- [ ] **Step 3: Implement `attentionRules.ts`**

Implement functions used by tests; keep PTY session id semantics aligned with `TerminalPane` (`threadId` or `` `__wt:${worktreeId}` ``).

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- src/terminal/__tests__/attentionRules.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/terminal/attentionRules.ts src/terminal/__tests__/attentionRules.test.ts
git commit -m "feat(terminal): pure attention rules for BEL and background sound"
```

---

### Task 2: Web Audio chirp

**Files:**

- Create: `src/terminal/playTerminalChirp.ts`

- [ ] **Step 1: Implement `playTerminalChirp()`**

- Create or reuse one `AudioContext` (module singleton).
- Short oscillator beep (~120–200 ms, frequency ~800–1000 Hz, exponential ramp down).
- Call `audioContext.resume()` inside the function (safe no-op if already running).
- No test required if timing is manual; optional mock `AudioContext` test if cheap.

- [ ] **Step 2: Manual check**

Run Electron app, open devtools console, dynamic import and call `playTerminalChirp()` after a click — expect audible beep.

- [ ] **Step 3: Commit**

```bash
git add src/terminal/playTerminalChirp.ts
git commit -m "feat(terminal): Web Audio chirp for attention sound"
```

---

### Task 3: localStorage settings composable

**Files:**

- Create: `src/composables/useTerminalSoundSettings.ts`

- [ ] **Step 1: Write failing test** (optional if following `useColorScheme` pattern without tests — prefer test for read/write defaults)

Create `src/composables/__tests__/useTerminalSoundSettings.test.ts` with `vi.stubGlobal('localStorage', ...)` or real `localStorage` under jsdom: defaults `bell=true`, `background=false`; setters persist keys e.g. `instrument.terminalBellSound`, `instrument.terminalBackgroundOutputSound` (string `"true"`/`"false"` or JSON booleans — pick one and document).

- [ ] **Step 2: Run test — FAIL**

Run: `npm test -- useTerminalSoundSettings`  
Expected: FAIL

- [ ] **Step 3: Implement composable**

Return `terminalBellSound`, `terminalBackgroundOutputSound` as `ref<boolean>` + setters; initialize from storage.

- [ ] **Step 4: Run test — PASS**

Run: `npm test -- useTerminalSoundSettings`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/composables/useTerminalSoundSettings.ts src/composables/__tests__/useTerminalSoundSettings.test.ts
git commit -m "feat(terminal): persisted sound settings composable"
```

---

### Task 4: `useTerminalAttentionSounds` composable

**Files:**

- Create: `src/composables/useTerminalAttentionSounds.ts`

- [ ] **Step 1: Implement composable API**

```ts
// Intended usage (signature may vary):
// useTerminalAttentionSounds({
//   getCenterTab: () => 'terminal' | 'diff',
//   getActiveThreadId: () => string | null,
//   getActiveWorktreeId: () => string | null,
//   bellEnabled: Ref<boolean>,
//   backgroundEnabled: Ref<boolean>,
// });
```

Behavior:

- `onMounted`: `const dispose = api.onPtyData((sessionId, data) => { ... })`; `onBeforeUnmount(dispose)`.
- Maintain `Map<string, boolean>` for **armed** (default **true** for new session ids when first seen, or start armed only after first view — spec: **re-arm when entering view**; initially armed `true` for all sessions is acceptable).
- On each chunk: compute `visibleSessionId` via `visibleTerminalSessionId`; use `decideTerminalAttentionChunk` (or inline equivalent) with settings; if `playSound`, call `playTerminalChirp()` once; update armed for that `sessionId` if background fired.
- `watch([centerTab, activeThreadId, activeWorktreeId], () => { /* re-arm visible session id */ })` so returning to that terminal allows next one-shot.

Guard: if `!window.workspaceApi`, no-op.

- [ ] **Step 2: Unit test with mocked `onPtyData`**

Prefer extracting `handlePtyChunk(state, ...)` from the composable into a testable function in `attentionRules.ts` or a tiny `attentionStateMachine.ts` if Vue lifecycle makes tests awkward. At minimum, extend `attentionRules.test.ts` for any new pure reducer.

- [ ] **Step 3: Commit**

```bash
git add src/composables/useTerminalAttentionSounds.ts src/terminal/attentionRules.ts src/terminal/__tests__/attentionRules.test.ts
git commit -m "feat(terminal): PTY attention sound composable"
```

---

### Task 5: Wire layout + xterm

**Files:**

- Modify: `src/layouts/WorkspaceLayout.vue`
- Modify: `src/components/TerminalPane.vue`

- [ ] **Step 1: Call `useTerminalAttentionSounds` in `WorkspaceLayout`**

Pass `centerTab`, `workspace.activeThreadId`, `workspace.activeWorktreeId`, and settings refs from `useTerminalSoundSettings`.

- [ ] **Step 2: `TerminalPane` — `bellStyle: 'none'`**

In `new Terminal({ ... })`, add `bellStyle: "none"` (verify exact xterm 5 option name in `node_modules/xterm/typings/xterm.d.ts`).

- [ ] **Step 3: Manual verification**

Scenarios from spec: `echo -e '\a'` active thread; switch thread, BEL from other session; background `while true; do echo x; sleep 1; done` one-shot; switch back and confirm re-arm.

- [ ] **Step 4: Commit**

```bash
git add src/layouts/WorkspaceLayout.vue src/components/TerminalPane.vue
git commit -m "feat(terminal): wire attention sounds and mute xterm bell"
```

---

### Task 6: Settings UI

**Files:**

- Create: `src/components/TerminalSoundSettings.vue` (or similar)
- Modify: `src/layouts/WorkspaceLayout.vue`

- [ ] **Step 1: Build two checkboxes**

Labels: “Terminal bell sound”, “Sound when terminal output arrives in background” (or shorter copy). Bind to `useTerminalSoundSettings`.

- [ ] **Step 2: Place in workspace UI**

Minimal footprint: e.g. row above `PillTabs` or popover from a small icon button beside center tabs. Use existing `BaseButton` / design tokens.

- [ ] **Step 3: Manual check**

Toggling off disables expected sounds.

- [ ] **Step 4: Commit**

```bash
git add src/components/TerminalSoundSettings.vue src/layouts/WorkspaceLayout.vue
git commit -m "feat(terminal): UI toggles for attention sounds"
```

---

### Task 7: Typecheck + full test suite

- [ ] **Step 1: Run**

```bash
npm run typecheck
npm test
```

Expected: no errors.

- [ ] **Step 2: Commit** (only if fixes were needed)

```bash
git commit -m "fix: terminal attention sound follow-ups"
```

---

## Notes for implementers

- **Multi-window:** Spec allows duplicate sounds; no change required for v1.
- **Browser-only dev (`npm run dev` without Electron):** `workspaceApi` missing — composable must no-op without throwing.
- **@skills:** For execution, follow `superpowers:verification-before-completion` before claiming done.

---

## Plan review

No `plan-document-reviewer` prompt in-repo; human or follow-up review optional.
