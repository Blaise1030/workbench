<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, toRef, watch } from "vue";
import { monaco } from "@/lib/monacoApi";
import { applyMonacoShadcnTheme } from "@/lib/monacoShadcnTheme";

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
    queueSelectionHints?: boolean;
  }>(),
  { showLineNumbers: true }
);

const language = toRef(props, "language");
const showLineNumbers = toRef(props, "showLineNumbers");

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "queueable-text-selection": [selection: QueueableEditorSelection | null];
}>();

const hostRef = ref<HTMLDivElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let suppressChange = false;
let colorObserver: MutationObserver | null = null;
let queueableScrollRaf = 0;

function emitQueueableTextSelection(sel: monaco.Selection | null): void {
  if (!editor || !props.queueSelectionHints) {
    emit("queueable-text-selection", null);
    return;
  }
  const model = editor.getModel();
  if (!model || !sel || sel.isEmpty()) {
    emit("queueable-text-selection", null);
    return;
  }
  const text = model.getValueInRange(sel);
  if (!text.trim()) {
    emit("queueable-text-selection", null);
    return;
  }
  const domNode = editor.getDomNode();
  /** Caret / active end of the highlight (not the normalized Range end). */
  const coords = editor.getScrolledVisiblePosition({
    lineNumber: sel.positionLineNumber,
    column: sel.positionColumn
  });
  if (!coords || !domNode) {
    emit("queueable-text-selection", null);
    return;
  }
  const rect = domNode.getBoundingClientRect();
  emit("queueable-text-selection", {
    selectedText: text,
    lineStart: sel.startLineNumber,
    lineEnd: sel.endLineNumber,
    anchor: {
      left: rect.left + coords.left,
      top: rect.top + coords.top,
      width: 2,
      height: coords.height
    }
  });
}

onMounted(() => {
  const el = hostRef.value;
  if (!el) return;

  applyMonacoShadcnTheme(monaco);

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

  editor.onDidChangeModelContent(() => {
    if (suppressChange) return;
    emit("update:modelValue", editor!.getValue());
  });

  // Always subscribe: `queueSelectionHints` is often false at mount (no thread yet) and
  // becomes true later — conditional registration would never attach the listener.
  editor.onDidChangeCursorSelection((e) => {
    emitQueueableTextSelection(e.selection);
  });

  editor.onDidScrollChange(() => {
    if (!props.queueSelectionHints) return;
    if (queueableScrollRaf) cancelAnimationFrame(queueableScrollRaf);
    queueableScrollRaf = requestAnimationFrame(() => {
      queueableScrollRaf = 0;
      emitQueueableTextSelection(editor?.getSelection() ?? null);
    });
  });

  colorObserver = new MutationObserver(() => {
    applyMonacoShadcnTheme(monaco);
  });
  colorObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"]
  });
});

onBeforeUnmount(() => {
  if (queueableScrollRaf) cancelAnimationFrame(queueableScrollRaf);
  queueableScrollRaf = 0;
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

watch(
  () => props.queueSelectionHints,
  (enabled) => {
    if (!enabled) emit("queueable-text-selection", null);
    else if (editor) emitQueueableTextSelection(editor.getSelection());
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
    class="monaco-app-scrollbars flex min-h-0 w-full flex-1 overflow-hidden"
    :data-language="language"
    :data-line-numbers="showLineNumbers === false ? 'hidden' : 'visible'"
  />
</template>
