<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ExternalLink, Loader2, MessageSquare, RefreshCw, Settings2 } from "lucide-vue-next";
import { DiffView, DiffModeEnum } from "@git-diff-view/vue";
import "@git-diff-view/vue/styles/diff-view.css";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGitHubPrStore, type GitHubPrComment } from "@/stores/githubPrStore";
import GitHubTokenSetup from "./GitHubTokenSetup.vue";

const props = defineProps<{
  cwd: string;
}>();

const store = useGitHubPrStore();

const showSetup = ref(!store.isConfigured);

watch(
  () => store.isConfigured,
  (v) => {
    if (v) showSetup.value = false;
  }
);

onMounted(() => {
  if (store.isConfigured && store.prs.length === 0) {
    void store.fetchPrs();
  }
});

function onSaved(): void {
  showSetup.value = false;
  void store.fetchPrs();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function openInBrowser(url: string): void {
  window.open(url, "_blank");
}

// ── Diff view ─────────────────────────────────────────────────────────────

const isDark = computed(() => document.documentElement.classList.contains("dark"));

const diffViewMode = computed(() => DiffModeEnum.Unified);

const diffData = computed(() => {
  const file = store.selectedFileDiff;
  if (!file) return null;
  return {
    oldFile: { fileName: file.oldFileName === "/dev/null" ? null : file.oldFileName },
    newFile: { fileName: file.newFileName === "/dev/null" ? null : file.newFileName },
    hunks: file.hunks,
  };
});

// Group comments by line number for the extend slot
const commentsByLine = computed<Record<string, GitHubPrComment[]>>(() => {
  const map: Record<string, GitHubPrComment[]> = {};
  for (const c of store.commentsForSelectedFile) {
    const key = String(c.line ?? c.original_line ?? 0);
    if (!map[key]) map[key] = [];
    map[key]!.push(c);
  }
  return map;
});

const extendData = computed(() => {
  const newFile: Record<string, { data: GitHubPrComment[] }> = {};
  for (const [lineStr, comments] of Object.entries(commentsByLine.value)) {
    newFile[lineStr] = { data: comments };
  }
  return { newFile };
});

const expandedLines = ref<Set<string>>(new Set());

function toggleComments(lineNumber: number): void {
  const key = String(lineNumber);
  const next = new Set(expandedLines.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedLines.value = next;
}

function isExpanded(lineNumber: number): boolean {
  return expandedLines.value.has(String(lineNumber));
}

// Reset expanded state when PR or file changes
watch([() => store.selectedPrNumber, () => store.selectedFileName], () => {
  expandedLines.value = new Set();
});

// ── File stats display ────────────────────────────────────────────────────
function splitDisplayName(name: string): { dir: string; base: string } {
  const i = name.lastIndexOf("/");
  if (i < 0) return { dir: "", base: name };
  return { dir: name.slice(0, i), base: name.slice(i + 1) };
}
</script>

<template>
  <section class="flex h-full min-h-0 bg-background text-[11px] text-foreground">
    <!-- Setup overlay -->
    <GitHubTokenSetup v-if="showSetup" :cwd="cwd" @saved="onSaved" />

    <template v-else>
      <!-- Left sidebar: PR list -->
      <aside class="flex h-full min-h-0 w-[270px] shrink-0 flex-col border-r border-border">
        <header class="flex h-9 items-center justify-between gap-1 border-b border-border px-2">
          <span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Pull Requests
          </span>
          <div class="flex items-center gap-1">
            <Button
              size="icon-xs"
              variant="ghost"
              class="h-6 w-6"
              title="Refresh PR list"
              :disabled="store.loading"
              @click="void store.fetchPrs()"
            >
              <Loader2 v-if="store.loading" class="h-3 w-3 animate-spin" />
              <RefreshCw v-else class="h-3 w-3" />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              class="h-6 w-6"
              title="GitHub settings"
              @click="showSetup = true"
            >
              <Settings2 class="h-3 w-3" />
            </Button>
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <div
            v-if="store.error && !store.prs.length"
            class="px-3 py-4 text-[11px] text-destructive"
          >
            {{ store.error }}
          </div>
          <div
            v-else-if="!store.loading && store.prs.length === 0"
            class="flex flex-col items-center justify-center gap-2 px-3 py-8 text-center"
          >
            <p class="text-[11px] text-muted-foreground">No open pull requests.</p>
          </div>
          <button
            v-for="pr in store.prs"
            :key="pr.number"
            type="button"
            class="flex w-full flex-col gap-1 border-b border-border px-3 py-2 text-left transition-colors hover:bg-muted/40"
            :class="
              store.selectedPrNumber === pr.number
                ? 'bg-primary/10 ring-1 ring-inset ring-primary/20'
                : ''
            "
            @click="void store.selectPr(pr.number)"
          >
            <div class="flex items-start gap-1.5">
              <span class="shrink-0 font-mono text-[10px] text-muted-foreground">#{{ pr.number }}</span>
              <span class="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground leading-tight">
                {{ pr.title }}
              </span>
            </div>
            <div class="flex items-center gap-1.5 pl-[22px]">
              <Badge v-if="pr.draft" variant="outline" class="h-4 px-1 text-[9px]">Draft</Badge>
              <span class="truncate text-[10px] text-muted-foreground">
                {{ pr.user.login }} · {{ formatDate(pr.updated_at) }}
              </span>
              <span
                v-if="pr.review_comments > 0"
                class="ml-auto flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground"
              >
                <MessageSquare class="h-2.5 w-2.5" />
                {{ pr.review_comments }}
              </span>
            </div>
          </button>
        </div>
      </aside>

      <!-- Right: diff + file list -->
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <!-- No PR selected -->
        <div
          v-if="!store.selectedPrNumber"
          class="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"
        >
          <p class="text-[11px]">Select a pull request to view its diff.</p>
        </div>

        <!-- Loading diff -->
        <div
          v-else-if="store.diffLoading"
          class="flex h-full items-center justify-center text-[11px] text-muted-foreground"
        >
          <Loader2 class="mr-2 h-4 w-4 animate-spin" />
          Loading diff…
        </div>

        <template v-else-if="store.selectedPr">
          <!-- PR header -->
          <header class="flex h-9 min-w-0 items-center gap-2 overflow-x-auto border-b border-border px-3 whitespace-nowrap">
            <Badge variant="outline" class="h-5 shrink-0 px-1.5 text-[10px]">
              {{ store.selectedPr.draft ? "Draft" : "Open" }}
            </Badge>
            <span class="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
              {{ store.selectedPr.title }}
            </span>
            <span class="shrink-0 font-mono text-[10px] text-muted-foreground">
              #{{ store.selectedPr.number }}
            </span>
            <Button
              size="icon-xs"
              variant="ghost"
              class="h-6 w-6 shrink-0"
              title="View on GitHub"
              @click="openInBrowser(store.selectedPr!.html_url)"
            >
              <ExternalLink class="h-3 w-3" />
            </Button>
          </header>

          <div class="flex min-h-0 flex-1 overflow-hidden">
            <!-- File tree -->
            <div class="flex h-full w-[200px] shrink-0 flex-col border-r border-border overflow-y-auto">
              <div class="flex h-7 items-center border-b border-border px-2">
                <span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Files ({{ store.parsedFiles.length }})
                </span>
              </div>
              <button
                v-for="file in store.parsedFiles"
                :key="file.displayName"
                type="button"
                class="flex w-full flex-col gap-0.5 border-b border-border/60 px-2 py-1.5 text-left transition-colors hover:bg-muted/40"
                :class="
                  store.selectedFileName === file.displayName
                    ? 'bg-primary/10 ring-1 ring-inset ring-primary/20'
                    : ''
                "
                @click="store.selectedFileName = file.displayName"
              >
                <span class="truncate font-mono text-[10px] font-medium text-foreground">
                  {{ splitDisplayName(file.displayName).base }}
                </span>
                <span
                  v-if="splitDisplayName(file.displayName).dir"
                  class="truncate font-mono text-[9px] text-muted-foreground"
                >
                  {{ splitDisplayName(file.displayName).dir }}
                </span>
                <div class="flex items-center gap-1.5 pt-0.5">
                  <span v-if="file.isNewFile" class="text-[9px] text-emerald-600 dark:text-emerald-400">new</span>
                  <span v-else-if="file.isDeletedFile" class="text-[9px] text-destructive">deleted</span>
                  <span class="font-mono text-[9px] text-emerald-600 dark:text-emerald-400">+{{ file.additions }}</span>
                  <span class="font-mono text-[9px] text-destructive">-{{ file.deletions }}</span>
                </div>
              </button>
            </div>

            <!-- Diff view -->
            <div class="min-h-0 min-w-0 flex-1 overflow-auto">
              <div
                v-if="!store.selectedFileDiff"
                class="flex h-full items-center justify-center text-[11px] text-muted-foreground"
              >
                Select a file to view its diff.
              </div>

              <DiffView
                v-else-if="diffData"
                :data="diffData"
                :extend-data="extendData"
                :diff-view-mode="diffViewMode"
                :diff-view-theme="isDark ? 'dark' : 'light'"
                :diff-view-highlight="true"
                :diff-view-wrap="true"
                :diff-view-font-size="11"
                class="min-w-0"
              >
                <template #extend="{ lineNumber, data, onUpdate }">
                  <div
                    v-if="data && data.length > 0"
                    class="border-t border-border/60 bg-muted/30"
                  >
                    <button
                      type="button"
                      class="flex w-full items-center gap-1.5 px-3 py-1 text-left text-[10px] font-medium text-muted-foreground hover:text-foreground"
                      @click="toggleComments(lineNumber); onUpdate()"
                    >
                      <MessageSquare class="h-3 w-3 shrink-0" />
                      {{ data.length }} comment{{ data.length === 1 ? "" : "s" }}
                    </button>
                    <div v-if="isExpanded(lineNumber)" class="divide-y divide-border/60 border-t border-border/60">
                      <div
                        v-for="comment in data"
                        :key="comment.id"
                        class="px-3 py-2"
                      >
                        <div class="mb-1 flex items-center gap-1.5">
                          <img
                            :src="comment.user.avatar_url"
                            :alt="comment.user.login"
                            class="h-4 w-4 rounded-full"
                          />
                          <span class="font-semibold text-[10px] text-foreground">{{ comment.user.login }}</span>
                          <span class="text-[9px] text-muted-foreground">{{ formatDate(comment.created_at) }}</span>
                        </div>
                        <p class="whitespace-pre-wrap text-[11px] text-foreground leading-snug">{{ comment.body }}</p>
                      </div>
                    </div>
                  </div>
                </template>
              </DiffView>
            </div>
          </div>
        </template>
      </div>
    </template>
  </section>
</template>

<style scoped>
@reference "../../styles/globals.css";

/* Ensure DiffView fills its container and respects dark/light theme */
:deep(.diff-view-wrapper) {
  font-size: 11px;
  min-width: 0;
}
</style>
