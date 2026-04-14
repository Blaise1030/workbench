<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, toRef, watch } from "vue";
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
