<script setup lang="ts">
import { indentWithTab } from "@codemirror/commands";
import { foldGutter, foldKeymap, indentUnit } from "@codemirror/language";
import { openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import type { EditorView, Panel, ViewUpdate } from "@codemirror/view";
import { EditorView as CMEditorView, keymap, lineNumbers } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { yonce, yeti } from "@/lib/codemirrorThemes";
import { languageExtensionsFor } from "@/lib/codemirrorLanguageExtensions";
import { markdownImagePreviewExtension } from "@/lib/codemirrorMarkdownImagePreview";
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
    /** When set with `markdownFilePath`, show `![](...)` previews in Markdown source (Electron). */
    markdownWorkspaceRoot?: string | null;
    markdownFilePath?: string | null;
    /** When false, Markdown `![](...)` widgets are hidden (plain source). Default true. */
    markdownImagePreviewEnabled?: boolean;
    /** When true, mouseup with a non-empty selection emits `queueable-text-selection`. */
    queueSelectionHints?: boolean;
  }>(),
  { markdownImagePreviewEnabled: true, queueSelectionHints: false }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "queueable-text-selection": [payload: QueueableEditorSelection | null];
}>();

const hostRef = ref<HTMLDivElement | null>(null);
const view = shallowRef<CMEditorView | null>(null);
let syncingFromProp = false;

/** Toggled without recreating editor state (preserves selection and undo). */
const imagePreviewCompartment = new Compartment();

function markdownImagePreviewSlot(): Extension {
  if (
    props.language !== "markdown" ||
    !props.markdownWorkspaceRoot ||
    !props.markdownFilePath ||
    props.markdownImagePreviewEnabled === false
  ) {
    return [];
  }
  return markdownImagePreviewExtension({
    workspaceRoot: props.markdownWorkspaceRoot,
    markdownPath: props.markdownFilePath
  });
}

function queueSelectionExtensions(): Extension[] {
  if (!props.queueSelectionHints) return [];
  return [
    CMEditorView.updateListener.of((update) => {
      if (!update.selectionSet) return;
      if (update.state.selection.main.empty) {
        emit("queueable-text-selection", null);
      }
    }),
    CMEditorView.domEventHandlers({
      mouseup(_e, view) {
        const sel = view.state.selection.main;
        if (sel.empty) {
          emit("queueable-text-selection", null);
          return false;
        }
        const text = view.state.sliceDoc(sel.from, sel.to);
        if (!text.trim()) {
          emit("queueable-text-selection", null);
          return false;
        }
        const coords = view.coordsAtPos(sel.to);
        if (!coords) return false;
        emit("queueable-text-selection", {
          selectedText: text,
          lineStart: view.state.doc.lineAt(sel.from).number,
          lineEnd: view.state.doc.lineAt(sel.to).number,
          anchor: {
            left: coords.left,
            top: coords.top,
            width: Math.max(2, coords.right - coords.left),
            height: Math.max(2, coords.bottom - coords.top)
          }
        });
        return false;
      }
    })
  ];
}

const extensions = computed((): Extension[] => {
  const attrs: Extension[] = [];
  if (props.ariaLabel) {
    attrs.push(CMEditorView.contentAttributes.of({ "aria-label": props.ariaLabel }));
  }
  return [
    minimalSetup,
    colorSchemeDark.value ? yonce : yeti,
    CMEditorView.darkTheme.of(colorSchemeDark.value),
    search({ top: true, createPanel: createCustomSearchPanel }),
    indentUnit.of("  "),
    keymap.of([indentWithTab]),
    keymap.of(searchKeymap),
    keymap.of(foldKeymap),
    ...(props.showLineNumbers === false ? [] : [lineNumbers(), foldGutter()]),
    ...languageExtensionsFor(props.language),
    imagePreviewCompartment.of(markdownImagePreviewSlot()),
    CMEditorView.theme({
      /* Fill flex parent (.file-editor-cm); avoid height:100% when parent height is indefinite */
      "&": {
        flex: "1 1 0%",
        minHeight: 0,
        fontSize: "12px"
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
        padding: "12px"
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
        borderRight: "1px solid color-mix(in oklab, var(--border) 75%, transparent)"
      },
      ".cm-foldGutter .cm-gutterElement": {
        paddingLeft: "2px",
        paddingRight: "4px"
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
    ...queueSelectionExtensions(),
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
  () =>
    [
      props.language,
      props.ariaLabel,
      props.showLineNumbers,
      colorSchemeDark.value,
      props.markdownWorkspaceRoot,
      props.markdownFilePath,
      props.queueSelectionHints
    ] as const,
  () => {
    const v = view.value;
    if (!v) return;
    const doc = v.state.doc.toString();
    v.setState(createState(doc));
  }
);

watch(
  () =>
    [
      props.markdownImagePreviewEnabled,
      props.markdownWorkspaceRoot,
      props.markdownFilePath,
      props.language
    ] as const,
  () => {
    const v = view.value;
    if (!v) return;
    v.dispatch({
      effects: imagePreviewCompartment.reconfigure(markdownImagePreviewSlot())
    });
  }
);

/** Opens the in-editor find/replace panel (same as Mod-f from @codemirror/search). */
function openFind(): void {
  const v = view.value;
  if (v) openSearchPanel(v);
}

defineExpose({ openFind });
</script>

<template>
  <div
    ref="hostRef"
    data-testid="file-editor"
    class="file-editor-cm flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-md bg-muted/15 [font-feature-settings:'liga'_0]"
    :data-language="language"
    :data-line-numbers="props.showLineNumbers === false ? 'hidden' : 'visible'"
  />
</template>
