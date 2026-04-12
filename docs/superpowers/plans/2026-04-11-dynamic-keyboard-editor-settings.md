# Dynamic keyboard editor (Settings dialog) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users change workspace keyboard shortcuts from the Settings → Keyboard tab, persist choices across sessions, and have tooltips, the launcher, and `useWorkspaceKeybindings` honor the same effective bindings.

**Architecture:** Keep `KEYBINDING_DEFINITIONS` in `registry.ts` as the immutable app defaults. Add a Pinia store (or module-level composable mirroring `useTerminalSoundSettings`) that holds per-`KeybindingId` overrides in `localStorage`. Pure `mergeKeybindingOverrides(defaults, overrides)` produces `KeybindingDefinition[]` for runtime. Refactor display helpers so they resolve definitions from the store (or from injected getters) instead of the static array. The settings UI adds “click to record” rows with conflict detection, Escape to cancel, and Reset to defaults. Treat `switchProjectOrTerminalDigit` as **non-editable** in v1 (logic is the whole mod+digit 1–9 family wired to `MOD_DIGIT_SLOT_CODES` in `useWorkspaceKeybindings`).

**Tech Stack:** Vue 3, Pinia (already in app), TypeScript, existing `PhysicalShortcut` / `eventMatchesShortcut` in `@/keybindings/registry`.

---

## File structure (create / modify)

| Path | Responsibility |
|------|----------------|
| `apps/desktop/src/stores/keybindingsStore.ts` | **Create.** State: overrides map; getters: `effectiveDefinitions`, helpers for lookup/display; actions: `setOverride`, `clearOverride`, `resetAll`; persist to `localStorage` (e.g. `instrument.keybindingOverrides`) with JSON parse/validate. |
| `apps/desktop/src/keybindings/registry.ts` | **Modify.** Add `mergeKeybindingOverrides`, export types; keep `KEYBINDING_DEFINITIONS`, `eventMatchesShortcut`, `eventMatchesBinding`, `formatBindingDisplay`, `formatShortcut` unchanged semantically; optionally add `findDefinitionIn(defs, id)`. |
| `apps/desktop/src/composables/useWorkspaceKeybindings.ts` | **Modify.** Import store; replace loops over `KEYBINDING_DEFINITIONS` / `findDefinition` with store’s `effectiveDefinitions` and local `findDefinition` helper. |
| `apps/desktop/src/components/AgentCommandsSettingsDialog.vue` | **Modify.** Keyboard tab: editable cells, capture flow, conflict UI, bind Reset when on keyboard section; use store for grouped rows. |
| `apps/desktop/src/main.ts` | **Modify.** Ensure Pinia store is usable (already has `createPinia`); if store reads storage on init, no extra boot step unless you add `initKeybindingsFromStorage` for SSR/tests. |
| `apps/desktop/src/components/ThreadCreateButton.vue` | **Modify.** Replace module-level `threadCreateButtonDefaultTitle` (evaluated once at import) with a function or computed that reads the store so titles update when shortcuts change. |
| `apps/desktop/src/components/WorkspaceLauncherModal.vue` | **Modify.** Use store-backed definition for `workspaceLauncher` / `toggleThreadSidebar` hints. |
| Tests | **Create/Modify.** `keybindingsStore.test.ts`, extend or add `useWorkspaceKeybindings` tests with mocked store if needed. |

---

### Task 1: Persistence + effective definitions

**Files:**
- Create: `apps/desktop/src/stores/keybindingsStore.ts`
- Modify: `apps/desktop/src/keybindings/registry.ts`
- Modify: `apps/desktop/src/main.ts` (register store only if a separate registration step is required — usually automatic with Pinia)

- [ ] **Step 1: Add pure merge helper (TDD optional)**

In `registry.ts` (or `keybindings/merge.ts` if you prefer a tiny module):

```typescript
// Lives next to KEYBINDING_DEFINITIONS; types already defined in this module.

export type KeybindingOverride = {
  shortcut: PhysicalShortcut;
  aliases?: PhysicalShortcut[];
};

export function mergeKeybindingOverrides(
  defaults: KeybindingDefinition[],
  overrides: Partial<Record<KeybindingId, KeybindingOverride>>
): KeybindingDefinition[] {
  return defaults.map((def) => {
    const o = overrides[def.id];
    if (!o) return def;
    return {
      ...def,
      shortcut: o.shortcut,
      aliases: o.aliases ?? def.aliases
    };
  });
}
```

- [ ] **Step 2: Implement Pinia store**

- State: `overrides: Partial<Record<KeybindingId, KeybindingOverride>>`
- On init: read `localStorage`, `JSON.parse`, validate keys are `KeybindingId` and each value has `shortcut.code` string and boolean flags
- Subscribe / `watch` with `flush: "sync"` to write back (mirror `useTerminalSoundSettings`)
- Getters: `effectiveDefinitions`, `definitionById(id)`, `shortcutLabelForId(id)` wrapping `formatBindingDisplay`

- [ ] **Step 3: Unit test store**

