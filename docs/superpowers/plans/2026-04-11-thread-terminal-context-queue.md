# Thread Terminal Context Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a per-thread in-memory context queue with selection-end **Queue** popups on diff, files (editor + tree), folder rows, and terminal; full review UI; sequential PTY injection into the active thread’s agent terminal after Confirm.

**Architecture:** Central renderer composable `useThreadContextQueue` holds `Map<threadId, QueueItem[]>`; pure formatter functions build `pasteText`; a shared `ContextQueueSelectionPopup` teleports anchored to DOM rects; `injectContextQueue` sequences `workspaceApi.ptyWrite(sessionId, data)` with delays; `WorkspaceLayout.vue` owns wiring (focus `mainCenterTab = "agent"`, `shellOverlayTab = "agent"`, `agentTerminalPaneRef.focus()`).

**Tech stack:** Vue 3 (`<script setup>`), TypeScript, Vitest, CodeMirror 6 (`@codemirror/view`, merge), xterm.js, existing `window.workspaceApi` (`ptyWrite`, `ptyCreate` patterns already in `TerminalPane.vue`).

**Spec:** `docs/superpowers/specs/2026-04-11-thread-terminal-context-queue-design.md`

---

## File map (create / touch)

| Path | Role |
|------|------|
| `apps/desktop/src/contextQueue/types.ts` | `QueueItem`, `QueueCapture`, `QueueSource` |
| `apps/desktop/src/contextQueue/formatters.ts` | `formatDiffCapture`, `formatFileCapture`, `formatFolderCapture`, `formatTerminalCapture` |
| `apps/desktop/src/contextQueue/injectContextQueue.ts` | Async inject loop + delay |
| `apps/desktop/src/composables/useThreadContextQueue.ts` | Reactive state + mutations |
| `apps/desktop/src/components/contextQueue/ContextQueueSelectionPopup.vue` | Floating Queue chip |
| `apps/desktop/src/components/contextQueue/ContextQueueReviewDialog.vue` | Reorder / edit / Confirm |
| `apps/desktop/src/lib/contextQueueAnchor.ts` | `clampPopupRect`, `selectionEndCoords` helpers |
| Modify `apps/desktop/src/layouts/WorkspaceLayout.vue` | Provide queue API, review entry point, call injector |
| Modify `apps/desktop/src/components/CodeMirrorMergeDiff.vue` | Selection listener → popup |
| Modify `apps/desktop/src/components/CodeMirrorEditor.vue` (if needed) | Expose selection coords or handle internally |
| Modify `apps/desktop/src/components/FileSearchEditor.vue` | Editor + tree selection → popup |
| Modify `apps/desktop/src/components/FileTreeNode.vue` | Emit row anchor element ref or rect for selected row |
| Modify `apps/desktop/src/components/TerminalPane.vue` | xterm `onSelectionChange` → popup |
| Tests under `apps/desktop/src/contextQueue/__tests__/` and `apps/desktop/src/composables/__tests__/` | Unit coverage |

---

### Task 1: Types

**Files:**
- Create: `apps/desktop/src/contextQueue/types.ts`

- [ ] **Step 1: Add types**

```typescript
export type QueueSource = "diff" | "file" | "folder" | "terminal";

export type QueueCapture =
  | {
      source: "diff";
      filePath: string;
      selectedText: string;
      /** Optional line numbers if resolved from CM */
      lineStart?: number;
      lineEnd?: number;
    }
  | {
      source: "file";
      filePath: string;
      selectedText: string;
      lineStart?: number;
      lineEnd?: number;
    }
  | { source: "folder"; folderPath: string; listingText: string }
  | { source: "terminal"; selectedText: string; sessionLabel?: string };

export type QueueItem = {
  id: string;
  source: QueueSource;
  pasteText: string;
  /** Debug / future UI; not required for inject */
  meta: Record<string, string | number | undefined>;
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/contextQueue/types.ts
git commit -m "feat(context-queue): add queue types"
```

---

### Task 2: Formatters + tests (TDD)

**Files:**
- Create: `apps/desktop/src/contextQueue/formatters.ts`
- Create: `apps/desktop/src/contextQueue/__tests__/formatters.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from "vitest";
import { buildPasteText } from "../formatters";
import type { QueueCapture } from "../types";

describe("buildPasteText", () => {
  it("formats diff capture", () => {
    const c: QueueCapture = {
      source: "diff",
      filePath: "src/a.ts",
      selectedText: "foo",
      lineStart: 2,
      lineEnd: 3
    };
    expect(buildPasteText(c)).toContain("src/a.ts");
    expect(buildPasteText(c)).toContain("foo");
  });

  it("formats folder with listing", () => {
    const c: QueueCapture = {
      source: "folder",
      folderPath: "/p/x",
      listingText: "a\nb"
    };
    const t = buildPasteText(c);
    expect(t).toContain("/p/x");
    expect(t).toContain("a");
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

Run (from `apps/desktop`): `pnpm exec vitest run src/contextQueue/__tests__/formatters.test.ts`  
Expected: module not found or `buildPasteText` undefined.

- [ ] **Step 3: Implement `buildPasteText`**

```typescript
import type { QueueCapture } from "./types";

