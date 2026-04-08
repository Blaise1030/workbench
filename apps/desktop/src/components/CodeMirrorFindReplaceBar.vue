<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
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
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";

const props = defineProps<{
  editorView: EditorView;
}>();

const findInputRef = ref<InstanceType<typeof Input> | null>(null);
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

function handleFindEnter(e: KeyboardEvent): void {
  e.preventDefault();
  commit();
  if (e.shiftKey) {
    findPrevious(props.editorView);
  } else {
    findNext(props.editorView);
  }
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
  void nextTick(() => {
    findInputRef.value?.focus({ preventScroll: true });
  });
});

defineExpose({ syncFromView });
</script>

<template>
  <div class="cm-find-replace-bar rounded-lg border border-border bg-transparent p-2.5 text-xs text-foreground shadow-none">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <Input
        ref="findInputRef"
        v-model="findText"
        type="search"
        name="search"
        autocomplete="off"
        placeholder="Find"
        aria-label="Find"
        main-field="true"
        class="h-7 min-w-[10rem] flex-1 rounded-md bg-background px-2.5 text-xs focus-visible:ring-2"
        @input="commit"
        @change="commit"
        @keydown.enter="handleFindEnter"
      />
      <Button
        type="button"
        variant="outline"
        size="xs"
        @click="findNext(props.editorView)"
      >
        next
      </Button>
      <Button
        type="button"
        variant="outline"
        size="xs"
        @click="findPrevious(props.editorView)"
      >
        previous
      </Button>
      <Button
        type="button"
        variant="outline"
        size="xs"
        @click="selectMatches(props.editorView)"
      >
        all
      </Button>
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
      <Button
        type="button"
        class="ml-auto text-base leading-none text-muted-foreground"
        variant="ghost"
        size="icon-xs"
        aria-label="Close"
        @click="onClose"
      >
        ×
      </Button>
    </div>
    <div v-if="showReplace" class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <Input
        v-model="replaceText"
        type="text"
        name="replace"
        autocomplete="off"
        placeholder="Replace"
        aria-label="Replace"
        class="h-7 min-w-[10rem] flex-1 rounded-md bg-background px-2.5 text-xs focus-visible:ring-2"
        @input="commit"
        @change="commit"
      />
      <Button
        type="button"
        size="xs"
        @click="replaceNext(props.editorView)"
      >
        replace
      </Button>
      <Button
        type="button"
        variant="outline"
        size="xs"
        @click="replaceAll(props.editorView)"
      >
        replace all
      </Button>
    </div>
  </div>
</template>
