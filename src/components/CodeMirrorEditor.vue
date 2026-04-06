<script setup lang="ts">
import { indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import type { EditorView, Panel, ViewUpdate } from "@codemirror/view";
import { EditorView as CMEditorView, keymap } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { languageExtensionsFor } from "@/lib/codemirrorLanguageExtensions";
import CodeMirrorFindReplaceBar from "@/components/CodeMirrorFindReplaceBar.vue";
import { type App, type ComponentPublicInstance, computed, createApp, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";

type FindBarExposed = { syncFromView: (u: ViewUpdate) => void };

function createCustomSearchPanel(view: EditorView): Panel {
  const dom = document.createElement("div");
  let app: App | null = null;
  let bar: (ComponentPublicInstance & FindBarExposed) | null = null;
  return {
    dom,
    top: true,
    mount() {
      app = createApp(CodeMirrorFindReplaceBar, { editorView: view });
      bar = app.mount(dom) as ComponentPublicInstance & FindBarExposed;
    },
    update(u: ViewUpdate) {
      bar?.syncFromView(u);
    },
    destroy() {
      app?.unmount();
      app = null;
      bar = null;
    }
  };
}

/** CodeMirror’s `&light` / `&dark` panels follow this facet, not `html.dark`. */
const colorSchemeDark = ref(false);

const props = defineProps<{
  modelValue: string;
  language?: string;
  ariaLabel?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const hostRef = ref<HTMLDivElement | null>(null);
const view = shallowRef<CMEditorView | null>(null);
let syncingFromProp = false;

const extensions = computed((): Extension[] => {
  const attrs: Extension[] = [];
  if (props.ariaLabel) {
    attrs.push(CMEditorView.contentAttributes.of({ "aria-label": props.ariaLabel }));
  }
  return [
    minimalSetup,
    CMEditorView.darkTheme.of(colorSchemeDark.value),
    search({ top: true, createPanel: createCustomSearchPanel }),
    indentUnit.of("  "),
    keymap.of([indentWithTab]),
    keymap.of(searchKeymap),
    ...languageExtensionsFor(props.language),
    CMEditorView.theme({
      /* Fill flex parent (.file-editor-cm); avoid height:100% when parent height is indefinite */
      "&": {
        flex: "1 1 0%",
        minHeight: 0,
        fontSize: "12px",
        backgroundColor: "transparent"
      },
      "&.cm-focused": {
        outline: "none"
      },
      ".cm-scroller": {
        fontFamily: "var(--font-app-mono)",
        lineHeight: "1.25rem",
        overflow: "auto",
        minHeight: 0,
        flex: "1 1 0%"
      },
      ".cm-content": {
        caretColor: "var(--foreground)",
        padding: "12px"
      },
      ".cm-line": {
        padding: "0"
      },
      ".cm-panels": {
        backgroundColor: "transparent !important"
      },
      ".cm-panels.cm-panels-top": {
        padding: "8px 10px 0",
        borderBottom: "none"
      }
    }),
    CMEditorView.updateListener.of((update) => {
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

let colorSchemeObserver: MutationObserver | null = null;

onMounted(() => {
  colorSchemeDark.value = document.documentElement.classList.contains("dark");
  const el = hostRef.value;
  if (!el) return;
  view.value = new CMEditorView({
    state: createState(props.modelValue),
    parent: el
  });
  colorSchemeObserver = new MutationObserver(() => {
    const next = document.documentElement.classList.contains("dark");
    if (next !== colorSchemeDark.value) colorSchemeDark.value = next;
  });
  colorSchemeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"]
  });
});

onBeforeUnmount(() => {
  colorSchemeObserver?.disconnect();
  colorSchemeObserver = null;
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
  () => [props.language, props.ariaLabel, colorSchemeDark.value] as const,
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
    class="file-editor-cm flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-md bg-muted/15 [font-feature-settings:'liga'_0]"
    :data-language="language"
  />
</template>
