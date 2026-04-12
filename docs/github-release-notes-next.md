# GitHub release notes (draft)

_Use this body when publishing a GitHub Release. Replace the title/version after your tag (for example `v0.7.0`) is cut._

## Release title (suggestion)

**Workbench v0.7.0** — thread activity, terminal bar, and keyboard settings

---

## Summary

This release improves how the desktop app tracks **active threads and PTY activity**, moves the **terminal into the bottom bar**, adds a **branch switcher** and tighter **thread filtering**, introduces a **dynamic keyboard shortcut editor** with persisted settings, and adds **bundle size metrics** plus a **gzip budget** check for the main Vite chunk. The marketing site picks up **macOS Gatekeeper** guidance assets and related copy updates. Internal design notes document thread activity notifications and bundle validation.

## Highlights

### Desktop (Workbench)

- **Terminal in the bottom bar** — workspace layout updated so the terminal lives in the bottom bar instead of the previous placement.
- **Thread & PTY behavior** — `activeThreadId` and user-typed input are wired through PTY run status; the terminal pane emits user-typed data for **echo suppression**; idle attention and input suppression respect the active thread.
- **Branch switcher & thread filters** — switch branches from the workspace UI and filter threads more accurately by thread context (follow-up bugfixes included).
- **Keyboard shortcuts** — expanded keybinding registry, workspace keybinding handling, and a **keybindings store** with tests for editable shortcut settings.
- **Build quality** — bundle metrics helper for the main Vite chunk, gzip budget verifier script, pinned initial budget, and Vitest coverage for bundle metrics and thread date grouping.

### Landing page

- **macOS first-run help** — SVG assets and page updates for Finder “Open” and **Privacy & Security** (Gatekeeper-style) flows.
- **Releases metadata** — `releases.ts` adjusted for current release messaging.

### Docs & ops

- Design / validation notes: thread activity notification, workbench bundle validation, dynamic keyboard editor settings, manual performance validation for the workbench.

### Chores

- Rename references from **Instrumental** to **Workbench** where applicable; dependency lockfile updates.

## Upgrade notes

- If you build from source, run your usual `pnpm install` and desktop build/test scripts. New script: `verify:bundle-budget` (see `apps/desktop/package.json`) validates the main chunk against the gzip budget after a production build.

## Full commit list (since `main`)

See compare view after tagging, for example:

`https://github.com/Blaise1030/workbench/compare/v0.6.0...v0.7.0`

(Replace `v0.7.0` with your actual tag.)

---

### Contributors

Thank you to everyone who contributed issues, feedback, and code toward this release.