Create `apps/desktop/src/stores/__tests__/keybindingsStore.test.ts`: round-trip storage, invalid JSON fallback, merge produces expected `effectiveDefinitions`.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/stores/keybindingsStore.ts apps/desktop/src/keybindings/registry.ts apps/desktop/src/stores/__tests__/keybindingsStore.test.ts
git commit -m "feat(keybindings): add store and merge overrides with defaults"
```

---

### Task 2: Wire global shortcut dispatch to effective definitions

**Files:**
- Modify: `apps/desktop/src/composables/useWorkspaceKeybindings.ts`

- [ ] **Step 1: Refactor `findStaticBindingId`**

Accept `definitions: KeybindingDefinition[]` and skip `switchProjectOrTerminalDigit` as today. Iterate `definitions` instead of `KEYBINDING_DEFINITIONS`.

- [ ] **Step 2: Inside `onKeydown`, read `keybindingsStore.effectiveDefinitions`**

Use `storeToRefs` or direct `store.effectiveDefinitions` inside the handler (Pinia store is reactive; for a plain handler, read `.effectiveDefinitions` each keydown so updates apply without remounting).

- [ ] **Step 3: Replace every `findDefinition("…")` with lookup against the same array**

- [ ] **Step 4: Run desktop unit tests**

Run: `npm test -- --run apps/desktop/src/composables` (or project’s equivalent; confirm from `apps/desktop/package.json`).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/composables/useWorkspaceKeybindings.ts
git commit -m "feat(keybindings): dispatch shortcuts from effective definitions"
```

---

### Task 3: Reactive labels in UI (store-backed)

**Files:**
- Modify: `apps/desktop/src/components/WorkspaceLauncherModal.vue`
- Modify: `apps/desktop/src/components/ThreadCreateButton.vue`
- Modify: any other file that calls `shortcutForId` / `findDefinition` / `titleWithShortcut` at **module scope** (grep for `titleWithShortcut` outside `setup`)

- [ ] **Step 1: Add store helpers** (if not already): e.g. `useKeybindingsStore().titleWithShortcut(label, id)` implemented via getter using `formatBindingDisplay`.

- [ ] **Step 2: ThreadCreateButton**

Remove top-level `export const threadCreateButtonDefaultTitle = titleWithShortcut(...)`. Export `function threadCreateButtonDefaultTitle(): string` **or** move default title into `<script setup>` as `computed(() => …)` and update importers.

- [ ] **Step 3: WorkspaceLauncherModal**

Replace `findDefinition` / `shortcutForId` with store-backed computed properties.

- [ ] **Step 4: Grep and fix remaining static usages**

Ensure `WorkspaceLayout.vue`, `ProjectTabs.vue`, etc. either use computed wrappers or a small composable `useKeybindingLabels()` that returns reactive `titleWithShortcut` / `shortcutForId` closures.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/ThreadCreateButton.vue apps/desktop/src/components/WorkspaceLauncherModal.vue apps/desktop/src/layouts/WorkspaceLayout.vue apps/desktop/src/components/ProjectTabs.vue apps/desktop/src/components/ThreadSidebar.vue apps/desktop/src/components/ThreadTopBar.vue apps/desktop/src/components/ThreadGroupHeader.vue apps/desktop/src/components/DiffReviewPanel.vue
git commit -m "feat(keybindings): derive shortcut labels from keybindings store"
```

---

### Task 4: Dynamic editor UI in Settings → Keyboard

**Files:**
- Modify: `apps/desktop/src/components/AgentCommandsSettingsDialog.vue`

- [ ] **Step 1: Data model for “recording”**

- `recordingForId: KeybindingId | null`
- On row button focus/click: set `recordingForId`
- Global `keydown` listener (capture) while recording: build `PhysicalShortcut` from `event` (use same rules as `eventMatchesShortcut`: `metaKey` on Mac, `ctrlKey` elsewhere; require `code` present; ignore `repeat`)

- [ ] **Step 2: Validation**

- Reject bare modifier keys
- **Conflicts:** if another action (excluding self) already uses the same `PhysicalShortcut` on primary or alias, show inline error and do not save
- **Reserved:** optionally block system-critical combos if any (YAGNI unless product requirement)

- [ ] **Step 3: Row UI**

- Per editable row: show current `formatBindingDisplay(def)`; button “Change…” or click `<kbd>` enters record mode (“Press new shortcut…”)
- Escape: cancel recording (already closes dialog — use **Stop propagation** on keyboard panel or use a dedicated capture handler that runs before the dialog escape handler when `recordingForId !== null`)
- Clear / Reset row: `store.clearOverride(id)` for that id

- [ ] **Step 4: Read-only row**

For `switchProjectOrTerminalDigit`: no Change button; keep notes explaining mod+digit 1–9 behavior.

- [ ] **Step 5: Footer Reset**

When `activeSection === 'keyboard'`, show “Reset keyboard to defaults” (ghost button) calling `store.resetAll()`.

- [ ] **Step 6: Component test (optional)**

Mount dialog, switch to Keyboard, mock store, simulate record sequence.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/components/AgentCommandsSettingsDialog.vue
git commit -m "feat(settings): editable keyboard shortcuts with capture and conflicts"
```

---

### Task 5: Verification

- [ ] **Run full desktop test suite** per `apps/desktop/package.json`.
- [ ] **Manual smoke:** change a shortcut (e.g. `toggleTerminalPanel`), save/close, confirm tooltip and key handler match; reload app and confirm persistence; confirm conflict blocked; confirm digit-row still works.

- [ ] **Commit** (if only doc/test tweaks)

---

## Scope notes (YAGNI)

- **v1:** Single primary chord per action; aliases either read-only from defaults or cleared when user sets a custom primary (document behavior in UI).
- **v1:** No export/import of keybinding JSON unless requested later.
- **v1:** Do not attempt to rebind the Electron app menu “Open Settings” IPC unless product explicitly wants parity with renderer overrides.

## References

- @superpowers:brainstorming — for follow-on UX refinements
- @superpowers:verification-before-completion — before claiming done

---

**Plan complete.** Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks (@superpowers:subagent-driven-development).
2. **Inline execution** — batch tasks here with checkpoints (@superpowers:executing-plans).

Which approach do you want?
