<script setup lang="ts">
import { MergeView } from "@codemirror/merge";
import { type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { codemirrorLanguageIdFromPath, languageExtensionsFor } from "@/lib/codemirrorLanguageExtensions";

const props = defineProps<{
  original: string;
  modified: string;
  filePath: string;
}>();

const hostRef = ref<HTMLDivElement | null>(null);
const mergeViewRef = shallowRef<MergeView | null>(null);
const colorSchemeDark = ref(false);

function isDark(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

function baseExtensions(): Extension[] {
  return [
    minimalSetup,
    EditorView.editable.of(false),
    EditorView.darkTheme.of(colorSchemeDark.value),
    EditorView.lineWrapping,
    ...languageExtensionsFor(codemirrorLanguageIdFromPath(props.filePath)),
    EditorView.theme({
      "&.cm-editor": {
        fontSize: "12px",
        backgroundColor: "transparent"
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
        caretColor: "var(--foreground)",
        padding: "8px 10px"
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
        color: "var(--muted-foreground)",
        borderRight: "1px solid color-mix(in oklab, var(--border) 75%, transparent)"
      },
      /*
       * Merge default theme draws a 2px bottom bar via linear-gradient on `.cm-changedText`.
       * Keep `.cm-changedLine` row backgrounds only; remove token-level “underline”.
       */
      "&.cm-merge-a .cm-changedText, &.cm-merge-b .cm-changedText, & .cm-deletedChunk .cm-deletedText": {
        background: "none !important",
        backgroundImage: "none !important"
      },
      /* Darker than merge defaults (~8% rgba) — align with app SCM diff hues. */
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
}

function mountMerge(): void {
  const el = hostRef.value;
  if (!el) return;
  mergeViewRef.value?.destroy();
  mergeViewRef.value = null;
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
  mergeViewRef.value?.destroy();
  mergeViewRef.value = null;
});

watch(
  () => [props.original, props.modified, props.filePath] as const,
  () => {
    mountMerge();
  }
);
</script>

<template>
  <div ref="hostRef" class="scm-merge-diff-host h-full min-h-0 w-full overflow-hidden" />
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
</style>
