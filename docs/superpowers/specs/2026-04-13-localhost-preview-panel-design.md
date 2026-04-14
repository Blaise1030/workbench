# Localhost Preview Panel — Design Spec

**Date:** 2026-04-13  
**Status:** Approved  
**Scope:** Phase 1 of in-app preview — embed a localhost URL in a WebContentsView panel

---

## Context

Workbench is a native Electron desktop app for running AI coding agents across multiple projects. The vision is a full product engineering environment: idea → data → spec → code → iterate.

The immediate competitive move is closing the "last mile" gap that tools like Linear's upcoming coding agent leave open: you can generate code, but you can't see it running without switching to a browser. This panel keeps the iteration loop inside Workbench.

---

## Goal

Add a Preview panel to the workspace layout that renders a user-specified localhost URL inside an Electron `WebContentsView`. The user runs their own dev server; Workbench shows it in-app.

---

## Scope

**In scope:**
- A Preview panel in the workspace layout
- A URL/port input field (e.g. `http://localhost:3000`)
- `WebContentsView` renders the localhost URL
- Refresh/reload button
- Basic navigation (back, forward, reload)

**Out of scope (future phases):**
- Auto-detection of running dev server port
- Screenshot capture for AI context
- Viewport/device switching (mobile/desktop)
- External URL support (ngrok, Vercel preview URLs)
- CI/CD integration

---

## Architecture

Workbench is an Electron app. The preview panel uses Electron's `WebContentsView` (preferred over `BrowserView` which is deprecated) embedded within the main `BrowserWindow`.

```
WorkspaceLayout
  └── PreviewPanel (Vue component)
        ├── URLBar (port/URL input + reload button)
        └── WebContentsView (Electron, renders localhost)
```

The `WebContentsView` is a native Electron construct — it must be created and managed in the **main process**, with IPC messages coordinating with the renderer (Vue) for URL changes, reload triggers, and panel visibility.

### IPC Contract

| Channel | Direction | Payload | Purpose |
|---|---|---|---|
| `preview:navigate` | Renderer → Main | `{ url: string }` | Load a new URL |
| `preview:reload` | Renderer → Main | — | Trigger reload |
| `preview:back` | Renderer → Main | — | Navigate back |
| `preview:forward` | Renderer → Main | — | Navigate forward |
| `preview:bounds` | Renderer → Main | `{ x, y, width, height }` | Reposition/resize the view |

### Main process responsibilities
- Create `WebContentsView` when preview panel is opened
- Attach it to the main `BrowserWindow`
- Listen to IPC channels above
- Destroy/hide the view when the panel is closed
- Handle `did-navigate` to sync URL bar state back to renderer

---

## UI

The Preview panel sits alongside the existing terminal/editor panels in the workspace layout. It is a toggleable panel — users can open/close it via the command center or a keyboard shortcut.

```
┌─────────────────────────────────────────────┐
│  ← →  [ http://localhost:3000        ] [⟳]  │  ← URLBar
├─────────────────────────────────────────────┤
│                                             │
│           WebContentsView                   │
│         (localhost renders here)            │
│                                             │
└─────────────────────────────────────────────┘
```

- URL bar accepts full URLs or bare port numbers (`3000` → `http://localhost:3000`)
- Reload button triggers `preview:reload`
- Back/forward buttons shown but disabled when unavailable

---

## Error Handling

- If the localhost URL is unreachable (dev server not running), show an inline error state inside the panel: *"Nothing running at this address. Start your dev server and reload."*
- No crash or modal — the panel degrades gracefully.

---

## Testing

- Manual: run a local dev server, open the panel, verify it renders
- Verify reload, back, forward controls work
- Verify panel can be toggled open/closed without crashing
- Verify the `WebContentsView` is destroyed cleanly on close (no memory leak)

---

## Future Phases

1. **Screenshot for AI context** — agent takes a screenshot of the preview, reasons about visual state, proposes fixes
2. **Auto-detect dev server port** — scan common ports (3000, 5173, 8080) and pre-fill the URL bar
3. **Viewport switching** — mobile/desktop/tablet simulation
4. **Data integrations** — PostHog, Sentry surface insights alongside the preview