export function buildPasteText(c: QueueCapture): string {
  switch (c.source) {
    case "diff":
      return [
        "[diff]",
        `File: ${c.filePath}`,
        c.lineStart != null && c.lineEnd != null ? `Lines: ${c.lineStart}-${c.lineEnd}` : "",
        "```",
        c.selectedText,
        "```"
      ]
        .filter(Boolean)
        .join("\n");
    case "file":
      return [
        "[file]",
        `Path: ${c.filePath}`,
        c.lineStart != null && c.lineEnd != null ? `Lines: ${c.lineStart}-${c.lineEnd}` : "",
        "```",
        c.selectedText,
        "```"
      ]
        .filter(Boolean)
        .join("\n");
    case "folder":
      return [`[folder]`, `Path: ${c.folderPath}`, "", c.listingText].join("\n");
    case "terminal":
      return [`[terminal]`, c.sessionLabel ? `Session: ${c.sessionLabel}` : "", "```", c.selectedText, "```"]
        .filter(Boolean)
        .join("\n");
  }
}
```

- [ ] **Step 4: Run tests (expect PASS)**

`pnpm exec vitest run src/contextQueue/__tests__/formatters.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/contextQueue/formatters.ts apps/desktop/src/contextQueue/__tests__/formatters.test.ts
git commit -m "feat(context-queue): add paste text formatters"
```

---

### Task 3: `useThreadContextQueue` composable

**Files:**
- Create: `apps/desktop/src/composables/useThreadContextQueue.ts`
- Create: `apps/desktop/src/composables/__tests__/useThreadContextQueue.test.ts`

- [ ] **Step 1: Failing test for isolation + reorder**

```typescript
import { describe, expect, it } from "vitest";
import { useThreadContextQueue } from "../useThreadContextQueue";

