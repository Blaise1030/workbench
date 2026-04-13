# Localhost Preview Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Preview panel to WorkspaceLayout that embeds a localhost URL in a native Electron `WebContentsView`.

**Architecture:** The `WebContentsView` is created and managed entirely in the Electron main process. The Vue `PreviewPanel` component holds a placeholder `<div>` whose bounds are sent to the main process via IPC so the native view is positioned to match. When the panel unmounts, the main process destroys the view.

**Tech Stack:** Electron `WebContentsView`, Vue 3 `<script setup>`, TypeScript, Vitest + `@vue/test-utils`

**Completion (2026-04-13):** Tasks 1–7 are implemented in the repo. `resolveCenterTab` in `useTerminalLayoutPersistence.ts` was updated to persist the Preview tab. Automated verification: `cd apps/desktop && npx tsc --noEmit` and `npx vitest run` (452 tests). Task 8 steps 1–7 remain a manual smoke checklist before release.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/desktop/electron/ipcChannels.ts` | Modify | Add 4 new preview channels |
| `apps/desktop/electron/preload.ts` | Modify | Inline the 4 new channel strings + expose `previewApi` via `contextBridge` |
| `apps/desktop/electron/mainApp.ts` | Modify | Create/position/destroy `WebContentsView`, handle all preview IPC |
| `apps/desktop/src/shared/ipc.ts` | Modify | Add `PreviewBounds` type |
| `apps/desktop/src/env.d.ts` | Modify | Add `PreviewApi` interface + `window.previewApi` |
| `apps/desktop/src/components/PreviewPanel.vue` | Create | URL bar + reload button + bounds-tracking placeholder div |
| `apps/desktop/src/components/__tests__/PreviewPanel.test.ts` | Create | Unit tests for PreviewPanel |
| `apps/desktop/src/layouts/WorkspaceLayout.vue` | Modify | Add "preview" tab + `<PreviewPanel>` slot |
| `apps/desktop/src/composables/useTerminalLayoutPersistence.ts` | Modify | `resolveCenterTab` accepts `preview` so saved layout restores Preview tab |

---

## Task 1: Add new IPC channels

**Files:**
- Modify: `apps/desktop/electron/ipcChannels.ts`

- [x] **Step 1: Read the file**

  Read `apps/desktop/electron/ipcChannels.ts` to see current content.

- [x] **Step 2: Add 4 new channels after `previewProbeUrl`**

  ```typescript
  previewProbeUrl: "preview:probeUrl",
  // ADD these 4 lines:
  previewReload: "preview:reload",
  previewSetBounds: "preview:setBounds",
  previewShow: "preview:show",
  previewHide: "preview:hide",
  ```

- [x] **Step 3: Verify TypeScript compiles**

  ```bash
  cd apps/desktop && npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [x] **Step 4: Commit**

  ```bash
  git add apps/desktop/electron/ipcChannels.ts
  git commit -m "feat: add preview IPC channels (reload, setBounds, show, hide)"
  ```

---

## Task 2: Wire preload — inline strings + expose `previewApi`

**Files:**
- Modify: `apps/desktop/electron/preload.ts`

> The preload runs in a sandbox and cannot import `ipcChannels.ts`. It keeps its own inline copy of channel strings. A parity test (`electron/__tests__/preloadIpcChannelsParity.test.ts`) asserts every value in `IPC_CHANNELS` appears as a string literal in `preload.ts` — so both the inline copy AND `contextBridge` calls must use the literal strings.

- [x] **Step 1: Read the file**

  Read `apps/desktop/electron/preload.ts` to see the inline `IPC_CHANNELS` object and the existing `contextBridge.exposeInMainWorld("workspaceApi", {...})` call.

- [x] **Step 2: Add the 4 new strings to the inline `IPC_CHANNELS` object**

  Locate the block that already contains:
  ```typescript
  previewSetUrl: "preview:setUrl",
  previewProbeUrl: "preview:probeUrl",
  ```
  Add immediately after:
  ```typescript
  previewReload: "preview:reload",
  previewSetBounds: "preview:setBounds",
  previewShow: "preview:show",
  previewHide: "preview:hide",
  ```

