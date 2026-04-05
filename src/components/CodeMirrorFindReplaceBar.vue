<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  selectMatches,
  setSearchQuery
} from "@codemirror/search";

const props = defineProps<{
  editorView: EditorView;
}>();

const findText = ref("");
const replaceText = ref("");
const matchCase = ref(false);
const useRegexp = ref(false);
const byWord = ref(false);
const readOnly = ref(false);

const showReplace = computed(() => !readOnly.value);

function pullFromState(): void {
  const q = getSearchQuery(props.editorView.state);
  findText.value = q.search;
  replaceText.value = q.replace;
  matchCase.value = q.caseSensitive;
  useRegexp.value = q.regexp;
  byWord.value = q.wholeWord;
  readOnly.value = props.editorView.state.readOnly;
}

function commit(): void {
  const q = new SearchQuery({
    search: findText.value,
    replace: replaceText.value,
    caseSensitive: matchCase.value,
    regexp: useRegexp.value,
    wholeWord: byWord.value
  });
  const cur = getSearchQuery(props.editorView.state);
  if (!q.eq(cur)) {
    props.editorView.dispatch({ effects: setSearchQuery.of(q) });
  }
}

function onClose(): void {
  closeSearchPanel(props.editorView);
}

function syncFromView(u: ViewUpdate): void {
  const prev = getSearchQuery(u.startState);
  const next = getSearchQuery(u.state);
  if (!prev.eq(next)) {
    pullFromState();
  }
  readOnly.value = u.state.readOnly;
}

onMounted(() => {
  pullFromState();
});

defineExpose({ syncFromView });
</script>

<template>
  <div class="cm-find-replace-bar rounded-lg border border-border bg-transparent p-2.5 text-xs text-foreground shadow-none">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <input
        v-model="findText"
        type="search"
        name="search"
        autocomplete="off"
        placeholder="Find"
        aria-label="Find"
        main-field="true"
        class="h-7 min-w-[10rem] flex-1 rounded-md border border-input bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @input="commit"
        @change="commit"
      />
      <button
        type="button"
        class="h-7 shrink-0 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click="findNext(props.editorView)"
      >
        next
      </button>
      <button
        type="button"
        class="h-7 shrink-0 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click="findPrevious(props.editorView)"
      >
        previous
      </button>
      <button
        type="button"
        class="h-7 shrink-0 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click="selectMatches(props.editorView)"
      >
        all
      </button>
      <label class="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-muted-foreground">
        <input
          v-model="matchCase"
          type="checkbox"
          class="size-3.5 rounded border border-input accent-primary"
          @change="commit"
        />
        match case
      </label>
      <label class="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-muted-foreground">
        <input
          v-model="useRegexp"
          type="checkbox"
          class="size-3.5 rounded border border-input accent-primary"
          @change="commit"
        />
        regexp
      </label>
      <label class="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-muted-foreground">
        <input
          v-model="byWord"
          type="checkbox"
          class="size-3.5 rounded border border-input accent-primary"
          @change="commit"
        />
        by word
      </label>
      <button
        type="button"
        class="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-base leading-none text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Close"
        @click="onClose"
      >
        ×
      </button>
    </div>
    <div v-if="showReplace" class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <input
        v-model="replaceText"
        type="text"
        name="replace"
        autocomplete="off"
        placeholder="Replace"
        aria-label="Replace"
        class="h-7 min-w-[10rem] flex-1 rounded-md border border-input bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @input="commit"
        @change="commit"
      />
      <button
        type="button"
        class="h-7 shrink-0 rounded-md border border-primary bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click="replaceNext(props.editorView)"
      >
        replace
      </button>
      <button
        type="button"
        class="h-7 shrink-0 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click="replaceAll(props.editorView)"
      >
        replace all
      </button>
    </div>
  </div>
</template>
