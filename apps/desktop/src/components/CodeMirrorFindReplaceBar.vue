<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { CaseSensitive, Regex, Search, WholeWord } from "lucide-vue-next";
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

function toggleMatchCase(): void {
  matchCase.value = !matchCase.value;
  commit();
}

function toggleWholeWord(): void {
  byWord.value = !byWord.value;
  commit();
}

function toggleRegexp(): void {
  useRegexp.value = !useRegexp.value;
  commit();
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
  <div
    class="cm-find-replace-bar rounded-lg border border-border/60 bg-background/95 p-1.5 text-xs text-foreground shadow-sm backdrop-blur-sm supports-[backdrop-filter]:bg-background/80"
  >
    <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
      <div class="relative min-w-[8rem] flex-1 text-muted-foreground">
        <Search
          class="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          ref="findInputRef"
          v-model="findText"
          type="search"
          name="search"
          autocomplete="off"
          placeholder="Find"
          aria-label="Find"
          main-field="true"
          class="h-8 min-w-0 w-full rounded-md bg-muted py-1 pr-2 pl-8 text-xs focus-visible:ring-2"
          @input="commit"
          @change="commit"
          @keydown.enter="handleFindEnter"
        />
      </div>
      <div
        class="flex shrink-0 items-center gap-0.5 rounded-md border border-border/70 bg-muted/20 p-0.5"
        role="toolbar"
        aria-label="Find navigation"
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="shrink-0 text-[11px] font-medium"
          title="Find next (Enter)"
          @click="findNext(props.editorView)"
        >
          Next
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="shrink-0 text-[11px] font-medium"
          title="Find previous (Shift+Enter)"
          @click="findPrevious(props.editorView)"
        >
          Prev
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="shrink-0 text-[11px] font-medium"
          title="Select all matches"
          @click="selectMatches(props.editorView)"
        >
          All
        </Button>
      </div>
      <div
        class="flex shrink-0 items-center gap-0.5 rounded-md border border-border/70 bg-muted/20 p-0.5"
        role="group"
        aria-label="Text filters"
      >
        <Button
          type="button"
          :variant="matchCase ? 'secondary' : 'ghost'"
          size="icon-xs"
          class="size-7 shrink-0"
          title="Match case"
          :aria-pressed="matchCase"
          aria-label="Match case"
          @click="toggleMatchCase"
        >
          <CaseSensitive class="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          :variant="byWord ? 'secondary' : 'ghost'"
          size="icon-xs"
          class="size-7 shrink-0"
          title="Match whole word"
          :aria-pressed="byWord"
          aria-label="Match whole word"
          @click="toggleWholeWord"
        >
          <WholeWord class="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          :variant="useRegexp ? 'secondary' : 'ghost'"
          size="icon-xs"
          class="size-7 shrink-0"
          title="Use regular expression"
          :aria-pressed="useRegexp"
          aria-label="Use regular expression"
          @click="toggleRegexp"
        >
          <Regex class="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
      <Button
        type="button"
        class="ml-auto shrink-0 text-base leading-none text-muted-foreground"
        variant="ghost"
        size="icon-xs"
        aria-label="Close find"
        @click="onClose"
      >
        ×
      </Button>
    </div>
    <div
      v-if="showReplace"
      class="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 border-t border-border/50 pt-1.5"
    >
      <Input
        v-model="replaceText"
        type="text"
        name="replace"
        autocomplete="off"
        placeholder="Replace"
        aria-label="Replace"
        class="h-8 min-w-[10rem] flex-1 rounded-md bg-muted px-2.5 text-xs focus-visible:ring-2"
        @input="commit"
        @change="commit"
      />
      <div
        class="flex shrink-0 items-center gap-0.5 rounded-md border border-border/70 bg-muted/20 p-0.5"
        role="toolbar"
        aria-label="Replace actions"
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="shrink-0 text-[11px] font-medium"
          @click="replaceNext(props.editorView)"
        >
          Replace
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="shrink-0 text-[11px] font-medium"
          @click="replaceAll(props.editorView)"
        >
          Replace all
        </Button>
      </div>
    </div>
  </div>
</template>