- [x] **Step 3: Add a new `contextBridge.exposeInMainWorld("previewApi", {...})` call**

  Append this block after the existing `contextBridge.exposeInMainWorld("workspaceApi", {...})` closing brace:

  ```typescript
  contextBridge.exposeInMainWorld("previewApi", {
    show: () => ipcRenderer.invoke("preview:show"),
    hide: () => ipcRenderer.invoke("preview:hide"),
    setUrl: (url: string) => ipcRenderer.invoke("preview:setUrl", url),
    probeUrl: (url: string) => ipcRenderer.invoke("preview:probeUrl", url),
    setBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke("preview:setBounds", bounds),
    reload: () => ipcRenderer.invoke("preview:reload"),
  });
  ```

- [x] **Step 4: Run the parity test**

  ```bash
  cd apps/desktop && npx vitest run electron/__tests__/preloadIpcChannelsParity.test.ts 2>&1
  ```

  Expected: `✓ match electron/ipcChannels.ts`

- [x] **Step 5: Commit**

  ```bash
  git add apps/desktop/electron/preload.ts
  git commit -m "feat: expose previewApi in preload and inline new channel strings"
  ```

---

## Task 3: Main process — `WebContentsView` lifecycle + IPC handlers

**Files:**
- Modify: `apps/desktop/electron/mainApp.ts`

- [x] **Step 1: Read `mainApp.ts`**

  Read `apps/desktop/electron/mainApp.ts` to find the imports section and the `registerIpc` function.

- [x] **Step 2: Import `WebContentsView` at the top of the file**

  Find the line that imports from `"electron"` (it currently imports `BrowserWindow`, `app`, `dialog`, `ipcMain`, etc.). Add `WebContentsView` to that import:

  ```typescript
  import { app, BrowserWindow, dialog, ipcMain, WebContentsView } from "electron";
  ```

- [x] **Step 3: Add a module-level variable to track the preview view**

  Immediately after the import block (before any function definitions), add:

  ```typescript
  let previewView: WebContentsView | null = null;
  ```

- [x] **Step 4: Add preview IPC handlers inside `registerIpc`**

  At the end of the `registerIpc` function body (before its closing `}`), add:

  ```typescript
  ipcMain.handle(IPC_CHANNELS.previewShow, (event) => {
    if (previewView) return;
    const win =
      BrowserWindow.fromWebContents(event.sender) ??
      BrowserWindow.getFocusedWindow() ??
      BrowserWindow.getAllWindows()[0];
    if (!win) return;
    previewView = new WebContentsView({
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
    });
    win.contentView.addChildView(previewView);
  });

  ipcMain.handle(IPC_CHANNELS.previewHide, () => {
    if (!previewView) return;
    for (const win of BrowserWindow.getAllWindows()) {
      try { win.contentView.removeChildView(previewView!); } catch { /* already removed */ }
    }
    previewView.webContents.close();
    previewView = null;
  });

  ipcMain.handle(IPC_CHANNELS.previewSetBounds, (_, bounds: { x: number; y: number; width: number; height: number }) => {
    if (!previewView) return;
    previewView.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    });
  });

  ipcMain.handle(IPC_CHANNELS.previewSetUrl, (_, url: string) => {
    if (!previewView) return;
    void previewView.webContents.loadURL(url);
  });

  ipcMain.handle(IPC_CHANNELS.previewProbeUrl, async (_, url: string) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, code: "invalid", message: "Not a valid URL" } as const;
    }
    try {
      const res = await fetch(parsed.href);
      return { ok: true, status: res.status } as const;
    } catch (e) {
      return { ok: false, code: "network", message: String(e) } as const;
    }
  });

  ipcMain.handle(IPC_CHANNELS.previewReload, () => {
    previewView?.webContents.reload();
  });
  ```

