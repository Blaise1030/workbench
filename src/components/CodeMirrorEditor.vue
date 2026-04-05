<script setup lang="ts">
import { indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { languageExtensionsFor } from "@/lib/codemirrorLanguageExtensions";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";

const props = defineProps<{
  modelValue: string;
  language?: string;
  ariaLabel?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const hostRef = ref<HTMLDivElement | null>(null);
const view = shallowRef<EditorView | null>(null);
let syncingFromProp = false;

const extensions = computed((): Extension[] => {
  const attrs: Extension[] = [];
  if (props.ariaLabel) {
    attrs.push(EditorView.contentAttributes.of({ "aria-label": props.ariaLabel }));
  }
  return [
    minimalSetup,
    indentUnit.of("  "),
    keymap.of([indentWithTab]),
    ...languageExtensionsFor(props.language),
    EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "12px",
        backgroundColor: "transparent"
      },
      "&.cm-focused": {
        outline: "none"
      },
      ".cm-scroller": {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        lineHeight: "1.25rem",
        overflow: "auto"
      },
      ".cm-content": {
        caretColor: "var(--foreground)",
        padding: "12px"
      },
      ".cm-line": {
        padding: "0"
      }
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !syncingFromProp) {
        emit("update:modelValue", update.state.doc.toString());
      }
    }),
    ...attrs
  ];
});

function createState(doc: string) {
  return EditorState.create({
    doc,
    extensions: extensions.value
  });
}

onMounted(() => {
  const el = hostRef.value;
  if (!el) return;
  view.value = new EditorView({
    state: createState(props.modelValue),
    parent: el
  });
});

onBeforeUnmount(() => {
  view.value?.destroy();
  view.value = null;
});

watch(
  () => props.modelValue,
  (next) => {
    const v = view.value;
    if (!v) return;
    const cur = v.state.doc.toString();
    if (cur === next) return;
    syncingFromProp = true;
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: next }
    });
    syncingFromProp = false;
  }
);

watch(
  () => [props.language, props.ariaLabel] as const,
  () => {
    const v = view.value;
    if (!v) return;
    const doc = v.state.doc.toString();
    v.setState(createState(doc));
  }
);
</script>

<template>
  <div
    ref="hostRef"
    data-testid="file-editor"
    class="file-editor-cm h-full min-h-[18rem] w-full overflow-hidden rounded-md bg-muted/15 [font-feature-settings:'liga'_0]"
    :data-language="language"
  />
</template>
