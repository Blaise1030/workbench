<script setup lang="ts">
import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { yonce, yeti } from "@/lib/codemirrorThemes";
import { inject, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { codemirrorLanguageIdFromPath, languageExtensionsFor } from "@/lib/codemirrorLanguageExtensions";
import { buildPasteText } from "@/contextQueue/formatters";
import { injectContextToAgentKey, threadContextQueueKey } from "@/contextQueue/injectionKeys";
import type { QueueCapture, QueueItem } from "@/contextQueue/types";
import type { Rect } from "@/lib/contextQueueAnchor";
import ContextQueueSelectionPopup from "@/components/contextQueue/ContextQueueSelectionPopup.vue";
import { useToast } from "@/composables/useToast";

type ScmDiffLayout = "split" | "unified";

const props = withDefaults(
  defineProps<{
    original: string;
    modified: string;
    filePath: string;
    /** Split = side‑by‑side merge panes; unified = single column with deleted blocks above changes. */
    layout?: ScmDiffLayout;
    /** When set with injected queue, user can queue diff selections for the agent. */
    activeThreadId?: string | null;
  }>(),
  { layout: "split", activeThreadId: null }
);

const hostRef = ref<HTMLDivElement | null>(null);
const mergeViewRef = shallowRef<MergeView | null>(null);
const editorViewRef = shallowRef<EditorView | null>(null);
const colorSchemeDark = ref(false);

const threadQueue = inject(threadContextQueueKey, undefined);
const injectContextToAgent = inject(injectContextToAgentKey, undefined);
const toast = useToast();

const selectionPopupVisible = ref(false);
const selectionPopupAnchor = ref<Rect | null>(null);
const pendingDiff = ref<{ text: string; lineStart: number; lineEnd: number } | null>(null);
let lastSelectionView: EditorView | null = null;

function isDark(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

function queueSelectionExtension(): Extension {
  return EditorView.domEventHandlers({
    mouseup(_event, view) {
      if (!threadQueue) return false;
      const tid = props.activeThreadId;
      if (!tid) return false;

      const sel = view.state.selection.main;
      if (sel.empty) {
        selectionPopupVisible.value = false;
        selectionPopupAnchor.value = null;
        pendingDiff.value = null;
        return false;
      }

      const text = view.state.sliceDoc(sel.from, sel.to);
      if (!text.trim()) {
        selectionPopupVisible.value = false;
        selectionPopupAnchor.value = null;
        pendingDiff.value = null;
        return false;
      }

      const coords = view.coordsAtPos(sel.to);
      if (!coords) return false;

      lastSelectionView = view;
      pendingDiff.value = {
        text,
        lineStart: view.state.doc.lineAt(sel.from).number,
        lineEnd: view.state.doc.lineAt(sel.to).number
      };
      selectionPopupAnchor.value = {
        left: coords.left,
        top: coords.top,
        width: Math.max(2, coords.right - coords.left),
        height: Math.max(2, coords.bottom - coords.top)
      };
      selectionPopupVisible.value = true;
      return false;
    }
  });
}

function baseExtensions(): Extension[] {
  const ext: Extension[] = [
    minimalSetup,
    colorSchemeDark.value ? yonce : yeti,
    EditorView.editable.of(false),
    EditorView.darkTheme.of(colorSchemeDark.value),
    EditorView.lineWrapping,
    ...languageExtensionsFor(codemirrorLanguageIdFromPath(props.filePath)),
    EditorView.theme({
      "&.cm-editor": {
        fontSize: "12px"
      },
      "&.cm-editor.cm-focused": {
        outline: "none"
      },
      ".cm-scroller": {
        fontFamily: "var(--font-app-mono)",
        lineHeight: "1.25rem",
        overflow: "auto",
        minHeight: "80px"
      },
      ".cm-content": {
        padding: "8px 10px"
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
        borderRight: "1px solid color-mix(in oklab, var(--border) 75%, transparent)"
      },
      "&.cm-merge-a .cm-changedText, &.cm-merge-b .cm-changedText, & .cm-deletedChunk .cm-deletedText": {
        background: "none !important",
        backgroundImage: "none !important"
      },
      "&.cm-merge-a .cm-changedLine": {
        backgroundColor: "color-mix(in oklab, var(--destructive) 26%, transparent) !important"
      },
      "& .cm-deletedChunk": {
        backgroundColor: "color-mix(in oklab, var(--destructive) 26%, transparent) !important"
      },
      "&.cm-merge-b .cm-changedLine, &.cm-merge-b .cm-inlineChangedLine": {
        backgroundColor: "color-mix(in oklab, var(--chart-2) 26%, transparent) !important"
      },
      "&.cm-merge-b .cm-deletedText": {
        backgroundColor: "color-mix(in oklab, var(--destructive) 32%, transparent) !important"
      }
    })
  ];
  if (threadQueue) {
    ext.push(queueSelectionExtension());
  }
  return ext;
}

function destroyViews(): void {
  mergeViewRef.value?.destroy();
  mergeViewRef.value = null;
  editorViewRef.value?.destroy();
  editorViewRef.value = null;
  lastSelectionView = null;
  selectionPopupVisible.value = false;
  selectionPopupAnchor.value = null;
  pendingDiff.value = null;
}

function mountMerge(): void {
  const el = hostRef.value;
  if (!el) return;
  destroyViews();

  if (props.layout === "unified") {
    editorViewRef.value = new EditorView({
      parent: el,
      state: EditorState.create({
        doc: props.modified,
        extensions: [
          ...baseExtensions(),
          EditorState.readOnly.of(true),
          unifiedMergeView({
            original: props.original,
            highlightChanges: true,
            gutter: true,
            mergeControls: false,
            allowInlineDiffs: true,
            collapseUnchanged: { margin: 4, minSize: 6 },
            diffConfig: { scanLimit: 2000, timeout: 2500 }
          })
        ]
      })
    });
    return;
  }

  mergeViewRef.value = new MergeView({
    parent: el,
    orientation: "a-b",
    highlightChanges: true,
    gutter: true,
    collapseUnchanged: { margin: 4, minSize: 6 },
    diffConfig: { scanLimit: 2000, timeout: 2500 },
    a: { doc: props.original, extensions: baseExtensions() },
    b: { doc: props.modified, extensions: baseExtensions() }
  });
}

let colorSchemeObserver: MutationObserver | null = null;

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
  const p = pendingDiff.value;
  if (!p) {
    dismissSelectionPopup();
    return;
  }

  const capture: QueueCapture = {
    source: "diff",
    filePath: props.filePath,
    selectedText: p.text,
    lineStart: p.lineStart,
    lineEnd: p.lineEnd
  };
  const pasteText = buildPasteText(capture);
  threadQueue.addItem(tid, {
    id: crypto.randomUUID(),
    source: "diff",
    pasteText,
    meta: { filePath: props.filePath }
  });

  if (lastSelectionView) {
    const sel = lastSelectionView.state.selection.main;
    lastSelectionView.dispatch({
      selection: EditorSelection.cursor(sel.to),
      userEvent: "instrument.contextQueue"
    });
  }

  dismissSelectionPopup();
  pendingDiff.value = null;
  lastSelectionView = null;
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
  const p = pendingDiff.value;
  if (!p) {
    dismissSelectionPopup();
    return;
  }

  const capture: QueueCapture = {
    source: "diff",
    filePath: props.filePath,
    selectedText: p.text,
    lineStart: p.lineStart,
    lineEnd: p.lineEnd
  };
  const pasteText = buildPasteText(capture);
  const item: QueueItem = {
    id: crypto.randomUUID(),
    source: "diff",
    pasteText,
    meta: { filePath: props.filePath }
  };

  const ok = await injectContextToAgent([item], { sessionId: tid });
  if (!ok) return;

  if (lastSelectionView) {
    const sel = lastSelectionView.state.selection.main;
    lastSelectionView.dispatch({
      selection: EditorSelection.cursor(sel.to),
      userEvent: "instrument.contextQueue"
    });
  }

  dismissSelectionPopup();
  pendingDiff.value = null;
  lastSelectionView = null;
}

onMounted(() => {
  colorSchemeDark.value = isDark();
  mountMerge();
  colorSchemeObserver = new MutationObserver(() => {
    const next = isDark();
    if (next !== colorSchemeDark.value) {
      colorSchemeDark.value = next;
      mountMerge();
    }
  });
  colorSchemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
});

onBeforeUnmount(() => {
  colorSchemeObserver?.disconnect();
  colorSchemeObserver = null;
  destroyViews();
});

watch(
  () => [props.original, props.modified, props.filePath, props.layout] as const,
  () => {
    mountMerge();
  }
);
</script>

<template>
  <div class="relative h-full min-h-0 w-full overflow-hidden">
    <div ref="hostRef" class="scm-merge-diff-host h-full min-h-0 w-full overflow-hidden" />
    <ContextQueueSelectionPopup
      :visible="selectionPopupVisible"
      :anchor="selectionPopupAnchor"
      @queue="onQueueDiffSelection"
      @send-to-agent="onInjectDiffSelectionToAgent"
      @dismiss="dismissSelectionPopup"
    />
  </div>
</template>

<style scoped>
@reference "../styles/globals.css";

.scm-merge-diff-host :deep(.cm-mergeView) {
  height: 100%;
  overflow: auto;
  font-family: var(--font-app-mono);
}

.scm-merge-diff-host :deep(.cm-mergeViewEditor) {
  flex: 1 1 0%;
  min-width: 0;
}

.scm-merge-diff-host :deep(.cm-editor) {
  height: 100%;
}

.scm-merge-diff-host :deep(.cm-editor .cm-scroller) {
  height: 100%;
}
</style>
