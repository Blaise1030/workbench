# Command Center Design

**Date:** 2026-04-12
**Status:** Approved

## Overview

Evolve the existing `workspaceLauncher` (`⌘K`) into a Command Center — a spotlight-style overlay with a search input and a row of quick-action icon buttons. The underlying fuzzy search logic (`workspaceLauncherSearch.ts`) is unchanged. The global `⌘1–9` project/workspace switching keybinding is removed entirely; workspace navigation happens exclusively through the Command Center search.

## Keybinding Changes

### Removed
- `switchProjectOrTerminalDigit` (`⌘1–9`) removed from `KEYBINDING_DEFINITIONS` in `registry.ts`
- Its `KeybindingId` removed from the union type
- `onSelectProject` digit-slot handler and `projectIds` context field removed from `useWorkspaceKeybindings.ts`

### Unchanged
- Terminal tab switching (`⌘1–9` while focus is inside an instrument terminal) — already handled separately via `isFocusInsideInstrumentTerminal`, unaffected
- All other existing global keybindings (`⌘B`, `⌘S`, `⌘J`, etc.) continue to work outside the Command Center

### Scoped to Command Center (only active when `isOpen === true`)
These are handled locally in `useCommandCenter`, not registered in the global `keybindingsStore`:

| Shortcut | Action |
|----------|--------|
| `⌘1` | Switch center tab → `agent`, close Command Center |
| `⌘2` | Switch center tab → `diff`, close Command Center |
| `⌘3` | Switch center tab → `files`, close Command Center |
| `⌘4` | Filter results to threads (`agents` section) |
| `⌘5` | Filter results to worktrees (`worktrees` section) |
| `⌘B` | Toggle thread sidebar, close Command Center |
| `⌘S` | Open settings, close Command Center |

## Quick Actions (Icon Bar)

Rendered to the right of the search input, in order:

| Position | Icon | Label | Shortcut | Behaviour |
|----------|------|-------|----------|-----------|
| 1 | Agent | Agent tab | `⌘1` | Close + switch center tab to `agent` |
| 2 | Git Diff | Git Diff | `⌘2` | Close + switch center tab to `diff` |
| 3 | Files | Files | `⌘3` | Close + switch center tab to `files` |
| 4 | Threads | Search Threads | `⌘4` | Toggle filter: restrict results to `agents` section |
| 5 | Worktrees | Search Worktrees | `⌘5` | Toggle filter: restrict results to `worktrees` section |
| 6 | Sidebar | Toggle Sidebar | `⌘B` | Close + toggle thread sidebar |
| 7 | Settings | Settings | `⌘S` | Close + open settings |

**Filter behaviour:** ⌘4 and ⌘5 keep the Command Center open and set `activeFilter`. Clicking an already-active filter icon clears it (back to all results). Filter is cleared when the Command Center closes.

**Navigate behaviour:** ⌘1–3, ⌘B, ⌘S execute their action and close the Command Center immediately.

## Architecture

### New: `useCommandCenter.ts`

A composable that owns all Command Center state and logic:

```
state:
  isOpen: Ref<boolean>
  activeFilter: Ref<'agents' | 'worktrees' | null>

exposed:
  open()
  close()
  toggle()           ← called by ⌘K global keybinding
  quickActions       ← static array: { shortcut, label, icon, handler }

internals:
  keydown listener — mounted when isOpen, matches ⌘1–5 / ⌘B / ⌘S
  close() clears activeFilter
```

### Modified: `WorkspaceLauncher` component

- Add icon bar above (or alongside) the search input, rendered from `quickActions`
- Pass `activeFilter` into the results rendering: when set, only show the matching `LauncherSectionId`
- No changes to `workspaceLauncherSearch.ts` — filtering is applied at the render/display layer

### Modified: `registry.ts`

- Remove `switchProjectOrTerminalDigit` from `KEYBINDING_DEFINITIONS`
- Remove `"switchProjectOrTerminalDigit"` from the `KeybindingId` union

### Modified: `useWorkspaceKeybindings.ts`

- Remove `projectIds: () => readonly string[]` from `WorkspaceKeybindingContext`
- Remove `onSelectProject: (projectId: string) => void` from `WorkspaceKeybindingContext`
- Remove the digit-slot handler block that calls `onSelectProject`

## Data Flow

```
⌘K pressed
  → useCommandCenter.toggle()
  → isOpen = true
  → Command Center overlay renders

User clicks ⌘4 (Search Threads)
  → activeFilter = 'agents'
  → results list hides all sections except 'agents'

User clicks ⌘4 again
  → activeFilter = null
  → all sections shown

User clicks ⌘1 (Agent tab)
  → onSelectCenterTab('agent') called on WorkspaceKeybindingContext
  → isOpen = false, activeFilter = null

⌘K pressed again (or Escape)
  → isOpen = false, activeFilter = null
```

## Out of Scope

- Customisable icon order or user-configurable quick actions
- Adding new search sections beyond what `workspaceLauncherSearch.ts` already provides
- Any changes to the terminal tab switching logic