describe("useThreadContextQueue", () => {
  it("isolates queues per thread", () => {
    const q = useThreadContextQueue();
    q.addItem("t1", { id: "1", source: "file", pasteText: "a", meta: {} });
    q.addItem("t2", { id: "2", source: "file", pasteText: "b", meta: {} });
    expect(q.itemsFor("t1").map((i) => i.pasteText)).toEqual(["a"]);
    expect(q.itemsFor("t2").map((i) => i.pasteText)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Implement composable** (use `ref` + `shallowRef` map or `reactive` record; expose `addItem`, `removeItem`, `reorder`, `updatePasteText`, `clearThread`, `itemsFor`).

Minimal implementation sketch:

```typescript
import { computed, reactive, ref } from "vue";
import type { QueueItem } from "@/contextQueue/types";

export function useThreadContextQueue() {
  const byThread = reactive<Record<string, QueueItem[]>>({});

  function itemsFor(threadId: string): QueueItem[] {
    return byThread[threadId] ?? [];
  }

  function addItem(threadId: string, item: QueueItem): void {
    if (!byThread[threadId]) byThread[threadId] = [];
    byThread[threadId].push(item);
  }

  function removeItem(threadId: string, id: string): void {
    const arr = byThread[threadId];
    if (!arr) return;
    byThread[threadId] = arr.filter((x) => x.id !== id);
  }

  function reorder(threadId: string, orderedIds: string[]): void {
    const arr = byThread[threadId];
    if (!arr) return;
    const m = new Map(arr.map((x) => [x.id, x]));
    byThread[threadId] = orderedIds.map((id) => m.get(id)).filter(Boolean) as QueueItem[];
  }

  function updatePasteText(threadId: string, id: string, pasteText: string): void {
    const row = byThread[threadId]?.find((x) => x.id === id);
    if (row) row.pasteText = pasteText;
  }

  return { itemsFor, addItem, removeItem, reorder, updatePasteText };
}
```

- [ ] **Step 3: Vitest PASS + commit**

---

### Task 4: Injector

**Files:**
- Create: `apps/desktop/src/contextQueue/injectContextQueue.ts`
- Create: `apps/desktop/src/contextQueue/__tests__/injectContextQueue.test.ts`

- [ ] **Step 1: Test doubles**

```typescript
import { describe, expect, it, vi } from "vitest";
import { injectContextQueue } from "../injectContextQueue";

it("writes in order with newline suffix", async () => {
  const ptyWrite = vi.fn().mockResolvedValue(undefined);
  await injectContextQueue({
    ptyWrite,
    sessionId: "tid",
    items: [{ id: "1", source: "file", pasteText: "a", meta: {} }],
    delayMs: 0
  });
  expect(ptyWrite).toHaveBeenCalledWith("tid", "a\r");
});
```

- [ ] **Step 2: Implement** (use `\r` to match `TerminalPane` tests / shell Enter)

```typescript
import type { QueueItem } from "./types";

export type InjectDeps = {
  sessionId: string;
  items: QueueItem[];
  ptyWrite: (sessionId: string, data: string) => Promise<void>;
  delayMs: number;
  signal?: AbortSignal;
};

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

export async function injectContextQueue(deps: InjectDeps): Promise<void> {
  for (let i = 0; i < deps.items.length; i++) {
    if (deps.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const text = deps.items[i]?.pasteText ?? "";
    if (text === "") continue;
    await deps.ptyWrite(deps.sessionId, `${text}\r`);
    if (i < deps.items.length - 1) await delay(deps.delayMs, deps.signal);
  }
}
```

- [ ] **Step 3: PASS + commit**

---

### Task 5: Selection popup component

**Files:**
- Create: `apps/desktop/src/components/contextQueue/ContextQueueSelectionPopup.vue`
- Create: `apps/desktop/src/lib/contextQueueAnchor.ts`
- Create: `apps/desktop/src/components/contextQueue/__tests__/ContextQueueSelectionPopup.test.ts` (mount with `@vue/test-utils`, assert emit `queue`)

- [ ] **Props:** `anchor: { left: number; top: number; width: number; height: number } | null`, `visible: boolean`
- [ ] **Emit:** `queue`, `dismiss`
- [ ] **Template:** `Teleport to="body"` + absolutely positioned div using `anchor` converted to `fixed` `left/top` (bottom-right of selection per spec: use `left + width`, `top + height` as popup origin with small offset)
- [ ] **Use `clampPopupRect`** from `contextQueueAnchor.ts` to keep inside `window.innerWidth/Height`

`contextQueueAnchor.ts`:

```typescript
export type Rect = { left: number; top: number; width: number; height: number };

export function clampPopupRect(anchor: Rect, popupW: number, popupH: number): { left: number; top: number } {
  const pad = 8;
  let left = anchor.left + anchor.width + pad;
  let top = anchor.top + anchor.height + pad;
  if (left + popupW > window.innerWidth - pad) left = Math.max(pad, anchor.left - popupW - pad);
  if (top + popupH > window.innerHeight - pad) top = Math.max(pad, anchor.top - popupH - pad);
  return { left, top };
}
```

- [ ] **Commit**

---

### Task 6: Review dialog

**Files:**
- Create: `apps/desktop/src/components/contextQueue/ContextQueueReviewDialog.vue`

- [ ] **Props:** `open`, `threadId`, `items: QueueItem[]`
- [ ] **Emit:** `update:open`, `confirm` (payload: ordered `QueueItem[]` after edits)
- [ ] **UI:** `Dialog` from `@/components/ui/dialog`; list with `<textarea v-model>` per row `pasteText`; delete button; drag handles optional v1 (use up/down buttons to satisfy reorder without new deps)
- [ ] **Confirm disabled** if any `pasteText.trim() === ""`
- [ ] **Test:** mount with 2 items, edit text, emit confirm payload — `ContextQueueReviewDialog.test.ts`

- [ ] **Commit**

---

### Task 7: WorkspaceLayout integration

**Files:**
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`

- [ ] Instantiate `useThreadContextQueue()` once at layout level; `provide("threadContextQueue", api)` (symbol-typed key in a small `apps/desktop/src/contextQueue/injectionKeys.ts`).

- [ ] Add **Queue** badge or toolbar control opening `ContextQueueReviewDialog` when `workspace.activeThreadId` set; bind `items` to `itemsFor(activeThreadId)`.

- [ ] On **Confirm** from dialog:
  1. Set `mainCenterTab.value = "agent"` and `shellOverlayTab.value = "agent"` (see existing patterns ~lines 836–842, 1351–1352).
  2. `await nextTick()` then `agentTerminalPaneRef.value?.focus?.()`.
  3. `sessionId = workspace.activeThreadId` (same as `TerminalPane` agent `ptyKind` — already `props.threadId` as session id for agent PTY).
  4. `await injectContextQueue({ sessionId, items: ordered, ptyWrite: (id, d) => window.workspaceApi!.ptyWrite(id, d), delayMs: 200 })` inside try/catch; on error toast and leave queue.

- [ ] **Extend `WorkspaceLayout.test.ts`** with mocked `ptyWrite` asserting sequence when Confirm pressed (shallow-mount dialog handler if easier).

- [ ] **Commit**

---

### Task 8: CodeMirror merge diff — selection popup

**Files:**
- Modify: `apps/desktop/src/components/CodeMirrorMergeDiff.vue`

- [ ] Register `EditorView.domEventHandlers` or `EditorView.updateListener` to detect `mouseup` when `state.selection.main.empty` is false; compute coords via `view.coordsAtPos(state.selection.main.to)` for anchor point (use small zero-height rect at cursor end).

- [ ] `inject("threadContextQueue")` optional — if missing, no-op. Else build `QueueCapture` from `props.filePath` + selected text; `buildPasteText`; `addItem(activeThreadId, { id: crypto.randomUUID(), ... })` — **active thread id** must come from injected workspace store or prop passed from parent (prefer **prop `activeThreadId: string | null`** from `WorkspaceLayout` to avoid hidden globals).

- [ ] Mount `ContextQueueSelectionPopup` beside editor root.

- [ ] **Commit**

---

### Task 9: FileSearchEditor — editor + tree

**Files:**
- Modify: `apps/desktop/src/components/FileSearchEditor.vue`
- Possibly modify: `apps/desktop/src/components/FileTreeNode.vue`

- [ ] Pass `activeThreadId` from `WorkspaceLayout` into `FileSearchEditor` (new prop).

- [ ] For **CodeMirrorEditor** open file buffer: same selection-end pattern as Task 8 (shared helper `useCodeMirrorQueuePopup(viewRef, getCapture)` in `apps/desktop/src/composables/useCodeMirrorQueuePopup.ts` to DRY with merge diff if practical).

- [ ] For **tree row selection** (`selectedPath`): when path changes, `nextTick` → measure `querySelector(\`[data-selected-path="${path}"]\`)`** or add `data-queue-anchor` on `FileTreeNode` row `Button` ref — show popup with **Queue** creating `file` or `folder` capture; folder listing: IPC or existing file APIs used elsewhere in `FileSearchEditor` to list directory with depth/entry caps per spec.

- [ ] **Commit**

---

### Task 10: TerminalPane — xterm selection

**Files:**
- Modify: `apps/desktop/src/components/TerminalPane.vue`

- [ ] On `terminal.onSelectionChange` with non-empty `terminal.getSelection()`, coords from `terminal.getSelectionPosition()` (xterm API) mapped to viewport + container `getBoundingClientRect` for anchor.

- [ ] Popup **Queue** builds `terminal` capture; needs `activeThreadId` prop (add to `TerminalPane` props alongside `threadId` — may be same value for agent pane).

- [ ] **Extend `TerminalPane.test.ts`** mocking selection handler wiring if feasible.

- [ ] **Commit**

---

### Task 11: Folder listing helper

**Files:**
- Create: `apps/desktop/src/contextQueue/folderListing.ts`
- Test: `apps/desktop/src/contextQueue/__tests__/folderListing.test.ts`

- [ ] Implement `async function buildFolderListingText(absPath: string, opts: { maxDepth: 2; maxEntries: 50 }): Promise<string>` using existing Electron/renderer IPC if the app already lists dirs — search for `readdir` / `listDir` in `apps/desktop/electron` and reuse the same channel for consistency.

- [ ] **Commit**

---

### Task 12: Manual QA checklist (no code)

- [ ] Diff: select lines → popup → Queue → review → Confirm → agent PTY shows blocks in order.
- [ ] File editor: same.
- [ ] Tree: select folder row → listing truncated; file row → path + empty body or “binary” note if no selection.
- [ ] Terminal: select buffer text → Queue.
- [ ] No active thread: toast / inline error, no enqueue.
- [ ] Thread A vs B queue isolation.

---

## Spec coverage (self-review)

| Spec section | Tasks |
|--------------|-------|
| Thread-scoped queue | 3, 7 |
| Sources: diff, file, folder, terminal | 2, 8, 9, 10, 11 |
| Selection popup anchor + lifecycle | 5, 8, 9, 10 + `contextQueueAnchor` |
| Full review, reorder, edit | 6 |
| Auto-focus agent + PTY inject + delay | 4, 7 |
| Ephemeral queue | 3 (no persistence code) |
| Edge: no agent, PTY error | 7 try/catch + future retry UI (add toast; optional small follow-up task) |
| Mid-run error leaves queue | 7 — wrap inject; on throw, do not `clearThread` |

**Placeholder scan:** None intentional; folder listing Task 11 requires verifying real IPC — engineer must replace stub with actual project API after `grep` / read of electron services.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-11-thread-terminal-context-queue.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. **REQUIRED SUB-SKILL:** `superpowers:subagent-driven-development`.

**2. Inline Execution** — Run tasks in this session using **superpowers:executing-plans** with checkpoints.

**Which approach?**