- [x] **Step 5: Compile-check**

  ```bash
  cd apps/desktop && npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [x] **Step 6: Commit**

  ```bash
  git add apps/desktop/electron/mainApp.ts
  git commit -m "feat: add WebContentsView lifecycle and preview IPC handlers in main process"
  ```

---

## Task 4: Add types — `PreviewBounds` in `shared/ipc.ts` and `PreviewApi` in `env.d.ts`

**Files:**
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `apps/desktop/src/env.d.ts`

- [x] **Step 1: Read `src/shared/ipc.ts`**

  Read `apps/desktop/src/shared/ipc.ts` to see where `PreviewProbeResult` is defined.

- [x] **Step 2: Add `PreviewBounds` type after `PreviewProbeResult`**

  ```typescript
  /** Pixel bounds for positioning the native preview WebContentsView. */
  export type PreviewBounds = { x: number; y: number; width: number; height: number };
  ```

- [x] **Step 3: Read `src/env.d.ts`**

  Read `apps/desktop/src/env.d.ts` to see the `WorkspaceApi` interface and the `declare global` block.

- [x] **Step 4: Add `PreviewApi` interface and `window.previewApi` before the `declare global` block**

  ```typescript
  import type { PreviewBounds, PreviewProbeResult } from "@shared/ipc";

  interface PreviewApi {
    show: () => Promise<void>;
    hide: () => Promise<void>;
    setUrl: (url: string) => Promise<void>;
    probeUrl: (url: string) => Promise<PreviewProbeResult>;
    setBounds: (bounds: PreviewBounds) => Promise<void>;
    reload: () => Promise<void>;
  }
  ```

  In the existing `declare global { interface Window { ... } }` block, add:

  ```typescript
  previewApi?: PreviewApi;
  ```

- [x] **Step 5: Compile-check**

  ```bash
  cd apps/desktop && npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [x] **Step 6: Commit**

  ```bash
  git add apps/desktop/src/shared/ipc.ts apps/desktop/src/env.d.ts
  git commit -m "feat: add PreviewBounds and PreviewApi types"
  ```

---

## Task 5: Create `PreviewPanel.vue`

**Files:**
- Create: `apps/desktop/src/components/PreviewPanel.vue`

- [x] **Step 1: Write the failing test first (see Task 6) — skip for now, come back after Task 6**

  (Tests are written in Task 6 before implementation is added. Since Vue component and tests are tightly coupled, write the component now and tests in the next task.)

- [x] **Step 2: Create `PreviewPanel.vue`**

  Create `apps/desktop/src/components/PreviewPanel.vue` with this content:

  ```vue
  <template>
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <!-- URL bar -->
      <div class="flex shrink-0 items-center gap-1 border-b border-border bg-background px-2 py-1">
        <input
          v-model="urlInput"
          data-testid="preview-url-input"
          class="min-w-0 flex-1 rounded bg-transparent px-2 py-0.5 font-mono text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-border"
          placeholder="http://localhost:3000"
          spellcheck="false"
          @keydown.enter="navigate"
        />
        <button
          data-testid="preview-reload-btn"
          class="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Reload"
          @click="reload"
        >
          <RotateCw class="h-3.5 w-3.5" />
        </button>
      </div>
      <!-- Placeholder div — native WebContentsView is positioned over this by the main process -->
      <div ref="viewportRef" data-testid="preview-viewport" class="min-h-0 flex-1" />
    </div>
  </template>

  <script setup lang="ts">
  import { onMounted, onUnmounted, ref } from "vue";
  import { RotateCw } from "lucide-vue-next";

  const urlInput = ref("http://localhost:3000");
  const viewportRef = ref<HTMLDivElement | null>(null);

  function getApi(): Window["previewApi"] {
    return window.previewApi;
  }

  /** Accept bare port ("3000") or host-only ("localhost:3000") and make it a full URL. */
  function normalizeUrl(raw: string): string {
    const s = raw.trim();
    if (/^\d+$/.test(s)) return `http://localhost:${s}`;
    if (!s.startsWith("http://") && !s.startsWith("https://")) return `http://${s}`;
    return s;
  }

  function sendBounds(): void {
    const el = viewportRef.value;
    if (!el) return;
    const r = el.getBoundingClientRect();
    void getApi()?.setBounds({
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height)
    });
  }

  function navigate(): void {
    const url = normalizeUrl(urlInput.value);
    urlInput.value = url;
    void getApi()?.setUrl(url);
  }

  function reload(): void {
    void getApi()?.reload();
  }

  let resizeObserver: ResizeObserver | null = null;

  onMounted(async () => {
    await getApi()?.show();
    sendBounds();
    resizeObserver = new ResizeObserver(sendBounds);
    if (viewportRef.value) resizeObserver.observe(viewportRef.value);
  });

  onUnmounted(() => {
    resizeObserver?.disconnect();
    void getApi()?.hide();
  });
  </script>
  ```

- [x] **Step 3: Compile-check**

  ```bash
  cd apps/desktop && npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [x] **Step 4: Commit**

  ```bash
  git add apps/desktop/src/components/PreviewPanel.vue
  git commit -m "feat: add PreviewPanel component with URL bar and WebContentsView placeholder"
  ```

---

## Task 6: Tests for `PreviewPanel.vue`

