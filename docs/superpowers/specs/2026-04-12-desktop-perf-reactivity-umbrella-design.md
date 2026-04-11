# Desktop performance & reactivity umbrella — design

**Date:** 2026-04-12  
**Status:** Approved for implementation planning  
**Scope:** Electron desktop app (`apps/desktop`) — refactor-oriented performance work only.

## Summary

Parallel workstreams under one umbrella effort reduce context switching while controlling merge risk. Work is delivered via a **short-lived integration branch** with **frequent merges from `main`** and a **single-active-editor rule** for `WorkspaceLayout.vue` (at most one in-flight PR may heavily edit that file at a time; other tracks land in new composables/components first, then a final wire-up PR if needed).

## Goals

1. Shrink unnecessary reactive work (large layout surface, deep watchers, redundant editor watchers).
2. Bound memory for client-side diff result caching.
3. Reduce high-frequency renderer→main IPC where safe.
4. Preserve **identical user-visible behavior** and **no security regression**.

## Non-goals

- UI redesign, new features, or navigation changes.
- New preload APIs or broadened trust boundaries.
- Replacing CodeMirror or the file-search product model.

## Workstreams

### A — `WorkspaceLayout.vue` decomposition

Split cohesive regions into child components and composables (e.g. SCM/diff shell wiring, terminal/shell strip, modal/dialog orchestration, context-queue integration). The layout remains the top-level orchestrator; behavior and `provide`/`inject` contracts stay equivalent unless a mechanical move requires the same values via props (document in PR).

### B — Deep watcher reduction

Targets (initial list): `ContextQueueReviewDropdown.vue`, `ContextQueueSelectionPopup.vue`, `AgentCommandsSettingsDialog.vue`. Replace `watch(..., { deep: true })` with narrower sources: primitive/computed slices, explicit revision counters, or immutable update patterns so shallow watches suffice. **Requirement:** same reactions to user actions and store updates; no new exposure of sensitive state to templates.

### C — Editor / search watcher audit

Audit `FileSearchEditor.vue` and `CodeMirrorEditor.vue` for redundant watchers and work that can consolidate or use existing debounce/`requestAnimationFrame` patterns without dropping the **final** value (e.g. last search query, last dimensions).

### D — Bounded `diffCache`

Add explicit eviction (LRU or max entries) for the in-memory diff merge cache used from workspace layout. Keys must remain **fully qualified** (worktree + path + any scope already encoded today) so eviction only causes a **cache miss** (refetch), never cross-contamination of paths across worktrees.

### E — IPC coalescing (where justified)

Identify high-frequency paths (e.g. terminal resize, bursty file events). Coalesce only when:

- Each logical operation remains **individually validatable** with the same rules as today, or batching is a pure scheduling change with identical main-handler semantics.
- **Order** is preserved where correctness or security depends on sequential handling (e.g. terminal input stream, ordered patch application).
- No skipping of checks because messages were merged.

Document each coalesced path in the implementation plan and PR description.

## Functionality guarantees (no regressions)

- Treat all changes as **refactor-only** unless explicitly justified; same IPC channel names and payloads as seen by main/renderer today.
- Run and extend **Vitest** where files are touched; add focused tests for watcher-driven flows if coverage is thin.
- **Manual smoke** after each workstream merges to the umbrella branch: thread switch, SCM/diff open and stage, context queue review open/close, file search, terminal create/resize/kill.
- Timing changes (debounce, `rAF`, batching) must not drop **terminal** states: last resize, last search, or last queued IPC effect must still apply.

## Security guarantees

- **Preload / `contextBridge`:** no new surface; no relaxation of sandbox assumptions.
- **Main process:** batching must not bypass per-operation validation; do not combine unrelated operations into one handler if that would skip checks.
- **Caching:** eviction is performance-only; misses refetch with the same IPC and validation as today.
- **Reactivity refactors:** no `eval`, no execution of untrusted strings; no broader leakage of internal objects into templates than today.

## Execution model (umbrella)

- **Branch:** short-lived integration branch `perf/desktop-reactivity-umbrella` (rename in plan if already taken), **rebase or merge from `main` frequently** (at least daily while active).
- **Conflict control:** optional “wire-up” PR for `WorkspaceLayout.vue` after composables exist; otherwise single-owner rule for that file.
- **Merge to `main`:** when umbrella branch is green (tests + agreed smoke).

## Success criteria

- No intentional user-visible behavior change; bugs filed as regressions and fixed before umbrella merges to `main`.
- Documented list of coalesced IPC paths (or “none” if audit finds no safe wins).
- `diffCache` bounded; memory stable under large path churn in manual or scripted stress.
- Deep watchers removed or narrowed in listed files without losing reactions.

## Out of scope for this spec

Detailed file-by-file implementation steps — deferred to the implementation plan (`writing-plans`).
