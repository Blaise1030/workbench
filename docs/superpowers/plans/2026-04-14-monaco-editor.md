# Monaco Editor Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CodeMirror 6 + diff2html with Monaco Editor for accurate git diffs and full read/write file editing.

**Architecture:** `MonacoEditor.vue` replaces `CodeMirrorEditor.vue` in the Files tab with a drop-in v-model interface; `MonacoDiffEditor.vue` replaces `CodeMirrorMergeDiff.vue` in the Git tab using Monaco's built-in diff engine. Both share one Monaco environment; theme syncs via a MutationObserver on `<html>`.

**Tech Stack:** `monaco-editor`, `vite-plugin-monaco-editor`, Vue 3, Electron, Vitest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/desktop/src/lib/monacoLanguage.ts` | File extension → Monaco language ID |
| Create | `apps/desktop/src/components/MonacoEditor.vue` | Read/write code editor (replaces CodeMirrorEditor) |
| Create | `apps/desktop/src/components/MonacoDiffEditor.vue` | Inline/split diff viewer (replaces CodeMirrorMergeDiff) |
| Create | `apps/desktop/src/components/__tests__/MonacoEditor.test.ts` | Unit tests for MonacoEditor |
| Create | `apps/desktop/src/components/__tests__/MonacoDiffEditor.test.ts` | Unit tests for MonacoDiffEditor |
| Modify | `apps/desktop/vite.config.ts` | Add monaco worker plugin |
| Modify | `apps/desktop/package.json` | Add monaco-editor + vite-plugin-monaco-editor; remove CodeMirror |
| Modify | `apps/desktop/src/components/FileSearchEditor.vue` | Swap CodeMirrorEditor → MonacoEditor |
| Modify | `apps/desktop/src/components/SourceControlPanel.vue` | Swap CodeMirrorMergeDiff → MonacoDiffEditor |
| Modify | `apps/desktop/src/components/__tests__/FileSearchEditor.test.ts` | Update mock from CodeMirrorEditor → MonacoEditor |
| Delete | `apps/desktop/src/components/CodeMirrorEditor.vue` | Replaced by MonacoEditor |
| Delete | `apps/desktop/src/components/CodeMirrorMergeDiff.vue` | Replaced by MonacoDiffEditor |
| Delete | `apps/desktop/src/lib/codemirrorLanguageExtensions.ts` | Replaced by monacoLanguage.ts |
| Delete | `apps/desktop/src/lib/codemirrorThemes.ts` | No longer needed |
| Delete | `apps/desktop/src/lib/codemirrorMarkdownImagePreview.ts` | No longer needed |

---

## Task 1: Install Monaco packages and configure Vite worker plugin

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/vite.config.ts`

- [ ] **Step 1: Add monaco-editor and vite-plugin-monaco-editor to package.json**

Open `apps/desktop/package.json`. In the `"dependencies"` section add:
```json
"monaco-editor": "^0.52.2"
```
In the `"devDependencies"` section add:
```json
"vite-plugin-monaco-editor": "^1.1.0"
```

- [ ] **Step 2: Install packages**

```bash
cd apps/desktop && pnpm install
```

Expected: packages install without errors; `node_modules/monaco-editor` exists.

- [ ] **Step 3: Add Monaco worker plugin to vite.config.ts**

The current `vite.config.ts` uses an async config function. Insert the Monaco plugin after `vue()`. The full updated plugin array inside the returned config object:

```ts
// Add at top of file, alongside the existing `import tailwindcss` line:
// Note: dynamic import used because the config is already async
```

Replace the `plugins: [` array inside the return value of the async function:

```ts
plugins: [
  tailwindcss(),
  vue(),
  await import("vite-plugin-monaco-editor").then(
    (m) => (m.default ?? m)({
      languageWorkers: ["editorWorkerService", "typescript", "json", "css", "html"]
    }) as PluginOption
  ),
  ...(analyze ? [...visualizerPlugins] : [])
],
```

> Note: the existing `visualizer` plugins are currently inlined in the `analyze` spread — keep them as-is, just ensure the monaco plugin is added before the analyze spread.

- [ ] **Step 4: Verify the dev build starts without worker errors**

```bash
cd apps/desktop && pnpm run build 2>&1 | tail -20
```

