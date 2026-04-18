<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { monaco } from "@/lib/monacoApi";
import { applyMonacoGithubTheme } from "@/lib/monacoGithubTheme";
import { monacoLanguageIdFromPath } from "@/lib/monacoLanguage";
import ContextQueueSelectionPopup from "@/components/contextQueue/ContextQueueSelectionPopup.vue";
import { buildPasteText } from "@/contextQueue/formatters";
import {
  injectContextToAgentKey,
  openWorkspaceFileKey,
  threadContextQueueKey
} from "@/contextQueue/injectionKeys";
import type { QueueCapture, QueueItem } from "@/contextQueue/types";
import type { Rect } from "@/lib/contextQueueAnchor";
import { resolveSelectionFilePath } from "@/lib/selectionFilePath";
import { useToast } from "@/composables/useToast";

type ScmDiffLayout = "split" | "unified";

const props = withDefaults(
  defineProps<{
    original: string;
    modified: string;
    filePath: string;
    worktreePath?: string | null;
    layout?: ScmDiffLayout;
    activeThreadId?: string | null;
  }>(),
  { worktreePath: null, layout: "split", activeThreadId: null }
);

const hostRef = ref<HTMLDivElement | null>(null);
const selectionPopupVisible = ref(false);
const selectionPopupAnchor = ref<Rect | null>(null);
const pendingSelection = ref<{ text: string; lineStart: number; lineEnd: number } | null>(null);
const pendingSelectionGoToPath = ref<string | null>(null);
let pendingSelectionGoToSeq = 0;

const threadQueue = inject(threadContextQueueKey, undefined);
const injectContextToAgent = inject(injectContextToAgentKey, undefined);
const openWorkspaceFile = inject(openWorkspaceFileKey, undefined);
const toast = useToast();

let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null;
let colorObserver: MutationObserver | null = null;

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
  if (!modEditor) return;
  modEditor.onDidChangeCursorSelection((e) => {
    if (!threadQueue) {
      selectionPopupVisible.value = false;
      pendingSelection.value = null;
      pendingSelectionGoToPath.value = null;
      return;
    }
    if (e.selection.isEmpty()) {
      selectionPopupVisible.value = false;
      pendingSelection.value = null;
      pendingSelectionGoToPath.value = null;
      return;
    }
    const model = modEditor.getModel();
    if (!model) return;
    const text = model.getValueInRange(e.selection);
    if (!text.trim()) {
      selectionPopupVisible.value = false;
      pendingSelection.value = null;
      pendingSelectionGoToPath.value = null;
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
    void updateSelectionGoToPath(text);
  });
}

async function updateSelectionGoToPath(selectedText: string): Promise<void> {
  const seq = ++pendingSelectionGoToSeq;
  pendingSelectionGoToPath.value = null;
  const api = typeof window !== "undefined" ? window.workspaceApi ?? null : null;
  const resolved = await resolveSelectionFilePath(api, props.worktreePath, selectedText);
  if (seq !== pendingSelectionGoToSeq) return;
  if (pendingSelection.value?.text !== selectedText) return;
  pendingSelectionGoToPath.value = resolved;
}

onMounted(() => {
  const el = hostRef.value;
  if (!el) return;

  applyMonacoGithubTheme(monaco);

  diffEditor = monaco.editor.createDiffEditor(el, {
    renderSideBySide: props.layout === "split",
    hideUnchangedRegions: {
      enabled: true,
      revealLineCount: 20,
      minimumLineCount: 4,
      contextLineCount: 3
    },
    readOnly: true,
    fontSize: 12,
    fontFamily: "var(--font-app-mono)",
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    fixedOverflowWidgets: true,
    scrollbar: {
      vertical: "auto",
      horizontal: "auto",
      useShadows: false,
      verticalScrollbarSize: 12,
      verticalSliderSize: 9,
      horizontalScrollbarSize: 12,
      horizontalSliderSize: 9
    }
  });

  createModels();
  attachSelectionListener();

  colorObserver = new MutationObserver(() => {
    applyMonacoGithubTheme(monaco);
  });
  colorObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"]
  });
});

onBeforeUnmount(() => {
  colorObserver?.disconnect();
  colorObserver = null;
  if (diffEditor) {
    const model = diffEditor.getModel();
    diffEditor.setModel(null);
    model?.original?.dispose();
    model?.modified?.dispose();
    diffEditor.dispose();
    diffEditor = null;
  }
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
  pendingSelectionGoToPath.value = null;
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

async function onGoToDiffSelectionFile(): Promise<void> {
  const path = pendingSelectionGoToPath.value;
  if (!path || !openWorkspaceFile) {
    dismissSelectionPopup();
    return;
  }
  await openWorkspaceFile(path);
  dismissSelectionPopup();
  pendingSelection.value = null;
}
</script>

<template>
  <div class="relative h-full min-h-0 w-full overflow-hidden">
    <div
      ref="hostRef"
      class="monaco-app-scrollbars monaco-diff-host h-full min-h-0 w-full overflow-hidden"
    />
    <ContextQueueSelectionPopup
      :visible="selectionPopupVisible"
      :anchor="selectionPopupAnchor"
      :go-to-file-path="pendingSelectionGoToPath"
      @queue="onQueueDiffSelection"
      @go-to-file="onGoToDiffSelectionFile"
      @send-to-agent="onInjectDiffSelectionToAgent"
      @dismiss="dismissSelectionPopup"
    />
  </div>
</template>