**Files:**
- Create: `apps/desktop/src/components/__tests__/PreviewPanel.test.ts`

- [x] **Step 1: Read an existing component test to understand the test setup pattern**

  Read `apps/desktop/src/components/__tests__/TerminalPane.test.ts` to see how `vi.mock`, `mount`, and `window` stubs are used.

- [x] **Step 2: Create `PreviewPanel.test.ts`**

  ```typescript
  import { mount } from "@vue/test-utils";
  import { beforeEach, describe, expect, it, vi } from "vitest";
  import PreviewPanel from "../PreviewPanel.vue";

  function makePreviewApi() {
    return {
      show: vi.fn().mockResolvedValue(undefined),
      hide: vi.fn().mockResolvedValue(undefined),
      setUrl: vi.fn().mockResolvedValue(undefined),
      probeUrl: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
      setBounds: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined)
    };
  }

  describe("PreviewPanel", () => {
    let previewApi: ReturnType<typeof makePreviewApi>;

    beforeEach(() => {
      previewApi = makePreviewApi();
      Object.defineProperty(window, "previewApi", { value: previewApi, writable: true, configurable: true });
    });

    it("renders the URL input with default localhost value", () => {
      const wrapper = mount(PreviewPanel, { attachTo: document.body });
      const input = wrapper.find('[data-testid="preview-url-input"]');
      expect(input.exists()).toBe(true);
      expect((input.element as HTMLInputElement).value).toBe("http://localhost:3000");
      wrapper.unmount();
    });

    it("calls previewApi.show on mount", async () => {
      const wrapper = mount(PreviewPanel, { attachTo: document.body });
      await wrapper.vm.$nextTick();
      expect(previewApi.show).toHaveBeenCalledOnce();
      wrapper.unmount();
    });

    it("calls previewApi.hide on unmount", async () => {
      const wrapper = mount(PreviewPanel, { attachTo: document.body });
      await wrapper.vm.$nextTick();
      wrapper.unmount();
      expect(previewApi.hide).toHaveBeenCalledOnce();
    });

    it("normalizes bare port to full URL and calls setUrl on Enter", async () => {
      const wrapper = mount(PreviewPanel, { attachTo: document.body });
      const input = wrapper.find('[data-testid="preview-url-input"]');
      await input.setValue("8080");
      await input.trigger("keydown.enter");
      expect(previewApi.setUrl).toHaveBeenCalledWith("http://localhost:8080");
      wrapper.unmount();
    });

    it("normalizes host-only input to full URL on Enter", async () => {
      const wrapper = mount(PreviewPanel, { attachTo: document.body });
      const input = wrapper.find('[data-testid="preview-url-input"]');
      await input.setValue("localhost:5173");
      await input.trigger("keydown.enter");
      expect(previewApi.setUrl).toHaveBeenCalledWith("http://localhost:5173");
      wrapper.unmount();
    });

    it("passes through a full URL unchanged on Enter", async () => {
      const wrapper = mount(PreviewPanel, { attachTo: document.body });
      const input = wrapper.find('[data-testid="preview-url-input"]');
      await input.setValue("http://localhost:4000");
      await input.trigger("keydown.enter");
      expect(previewApi.setUrl).toHaveBeenCalledWith("http://localhost:4000");
      wrapper.unmount();
    });

    it("calls previewApi.reload when reload button is clicked", async () => {
      const wrapper = mount(PreviewPanel, { attachTo: document.body });
      await wrapper.find('[data-testid="preview-reload-btn"]').trigger("click");
      expect(previewApi.reload).toHaveBeenCalledOnce();
      wrapper.unmount();
    });

    it("renders the viewport placeholder div", () => {
      const wrapper = mount(PreviewPanel, { attachTo: document.body });
      expect(wrapper.find('[data-testid="preview-viewport"]').exists()).toBe(true);
      wrapper.unmount();
    });
  });
  ```

- [x] **Step 3: Run the tests — expect them to pass**

  ```bash
  cd apps/desktop && npx vitest run src/components/__tests__/PreviewPanel.test.ts 2>&1
  ```

  Expected: all 7 tests pass.

- [x] **Step 4: Commit**

  ```bash
  git add apps/desktop/src/components/__tests__/PreviewPanel.test.ts
  git commit -m "test: add PreviewPanel unit tests"
  ```

---

## Task 7: Add Preview tab to `WorkspaceLayout.vue`

**Files:**
- Modify: `apps/desktop/src/layouts/WorkspaceLayout.vue`