Expected: build completes. You will see Monaco worker chunks like `editor.worker-*.js` in `dist-electron/dist/assets/`.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/package.json apps/desktop/vite.config.ts pnpm-lock.yaml
git commit -m "chore(desktop): add monaco-editor and vite-plugin-monaco-editor"
```

---

## Task 2: Create monacoLanguage.ts utility

**Files:**
- Create: `apps/desktop/src/lib/monacoLanguage.ts`
- Create: `apps/desktop/src/lib/__tests__/monacoLanguage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/lib/__tests__/monacoLanguage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { monacoLanguageIdFromPath } from "../monacoLanguage";

describe("monacoLanguageIdFromPath", () => {
  it("returns typescript for .ts files", () => {
    expect(monacoLanguageIdFromPath("src/foo.ts")).toBe("typescript");
  });
  it("returns typescript for .tsx files", () => {
    expect(monacoLanguageIdFromPath("src/App.tsx")).toBe("typescript");
  });
  it("returns javascript for .js files", () => {
    expect(monacoLanguageIdFromPath("src/foo.js")).toBe("javascript");
  });
  it("returns html for .vue files", () => {
    expect(monacoLanguageIdFromPath("src/Foo.vue")).toBe("html");
  });
  it("returns json for .json files", () => {
    expect(monacoLanguageIdFromPath("package.json")).toBe("json");
  });
  it("returns markdown for .md files", () => {
    expect(monacoLanguageIdFromPath("README.md")).toBe("markdown");
  });
  it("returns css for .css files", () => {
    expect(monacoLanguageIdFromPath("styles.css")).toBe("css");
  });
  it("returns scss for .scss files", () => {
    expect(monacoLanguageIdFromPath("styles.scss")).toBe("scss");
  });
  it("returns python for .py files", () => {
    expect(monacoLanguageIdFromPath("script.py")).toBe("python");
  });
  it("returns rust for .rs files", () => {
    expect(monacoLanguageIdFromPath("main.rs")).toBe("rust");
  });
  it("returns go for .go files", () => {
    expect(monacoLanguageIdFromPath("main.go")).toBe("go");
  });
  it("returns plaintext for unknown extensions", () => {
    expect(monacoLanguageIdFromPath("Makefile")).toBe("plaintext");
    expect(monacoLanguageIdFromPath("file.xyz")).toBe("plaintext");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/desktop && pnpm run test -- src/lib/__tests__/monacoLanguage.test.ts
```

Expected: FAIL — `Cannot find module '../monacoLanguage'`

- [ ] **Step 3: Create monacoLanguage.ts**

Create `apps/desktop/src/lib/monacoLanguage.ts`:

```ts
/** Map a file path to a Monaco editor language ID. */
export function monacoLanguageIdFromPath(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return "plaintext";
  const ext = path.slice(dot + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    vue: "html",
    json: "json",
    jsonc: "json",
    md: "markdown",
    markdown: "markdown",
    css: "css",
    scss: "scss",
    sass: "scss",
    less: "less",
    html: "html",
    htm: "html",
    xml: "xml",
    yml: "yaml",
    yaml: "yaml",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    hpp: "cpp",
    cs: "csharp",
    rb: "ruby",
    php: "php",
    sql: "sql",
    graphql: "graphql",
    toml: "ini"
  };
  return map[ext] ?? "plaintext";
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/desktop && pnpm run test -- src/lib/__tests__/monacoLanguage.test.ts
```

Expected: all 13 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/monacoLanguage.ts apps/desktop/src/lib/__tests__/monacoLanguage.test.ts
git commit -m "feat(desktop): add monacoLanguageIdFromPath utility"
```

---

## Task 3: Create MonacoEditor.vue with tests

**Files:**
- Create: `apps/desktop/src/components/MonacoEditor.vue`
- Create: `apps/desktop/src/components/__tests__/MonacoEditor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/components/__tests__/MonacoEditor.test.ts`:

```ts
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MonacoEditor from "../MonacoEditor.vue";

// ── Monaco mock ──────────────────────────────────────────────────────────────
const mockModel = {
  dispose: vi.fn(),
};

const mockEditor = {
  getValue: vi.fn(() => "initial"),
  setValue: vi.fn(),
  dispose: vi.fn(),
  onDidChangeModelContent: vi.fn((cb) => {
    mockEditor._contentListener = cb;
    return { dispose: vi.fn() };
  }),
  onDidChangeCursorSelection: vi.fn(() => ({ dispose: vi.fn() })),
  getModel: vi.fn(() => mockModel),
  getDomNode: vi.fn(() => document.createElement("div")),
  getScrolledVisiblePosition: vi.fn(() => ({ left: 0, top: 0, height: 14 })),
  updateOptions: vi.fn(),
  trigger: vi.fn(),
  _contentListener: null as ((e: unknown) => void) | null,
};

vi.mock("monaco-editor", () => ({
  editor: {
    create: vi.fn(() => mockEditor),
    setTheme: vi.fn(),
    setModelLanguage: vi.fn(),
  },
}));
// ─────────────────────────────────────────────────────────────────────────────

describe("MonacoEditor", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a host div with data-testid=file-editor", () => {
    const wrapper = mount(MonacoEditor, {
      props: { modelValue: "hello", language: "typescript" },
    });
    expect(wrapper.find('[data-testid="file-editor"]').exists()).toBe(true);
  });

  it("sets data-language from the language prop", () => {
    const wrapper = mount(MonacoEditor, {
      props: { modelValue: "", language: "typescript" },
    });
    expect(wrapper.find('[data-testid="file-editor"]').attributes("data-language")).toBe("typescript");
  });

  it("emits update:modelValue when editor content changes", async () => {
    const { editor } = await import("monaco-editor");
    const wrapper = mount(MonacoEditor, {
      props: { modelValue: "hello" },
    });
    // Simulate editor content change
    mockEditor.getValue.mockReturnValue("world");
    mockEditor._contentListener?.({});
    await flushPromises();
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["world"]);
    (editor as { create: ReturnType<typeof vi.fn> }).create;
  });

  it("calls setValue when modelValue prop changes externally", async () => {
    const wrapper = mount(MonacoEditor, {
      props: { modelValue: "hello" },
    });
    mockEditor.getValue.mockReturnValue("hello"); // matches, no setValue
    await wrapper.setProps({ modelValue: "hello" });
    expect(mockEditor.setValue).not.toHaveBeenCalled();

    mockEditor.getValue.mockReturnValue("hello"); // current value
    await wrapper.setProps({ modelValue: "world" });
    expect(mockEditor.setValue).toHaveBeenCalledWith("world");
  });

  it("exposes openFind which calls editor.trigger", () => {
    const wrapper = mount(MonacoEditor, {
      props: { modelValue: "" },
    });
    (wrapper.vm as { openFind: () => void }).openFind();
    expect(mockEditor.trigger).toHaveBeenCalledWith("keyboard", "actions.find", null);
  });

  it("calls editor.dispose on unmount", () => {
    const wrapper = mount(MonacoEditor, {
      props: { modelValue: "" },
    });
    wrapper.unmount();
    expect(mockEditor.dispose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/desktop && pnpm run test -- src/components/__tests__/MonacoEditor.test.ts
```

Expected: FAIL — `Cannot find module '../MonacoEditor.vue'`

- [ ] **Step 3: Create MonacoEditor.vue**

Create `apps/desktop/src/components/MonacoEditor.vue`:

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as monaco from "monaco-editor";

export type QueueableEditorSelection = {
  selectedText: string;
  lineStart: number;
  lineEnd: number;
  anchor: { left: number; top: number; width: number; height: number };
};

const props = withDefaults(
  defineProps<{
    modelValue: string;
    language?: string;
    ariaLabel?: string;
    showLineNumbers?: boolean;
    /** Unused in Monaco — kept for API compatibility with the previous CodeMirrorEditor interface. */
    markdownWorkspaceRoot?: string | null;
    markdownFilePath?: string | null;
    markdownImagePreviewEnabled?: boolean;
    queueSelectionHints?: boolean;
  }>(),
  { showLineNumbers: true }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "queueable-text-selection": [selection: QueueableEditorSelection | null];
}>();

const hostRef = ref<HTMLDivElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let suppressChange = false;
let colorObserver: MutationObserver | null = null;

function resolveTheme(): string {
  return document.documentElement.classList.contains("dark") ? "vs-dark" : "vs";
}

onMounted(() => {
  const el = hostRef.value;
  if (!el) return;

  monaco.editor.setTheme(resolveTheme());

  editor = monaco.editor.create(el, {
    value: props.modelValue,
    language: props.language ?? "plaintext",
    lineNumbers: props.showLineNumbers === false ? "off" : "on",
    fontSize: 12,
    fontFamily: "var(--font-app-mono)",
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: "off",
    automaticLayout: true,
    fixedOverflowWidgets: true,
    ariaLabel: props.ariaLabel,
  });

  editor.onDidChangeModelContent(() => {
    if (suppressChange) return;
    emit("update:modelValue", editor!.getValue());
  });

  if (props.queueSelectionHints) {
    editor.onDidChangeCursorSelection((e) => {
      const model = editor!.getModel();
      if (!model || e.selection.isEmpty()) {
        emit("queueable-text-selection", null);
        return;
      }
      const text = model.getValueInRange(e.selection);
      if (!text.trim()) {
        emit("queueable-text-selection", null);
        return;
      }
      const domNode = editor!.getDomNode();
      const coords = editor!.getScrolledVisiblePosition({
        lineNumber: e.selection.endLineNumber,
        column: e.selection.endColumn
      });
      if (!coords || !domNode) {
        emit("queueable-text-selection", null);
        return;
      }
      const rect = domNode.getBoundingClientRect();
      emit("queueable-text-selection", {
        selectedText: text,
        lineStart: e.selection.startLineNumber,
        lineEnd: e.selection.endLineNumber,
        anchor: {
          left: rect.left + coords.left,
          top: rect.top + coords.top,
          width: 2,
          height: coords.height
        }
      });
    });
  }

  colorObserver = new MutationObserver(() => {
    monaco.editor.setTheme(resolveTheme());
  });
  colorObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"]
  });
});

onBeforeUnmount(() => {
  colorObserver?.disconnect();
  colorObserver = null;
  editor?.dispose();
  editor = null;
});

watch(
  () => props.modelValue,
  (next) => {
    if (!editor) return;
    if (editor.getValue() === next) return;
    suppressChange = true;
    editor.setValue(next);
    suppressChange = false;
  }
);

watch(
  () => props.language,
  (next) => {
    const model = editor?.getModel();
    if (!model) return;
    monaco.editor.setModelLanguage(model, next ?? "plaintext");
  }
);

watch(
  () => props.showLineNumbers,
  (next) => {
    editor?.updateOptions({ lineNumbers: next === false ? "off" : "on" });
  }
);

function openFind(): void {
  editor?.trigger("keyboard", "actions.find", null);
}

defineExpose({ openFind });
</script>

<template>
  <div
    ref="hostRef"
    data-testid="file-editor"
    class="flex min-h-0 w-full flex-1 overflow-hidden"
    :data-language="language"
    :data-line-numbers="showLineNumbers === false ? 'hidden' : 'visible'"
  />
</template>
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/desktop && pnpm run test -- src/components/__tests__/MonacoEditor.test.ts
```

Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/MonacoEditor.vue apps/desktop/src/components/__tests__/MonacoEditor.test.ts
git commit -m "feat(desktop): add MonacoEditor component"
```

---

## Task 4: Wire MonacoEditor into FileSearchEditor and update its test mock

**Files:**
- Modify: `apps/desktop/src/components/FileSearchEditor.vue`
- Modify: `apps/desktop/src/components/__tests__/FileSearchEditor.test.ts`

- [ ] **Step 1: Update the import in FileSearchEditor.vue**

In `apps/desktop/src/components/FileSearchEditor.vue`, find the line:

```ts
import CodeMirrorEditor, { type QueueableEditorSelection } from "@/components/CodeMirrorEditor.vue";
```

Replace it with:

```ts
import MonacoEditor, { type QueueableEditorSelection } from "@/components/MonacoEditor.vue";
```

- [ ] **Step 2: Update the component reference in FileSearchEditor.vue template**

In the `<template>` section of `FileSearchEditor.vue`, find every occurrence of `<CodeMirrorEditor` and replace with `<MonacoEditor`. Find every occurrence of `</CodeMirrorEditor>` and replace with `</MonacoEditor>`. (There is typically one usage; confirm with a search.)

Also find the `ref="codeMirrorRef"` attribute (used for `openFind` expose) — it can stay as-is or be renamed `ref="editorRef"` if you prefer, but ensure the `codeMirrorRef.value?.openFind()` call in `openFindInFile()` matches the ref name used.

- [ ] **Step 3: Update the mock in FileSearchEditor.test.ts**

In `apps/desktop/src/components/__tests__/FileSearchEditor.test.ts`, find:

```ts
vi.mock("@/components/CodeMirrorEditor.vue", () => ({
```

Replace with:

```ts
vi.mock("@/components/MonacoEditor.vue", () => ({
```

The rest of the mock body stays identical — it mocks a textarea with the same props and emits.

- [ ] **Step 4: Run the existing FileSearchEditor tests**

```bash
cd apps/desktop && pnpm run test -- src/components/__tests__/FileSearchEditor.test.ts
```

Expected: all existing tests PASS (no regressions)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/FileSearchEditor.vue apps/desktop/src/components/__tests__/FileSearchEditor.test.ts
git commit -m "feat(desktop): swap CodeMirrorEditor → MonacoEditor in FileSearchEditor"
```

---

## Task 5: Create MonacoDiffEditor.vue with tests

**Files:**
- Create: `apps/desktop/src/components/MonacoDiffEditor.vue`
- Create: `apps/desktop/src/components/__tests__/MonacoDiffEditor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/components/__tests__/MonacoDiffEditor.test.ts`:

```ts
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MonacoDiffEditor from "../MonacoDiffEditor.vue";

// ── Monaco mock ──────────────────────────────────────────────────────────────
const mockOrigModel = { dispose: vi.fn() };
const mockModModel = { dispose: vi.fn(), getValueInRange: vi.fn(() => "") };

const mockOrigEditor = {
  getModel: vi.fn(() => mockOrigModel),
};

const mockModEditor = {
  getModel: vi.fn(() => mockModModel),
  getDomNode: vi.fn(() => document.createElement("div")),
  getScrolledVisiblePosition: vi.fn(() => ({ left: 0, top: 0, height: 14 })),
  onDidChangeCursorSelection: vi.fn(() => ({ dispose: vi.fn() })),
};

const mockDiffEditor = {
  getOriginalEditor: vi.fn(() => mockOrigEditor),
  getModifiedEditor: vi.fn(() => mockModEditor),
  setModel: vi.fn(),
  updateOptions: vi.fn(),
  dispose: vi.fn(),
};

vi.mock("monaco-editor", () => ({
  editor: {
    createDiffEditor: vi.fn(() => mockDiffEditor),
    createModel: vi.fn((value: string) => ({ value, dispose: vi.fn() })),
    setTheme: vi.fn(),
  },
}));

vi.mock("@/components/contextQueue/ContextQueueSelectionPopup.vue", () => ({
  default: { template: "<div />" },
}));
// ─────────────────────────────────────────────────────────────────────────────

describe("MonacoDiffEditor", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a host div", () => {
    const wrapper = mount(MonacoDiffEditor, {
      props: { original: "a", modified: "b", filePath: "src/foo.ts" },
    });
    expect(wrapper.find(".monaco-diff-host").exists()).toBe(true);
  });

  it("calls createDiffEditor on mount", async () => {
    const { editor } = await import("monaco-editor");
    mount(MonacoDiffEditor, {
      props: { original: "a", modified: "b", filePath: "src/foo.ts" },
    });
    expect(editor.createDiffEditor).toHaveBeenCalled();
  });

  it("calls setModel with original and modified content", async () => {
    const { editor } = await import("monaco-editor");
    mount(MonacoDiffEditor, {
      props: { original: "original content", modified: "modified content", filePath: "src/foo.ts" },
    });
    expect(editor.createModel).toHaveBeenCalledWith("original content", expect.any(String));
    expect(editor.createModel).toHaveBeenCalledWith("modified content", expect.any(String));
    expect(mockDiffEditor.setModel).toHaveBeenCalled();
  });

  it("sets renderSideBySide:true for split layout", async () => {
    const { editor } = await import("monaco-editor");
    mount(MonacoDiffEditor, {
      props: { original: "a", modified: "b", filePath: "src/foo.ts", layout: "split" },
    });
    expect(editor.createDiffEditor).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ renderSideBySide: true })
    );
  });

  it("sets renderSideBySide:false for unified layout", async () => {
    const { editor } = await import("monaco-editor");
    mount(MonacoDiffEditor, {
      props: { original: "a", modified: "b", filePath: "src/foo.ts", layout: "unified" },
    });
    expect(editor.createDiffEditor).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ renderSideBySide: false })
    );
  });

  it("calls updateOptions when layout prop changes", async () => {
    const wrapper = mount(MonacoDiffEditor, {
      props: { original: "a", modified: "b", filePath: "src/foo.ts", layout: "split" },
    });
    await wrapper.setProps({ layout: "unified" });
    expect(mockDiffEditor.updateOptions).toHaveBeenCalledWith({ renderSideBySide: false });
  });

  it("disposes the diff editor on unmount", () => {
    const wrapper = mount(MonacoDiffEditor, {
      props: { original: "a", modified: "b", filePath: "src/foo.ts" },
    });
    wrapper.unmount();
    expect(mockDiffEditor.dispose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/desktop && pnpm run test -- src/components/__tests__/MonacoDiffEditor.test.ts
```

Expected: FAIL — `Cannot find module '../MonacoDiffEditor.vue'`

- [ ] **Step 3: Create MonacoDiffEditor.vue**

Create `apps/desktop/src/components/MonacoDiffEditor.vue`:

```vue
<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as monaco from "monaco-editor";
import { monacoLanguageIdFromPath } from "@/lib/monacoLanguage";
import ContextQueueSelectionPopup from "@/components/contextQueue/ContextQueueSelectionPopup.vue";
import { buildPasteText } from "@/contextQueue/formatters";
import { injectContextToAgentKey, threadContextQueueKey } from "@/contextQueue/injectionKeys";
import type { QueueCapture, QueueItem } from "@/contextQueue/types";
import type { Rect } from "@/lib/contextQueueAnchor";
import { useToast } from "@/composables/useToast";

type ScmDiffLayout = "split" | "unified";

const props = withDefaults(
  defineProps<{
    original: string;
    modified: string;
    filePath: string;
    layout?: ScmDiffLayout;
    activeThreadId?: string | null;
  }>(),
  { layout: "split", activeThreadId: null }
);

const hostRef = ref<HTMLDivElement | null>(null);
const selectionPopupVisible = ref(false);
const selectionPopupAnchor = ref<Rect | null>(null);
const pendingSelection = ref<{ text: string; lineStart: number; lineEnd: number } | null>(null);

const threadQueue = inject(threadContextQueueKey, undefined);
const injectContextToAgent = inject(injectContextToAgentKey, undefined);
const toast = useToast();

let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null;
let colorObserver: MutationObserver | null = null;

function resolveTheme(): string {
  return document.documentElement.classList.contains("dark") ? "vs-dark" : "vs";
}

function createModels(): void {
  if (!diffEditor) return;
  const lang = monacoLanguageIdFromPath(props.filePath);
  const originalModel = monaco.editor.createModel(props.original, lang);
  const modifiedModel = monaco.editor.createModel(props.modified, lang);
  const prevOrig = diffEditor.getOriginalEditor().getModel();
  const prevMod = diffEditor.getModifiedEditor().getModel();
  diffEditor.setModel({ original: originalModel, modified: modifiedModel });
  prevOrig?.dispose();
  prevMod?.dispose();
}

function attachSelectionListener(): void {
  const modEditor = diffEditor?.getModifiedEditor();
  if (!modEditor || !threadQueue) return;
  modEditor.onDidChangeCursorSelection((e) => {
    if (e.selection.isEmpty()) {
      selectionPopupVisible.value = false;
      pendingSelection.value = null;
      return;
    }
    const model = modEditor.getModel();
    if (!model) return;
    const text = model.getValueInRange(e.selection);
    if (!text.trim()) {
      selectionPopupVisible.value = false;
      pendingSelection.value = null;
      return;
    }
    const domNode = modEditor.getDomNode();
    const coords = modEditor.getScrolledVisiblePosition({
      lineNumber: e.selection.endLineNumber,
      column: e.selection.endColumn
    });
    if (!coords || !domNode) return;
    const rect = domNode.getBoundingClientRect();
    pendingSelection.value = {
      text,
      lineStart: e.selection.startLineNumber,
      lineEnd: e.selection.endLineNumber
    };
    selectionPopupAnchor.value = {
      left: rect.left + coords.left,
      top: rect.top + coords.top,
      width: 2,
      height: coords.height
    };
    selectionPopupVisible.value = true;
  });
}

onMounted(() => {
  const el = hostRef.value;
  if (!el) return;

  monaco.editor.setTheme(resolveTheme());

  diffEditor = monaco.editor.createDiffEditor(el, {
    renderSideBySide: props.layout === "split",
    readOnly: true,
    fontSize: 12,
    fontFamily: "var(--font-app-mono)",
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    fixedOverflowWidgets: true
  });

  createModels();
  attachSelectionListener();

  colorObserver = new MutationObserver(() => {
    monaco.editor.setTheme(resolveTheme());
  });
  colorObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"]
  });
});

onBeforeUnmount(() => {
  colorObserver?.disconnect();
  colorObserver = null;
  diffEditor?.getOriginalEditor().getModel()?.dispose();
  diffEditor?.getModifiedEditor().getModel()?.dispose();
  diffEditor?.dispose();
  diffEditor = null;
});

watch(
  () => [props.original, props.modified, props.filePath] as const,
  () => { createModels(); }
);

watch(
  () => props.layout,
  (next) => {
    diffEditor?.updateOptions({ renderSideBySide: next === "split" });
  }
);

function dismissSelectionPopup(): void {
  selectionPopupVisible.value = false;
  selectionPopupAnchor.value = null;
}

function onQueueDiffSelection(): void {
  const tid = props.activeThreadId;
  if (!tid || !threadQueue) {
    toast.error("No active thread", "Select a thread before queuing context.");
    dismissSelectionPopup();
    return;
  }
  const p = pendingSelection.value;
  if (!p) { dismissSelectionPopup(); return; }
  const capture: QueueCapture = {
    source: "diff",
    filePath: props.filePath,
    selectedText: p.text,
    lineStart: p.lineStart,
    lineEnd: p.lineEnd
  };
  threadQueue.addItem(tid, {
    id: crypto.randomUUID(),
    source: "diff",
    pasteText: buildPasteText(capture),
    meta: { filePath: props.filePath }
  });
  dismissSelectionPopup();
  pendingSelection.value = null;
}

async function onInjectDiffSelectionToAgent(): Promise<void> {
  const tid = props.activeThreadId;
  if (!tid) {
    toast.error("No active thread", "Select a thread before sending context to the agent.");
    dismissSelectionPopup();
    return;
  }
  if (!injectContextToAgent) {
    toast.error("Unavailable", "Sending to the agent is not available here.");
    dismissSelectionPopup();
    return;
  }
  const p = pendingSelection.value;
  if (!p) { dismissSelectionPopup(); return; }
  const capture: QueueCapture = {
    source: "diff",
    filePath: props.filePath,
    selectedText: p.text,
    lineStart: p.lineStart,
    lineEnd: p.lineEnd
  };
  const item: QueueItem = {
    id: crypto.randomUUID(),
    source: "diff",
    pasteText: buildPasteText(capture),
    meta: { filePath: props.filePath }
  };
  const ok = await injectContextToAgent([item], { sessionId: tid });
  if (!ok) return;
  dismissSelectionPopup();
  pendingSelection.value = null;
}
</script>

<template>
  <div class="relative h-full min-h-0 w-full overflow-hidden">
    <div ref="hostRef" class="monaco-diff-host h-full min-h-0 w-full overflow-hidden" />
    <ContextQueueSelectionPopup
      :visible="selectionPopupVisible"
      :anchor="selectionPopupAnchor"
      @queue="onQueueDiffSelection"
      @send-to-agent="onInjectDiffSelectionToAgent"
      @dismiss="dismissSelectionPopup"
    />
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/desktop && pnpm run test -- src/components/__tests__/MonacoDiffEditor.test.ts
```

Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/MonacoDiffEditor.vue apps/desktop/src/components/__tests__/MonacoDiffEditor.test.ts
git commit -m "feat(desktop): add MonacoDiffEditor component"
```

---

## Task 6: Wire MonacoDiffEditor into SourceControlPanel

**Files:**
- Modify: `apps/desktop/src/components/SourceControlPanel.vue`

- [ ] **Step 1: Update the import in SourceControlPanel.vue**

In `apps/desktop/src/components/SourceControlPanel.vue`, find:

```ts
import CodeMirrorMergeDiff from "@/components/CodeMirrorMergeDiff.vue";
```

Replace with:

```ts
import MonacoDiffEditor from "@/components/MonacoDiffEditor.vue";
```

- [ ] **Step 2: Update the component reference in the template**

In the `<template>` section find:

```html
<CodeMirrorMergeDiff
  class="min-h-0 flex-1"
  :layout="scmDiffLayout"
  :original="mergeResult.original"
  :modified="mergeResult.modified"
  :file-path="selectedEntry?.path ?? ''"
  :active-thread-id="props.activeThreadId"
/>
```

Replace with:

```html
<MonacoDiffEditor
  class="min-h-0 flex-1"
  :layout="scmDiffLayout"
  :original="mergeResult.original"
  :modified="mergeResult.modified"
  :file-path="selectedEntry?.path ?? ''"
  :active-thread-id="props.activeThreadId"
/>
```

- [ ] **Step 3: Run the full test suite**

```bash
cd apps/desktop && pnpm run test
```

Expected: all tests PASS (no regressions in DiffReviewPanel, FileSearchEditor, etc.)

- [ ] **Step 4: Run TypeScript typecheck**

```bash
cd apps/desktop && pnpm run typecheck
```

Expected: no type errors

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/SourceControlPanel.vue
git commit -m "feat(desktop): swap CodeMirrorMergeDiff → MonacoDiffEditor in SourceControlPanel"
```

---

## Task 7: Remove CodeMirror files and packages

**Files:**
- Delete: `apps/desktop/src/components/CodeMirrorEditor.vue`
- Delete: `apps/desktop/src/components/CodeMirrorMergeDiff.vue`
- Delete: `apps/desktop/src/lib/codemirrorLanguageExtensions.ts`
- Delete: `apps/desktop/src/lib/codemirrorThemes.ts`
- Delete: `apps/desktop/src/lib/codemirrorMarkdownImagePreview.ts`
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Verify no remaining imports of deleted files**

```bash
cd apps/desktop && grep -r "CodeMirrorEditor\|CodeMirrorMergeDiff\|codemirrorLanguageExtensions\|codemirrorThemes\|codemirrorMarkdownImagePreview" src --include="*.ts" --include="*.vue" -l
```

Expected: no output (empty). If any files appear, update them before continuing.

- [ ] **Step 2: Verify no remaining direct @codemirror imports outside the files being deleted**

```bash
cd apps/desktop && grep -r "@codemirror\|from 'codemirror'" src --include="*.ts" --include="*.vue" -l | grep -v "CodeMirrorEditor\|CodeMirrorMergeDiff\|codemirrorLanguage\|codemirrorThemes\|codemirrorMarkdown"
```

Expected: no output. If any files appear, they use CodeMirror independently and must be handled separately before removing packages.

- [ ] **Step 3: Delete the CodeMirror component and lib files**

```bash
rm apps/desktop/src/components/CodeMirrorEditor.vue
rm apps/desktop/src/components/CodeMirrorMergeDiff.vue
rm apps/desktop/src/lib/codemirrorLanguageExtensions.ts
rm apps/desktop/src/lib/codemirrorThemes.ts
rm apps/desktop/src/lib/codemirrorMarkdownImagePreview.ts
```

- [ ] **Step 4: Remove CodeMirror packages from package.json**

In `apps/desktop/package.json`, remove these entries from `"dependencies"`:

```
@codemirror/commands
@codemirror/lang-cpp
@codemirror/lang-css
@codemirror/lang-go
@codemirror/lang-html
@codemirror/lang-java
@codemirror/lang-javascript
@codemirror/lang-json
@codemirror/lang-markdown
@codemirror/lang-php
@codemirror/lang-python
@codemirror/lang-rust
@codemirror/lang-sql
@codemirror/lang-xml
@codemirror/lang-yaml
@codemirror/language
@codemirror/merge
@codemirror/search
@codemirror/state
@codemirror/view
@lezer/highlight
codemirror
diff2html
```

- [ ] **Step 5: Reinstall and verify the build**

```bash
cd apps/desktop && pnpm install && pnpm run build 2>&1 | tail -30
```

Expected: build succeeds with no `@codemirror` or `diff2html` references.

- [ ] **Step 6: Run the full test suite one final time**

```bash
cd apps/desktop && pnpm run test
```

Expected: all tests PASS

- [ ] **Step 7: Run TypeScript typecheck**

```bash
cd apps/desktop && pnpm run typecheck
```

Expected: no errors

- [ ] **Step 8: Run bundle budget check**

```bash
cd apps/desktop && pnpm run verify:bundle-budget
```

Expected: within budget. If over budget, the Monaco `languageWorkers` list in `vite.config.ts` can be trimmed (e.g. remove `"html"` if not needed) to reduce lazy chunk count.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src/components/CodeMirrorEditor.vue apps/desktop/src/components/CodeMirrorMergeDiff.vue apps/desktop/src/lib/codemirrorLanguageExtensions.ts apps/desktop/src/lib/codemirrorThemes.ts apps/desktop/src/lib/codemirrorMarkdownImagePreview.ts apps/desktop/package.json pnpm-lock.yaml
git commit -m "chore(desktop): remove CodeMirror 6 and diff2html, complete Monaco migration"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: Vite plugin config ✓, MonacoEditor ✓, MonacoDiffEditor ✓, theme sync ✓ (MutationObserver in both components), save/write path left to FileSearchEditor as before ✓, binary file read-only ✓ (readOnly: true on diff editor; for the file editor, FileSearchEditor handles binary detection and passes readOnly state — no change needed), migration order ✓, cleanup ✓
- [x] **Placeholder scan**: no TBDs, all code shown completely
- [x] **Type consistency**: `QueueableEditorSelection` exported from `MonacoEditor.vue` in Task 3, imported in Task 4. `monacoLanguageIdFromPath` defined in Task 2, imported in `MonacoDiffEditor.vue` Task 5. `ScmDiffLayout` defined locally in both `MonacoDiffEditor.vue` and `SourceControlPanel.vue` (each file defines its own, consistent with the existing pattern). `ContextQueueSelectionPopup` props (`visible`, `anchor`, `@queue`, `@send-to-agent`, `@dismiss`) match the existing component interface carried over from `CodeMirrorMergeDiff.vue`.
