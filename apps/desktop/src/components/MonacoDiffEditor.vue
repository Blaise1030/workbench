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
