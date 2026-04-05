<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";

const props = defineProps<{
  worktreePath: string | null;
}>();

const searchInput = ref<HTMLInputElement | null>(null);
const query = ref("");
const results = ref<string[]>([]);
const selectedPath = ref<string | null>(null);
const loadedContent = ref("");
const draftContent = ref("");
const isSearching = ref(false);
const isLoadingFile = ref(false);
const isSaving = ref(false);
const error = ref<string | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchRequestId = 0;

const hasWorkspace = computed(() => Boolean(props.worktreePath));
const hasQuery = computed(() => query.value.trim().length > 0);
const dirty = computed(
  () => selectedPath.value !== null && draftContent.value !== loadedContent.value
);

function getApi(): WorkspaceApi | null {
  return window.workspaceApi ?? null;
}

function clearSelection(): void {
  selectedPath.value = null;
  loadedContent.value = "";
  draftContent.value = "";
}

function resetState(): void {
  query.value = "";
  results.value = [];
  error.value = null;
  isSearching.value = false;
  isLoadingFile.value = false;
  isSaving.value = false;
  clearSelection();
}

async function focusSearchInput(): Promise<void> {
  await nextTick();
  searchInput.value?.focus();
}

function cancelPendingSearch(): void {
  if (!searchTimer) return;
  clearTimeout(searchTimer);
  searchTimer = null;
}

async function confirmDiscardIfDirty(): Promise<boolean> {
  if (!dirty.value) return true;
  return window.confirm("Discard unsaved changes?");
}

async function runSearch(): Promise<void> {
  const api = getApi();
  const cwd = props.worktreePath;
  const trimmedQuery = query.value.trim();

  if (!api || !cwd || !trimmedQuery) {
    results.value = [];
    isSearching.value = false;
    return;
  }

  const requestId = ++searchRequestId;
  isSearching.value = true;
  error.value = null;

  try {
    const nextResults = await api.searchFiles(cwd, trimmedQuery);
    if (requestId !== searchRequestId) return;
    results.value = nextResults;
  } catch (searchError) {
    if (requestId !== searchRequestId) return;
    results.value = [];
    error.value =
      searchError instanceof Error ? searchError.message : "Could not search files.";
  } finally {
    if (requestId === searchRequestId) {
      isSearching.value = false;
    }
  }
}

async function openFile(relativePath: string): Promise<void> {
  const api = getApi();
  const cwd = props.worktreePath;
  if (!api || !cwd) return;

  isLoadingFile.value = true;
  error.value = null;

  try {
    const content = await api.readFile(cwd, relativePath);
    selectedPath.value = relativePath;
    loadedContent.value = content;
    draftContent.value = content;
  } catch (readError) {
    error.value =
      readError instanceof Error ? readError.message : "Could not open the selected file.";
  } finally {
    isLoadingFile.value = false;
  }
}

async function handleSelectFile(relativePath: string): Promise<void> {
  if (selectedPath.value === relativePath) return;
  if (!(await confirmDiscardIfDirty())) return;
  await openFile(relativePath);
}

async function handleSave(): Promise<void> {
  const api = getApi();
  const cwd = props.worktreePath;
  const relativePath = selectedPath.value;
  if (!api || !cwd || !relativePath) return;

  isSaving.value = true;
  error.value = null;

  try {
    await api.writeFile(cwd, relativePath, draftContent.value);
    loadedContent.value = draftContent.value;
  } catch (writeError) {
    error.value =
      writeError instanceof Error ? writeError.message : "Could not save the selected file.";
  } finally {
    isSaving.value = false;
  }
}

function handleRevert(): void {
  draftContent.value = loadedContent.value;
  error.value = null;
}

watch(query, () => {
  cancelPendingSearch();
  error.value = null;

  if (!hasQuery.value) {
    results.value = [];
    isSearching.value = false;
    return;
  }

  searchTimer = setTimeout(() => {
    searchTimer = null;
    void runSearch();
  }, 200);
});

watch(
  () => props.worktreePath,
  async (next, previous) => {
    if (next === previous) return;
    cancelPendingSearch();
    searchRequestId += 1;

    if (previous !== undefined && !(await confirmDiscardIfDirty())) {
      return;
    }

    resetState();
    void focusSearchInput();
  }
);

onMounted(() => {
  void focusSearchInput();
});
</script>

<template>
  <section class="flex h-full min-h-0 bg-background text-foreground">
    <div class="flex w-80 shrink-0 flex-col border-r border-border">
      <div class="border-b border-border p-3">
        <label for="file-search" class="mb-2 block text-xs font-medium text-muted-foreground">
          Files
        </label>
        <input
          id="file-search"
          ref="searchInput"
          v-model="query"
          data-testid="file-search-input"
          type="text"
          placeholder="Search paths..."
          class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground focus-visible:border-ring"
          :disabled="!hasWorkspace"
        />
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <p v-if="!hasWorkspace" class="px-2 py-3 text-sm text-muted-foreground">
          Open a workspace to search and edit files.
        </p>
        <p v-else-if="!hasQuery" class="px-2 py-3 text-sm text-muted-foreground">
          Search for a file in the current workspace.
        </p>
        <p v-else-if="isSearching" class="px-2 py-3 text-sm text-muted-foreground">
          Searching…
        </p>
        <p v-else-if="error" class="px-2 py-3 text-sm text-destructive">
          {{ error }}
        </p>
        <p
          v-else-if="results.length === 0"
          class="px-2 py-3 text-sm text-muted-foreground"
        >
          No matching files.
        </p>
        <ul v-else class="space-y-1">
          <li v-for="result in results" :key="result">
            <button
              type="button"
              data-testid="file-result"
              class="w-full rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
              :class="selectedPath === result ? 'bg-muted text-foreground' : 'text-muted-foreground'"
              @click="handleSelectFile(result)"
            >
              {{ result }}
            </button>
          </li>
        </ul>
      </div>
    </div>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div class="min-w-0">
          <p class="truncate text-sm font-medium">
            {{ selectedPath ?? "No file selected" }}
          </p>
          <p
            v-if="dirty"
            class="text-xs text-amber-600"
          >
            Unsaved changes
          </p>
        </div>
        <div class="flex items-center gap-2">
          <BaseButton
            data-testid="revert-file"
            variant="outline"
            size="sm"
            :disabled="!selectedPath || !dirty"
            @click="handleRevert"
          >
            Revert
          </BaseButton>
          <BaseButton
            data-testid="save-file"
            variant="default"
            size="sm"
            :disabled="!selectedPath || !dirty || isSaving"
            @click="handleSave"
          >
            Save
          </BaseButton>
        </div>
      </header>

      <div class="min-h-0 flex-1 p-4">
        <p
          v-if="error && selectedPath"
          class="mb-3 text-sm text-destructive"
        >
          {{ error }}
        </p>
        <p
          v-if="!selectedPath"
          class="text-sm text-muted-foreground"
        >
          Pick a file from the search results to view or edit it.
        </p>
        <p
          v-else-if="isLoadingFile"
          class="text-sm text-muted-foreground"
        >
          Loading file…
        </p>
        <textarea
          v-else
          data-testid="file-editor"
          v-model="draftContent"
          spellcheck="false"
          class="h-full min-h-[18rem] w-full resize-none rounded-lg border border-border bg-background px-3 py-3 font-mono text-sm leading-6 outline-none focus-visible:border-ring"
        />
      </div>
    </div>
  </section>
</template>
