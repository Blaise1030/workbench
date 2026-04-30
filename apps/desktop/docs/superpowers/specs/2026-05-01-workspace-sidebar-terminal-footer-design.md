# Workspace sidebar: terminal in footer

## Goal

Move the workspace shell terminal control from the sticky top navigation into the **footer** of the left workspace sidebar (`Layout.vue`). Only the terminal control moves; feedback, settings, and theme remain in the top nav.

## Current behavior

- `Layout.vue` renders a terminal icon button in the top `<nav>` beside feedback, settings, and theme.
- Clicking it calls `openTerminalPanel()` → `router.push({ name: "terminal" })`.
- The button uses `data-testid="thread-sidebar-footer-terminal"` (historical name; lives in the header today).

## Target behavior

- Terminal control is the **sole** child of a sidebar footer region at the bottom of the thread list sidebar.
- Same navigation and accessibility as today: tooltip + icon button, same route.
- Top nav no longer includes the terminal button.

## Layout structure

- Use `SidebarFooter` from `@/components/ui/sidebar` (first usage in this app).
- Place `SidebarFooter` **after** `SidebarContent` and **before** `SidebarRail` inside `<Sidebar>`, so the parent `flex-col` layout keeps `SidebarContent` as `flex-1` + scroll and pins the footer below the scrollable area.
- `SidebarFooter` defaults to `flex flex-col`; override with `flex-row items-center justify-end` (or equivalent) so a single trailing-aligned control matches “utility in the corner.”
- Add a top border on the footer (e.g. `border-t border-sidebar-border`) so it reads as a distinct strip from the thread list.

## Visual / interaction

- Reuse the same button variant and size as today (`outline`, `icon-sm`) unless visual QA suggests a tweak for the footer context.
- Tooltip: default `side="top"`; change only if it clips or feels wrong at the bottom of the viewport.

## Collapsed / icon sidebar

- Verify when the sidebar is in collapsed/icon mode that the terminal control remains visible, tappable, and not clipped. Adjust footer or button classes only if needed.

## Testing and selectors

- Preserve `data-testid="thread-sidebar-footer-terminal"` on the moved control so existing E2E or selectors keep working unless we explicitly rename (e.g. `workspace-sidebar-footer-terminal`) and update tests in the same change.

## Out of scope

- Moving feedback, settings, or theme into the sidebar.
- Changing `ThreadSidebar.vue` footer behavior.
- Changing terminal route semantics or `AgentPage` / `TerminalPane` integration.

## Implementation surface

- **Files:** `apps/desktop/src/layouts/Layout.vue` (import `SidebarFooter`, move markup, strip terminal from nav).
- **Optional follow-up:** Rename test id + update tests for clarity (separate small change if desired).