- [x] **Step 1: Read `WorkspaceLayout.vue`**

  Read `apps/desktop/src/layouts/WorkspaceLayout.vue` to find:
  - The `mainCenterTab` ref declaration (line ~145)
  - The `topCenterPanelTabs` computed (adds "agent", "diff", "files")
  - The `topCenterTabModel` computed setter (the `if/else` chain)
  - The template section with `v-show="mainCenterTab === 'agent'"` etc.
  - The component imports at the top of the `<script setup>`

- [x] **Step 2: Add `PreviewPanel` import**

  In the `<script setup>` imports block, after the last component import, add:

  ```typescript
  import PreviewPanel from "@/components/PreviewPanel.vue";
  ```

- [x] **Step 3: Add "preview" to `mainCenterTab` type**

  Find:
  ```typescript
  const mainCenterTab = ref<"agent" | "diff" | "files">("agent");
  ```
  Change to:
  ```typescript
  const mainCenterTab = ref<"agent" | "diff" | "files" | "preview">("agent");
  ```

- [x] **Step 4: Add "preview" tab to `topCenterPanelTabs`**

  Find the `topCenterPanelTabs` computed. After the `files` push, add:

  ```typescript
  tabs.push({ value: "preview", label: "🌐 Preview" });
  ```

- [x] **Step 5: Update `topCenterTabModel` setter to handle "preview"**

  Find the computed setter:
  ```typescript
  set: (v: string) => {
    if (v === "diff") mainCenterTab.value = "diff";
    else if (v === "files") mainCenterTab.value = "files";
    else mainCenterTab.value = "agent";
  }
  ```
  Change to:
  ```typescript
  set: (v: string) => {
    if (v === "diff") mainCenterTab.value = "diff";
    else if (v === "files") mainCenterTab.value = "files";
    else if (v === "preview") mainCenterTab.value = "preview";
    else mainCenterTab.value = "agent";
  }
  ```

- [x] **Step 6: Add `<PreviewPanel>` to the template**

  Find the template block that contains the `v-show` panels for "agent", "diff", and "files". It looks like:
  ```html
  <div v-show="mainCenterTab === 'agent'" class="flex min-h-0 flex-1 flex-col overflow-hidden">
    ...
  </div>
  <div v-show="mainCenterTab === 'diff'" ...>
  ```

  After the last panel `</div>`, add:
  ```html
  <div v-show="mainCenterTab === 'preview'" class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <PreviewPanel v-if="mainCenterTab === 'preview'" />
  </div>
  ```

  > Using `v-if` inside `v-show` ensures the component mounts (triggering `onMounted` → `previewApi.show`) only when the tab is first activated, and unmounts (triggering `onUnmounted` → `previewApi.hide`) when switched away.

- [x] **Step 7: Compile-check**

  ```bash
  cd apps/desktop && npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [x] **Step 8: Run existing WorkspaceLayout tests**

  ```bash
  cd apps/desktop && npx vitest run src/layouts/__tests__/WorkspaceLayout.test.ts 2>&1
  ```

  Expected: all existing tests pass.

- [x] **Step 9: Commit**

  ```bash
  git add apps/desktop/src/layouts/WorkspaceLayout.vue
  git commit -m "feat: add Preview tab and PreviewPanel to WorkspaceLayout"
  ```

---

## Task 8: Manual smoke test

- [ ] **Step 1: Start the app in dev mode**

  ```bash
  cd /path/to/instrument && pnpm dev:electron
  ```

- [ ] **Step 2: Open a project in Workbench**

- [ ] **Step 3: Click the "🌐 Preview" tab in the center toolbar**

  Expected: Preview panel appears with a URL bar and reload button.

- [ ] **Step 4: Start a local dev server in a separate terminal**

  ```bash
  # e.g. any project
  npx serve . -p 3000
  ```

- [ ] **Step 5: Type `3000` in the URL bar and press Enter**

  Expected:
  - URL bar updates to `http://localhost:3000`
  - The native WebContentsView renders the localhost site in the panel

- [ ] **Step 6: Click the reload button**

  Expected: page reloads.

- [ ] **Step 7: Switch to the Agent tab and back to Preview**

  Expected: the WebContentsView disappears when leaving Preview, reappears when returning.

- [x] **Step 8: Run the full test suite**

  ```bash
  cd apps/desktop && npx vitest run 2>&1 | tail -20
  ```

  Expected: no regressions.
