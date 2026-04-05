<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { html as diffToHtml } from "diff2html";
import { ColorSchemeType } from "diff2html/lib/types";
import BaseButton from "@/components/ui/BaseButton.vue";
import "diff2html/bundles/css/diff2html.min.css";

const props = defineProps<{
  selectedDiff: string;
  /** Optional context in the sticky bar (one path or "N files"). */
  summaryLabel: string | null;
}>();

/** Above this, skip HTML diff (parse cost + DOM size). Raw view stays instant. */
const RICH_DIFF_MAX_BYTES = 900_000;

const emit = defineEmits<{
  stageAll: [];
  discardAll: [];
}>();

const diffHostRef = ref<HTMLElement | null>(null);
const rawCollapsed = ref(false);

/** diff2html has no theme toggle — only LIGHT / DARK / AUTO. Match `html.dark` like `globals.css`. */
function diffColorSchemeFromDocument(): ColorSchemeType {
  if (typeof document === "undefined") return ColorSchemeType.LIGHT;
  return document.documentElement.classList.contains("dark") ? ColorSchemeType.DARK : ColorSchemeType.LIGHT;
}

const diffColorScheme = ref<ColorSchemeType>(diffColorSchemeFromDocument());

let diffThemeObserver: MutationObserver | null = null;

/** Tailwind tokens for diff2html DOM (overrides library default colors). */
const diffRichHostClass = [
  "diff-rich-host diff-review-scroll p-2",
  "[&_.d2h-wrapper]:!bg-transparent [&_.d2h-wrapper]:flex [&_.d2h-wrapper]:flex-col [&_.d2h-wrapper]:gap-1",
  "[&_.d2h-file-diff]:!overflow-visible",
  "[&_.d2h-files-diff]:!overflow-visible",
  "[&_.d2h-file-side-diff]:!overflow-x-visible",
  "[&_.d2h-file-side-diff]:!overflow-y-visible",
  "[&_.d2h-file-wrapper.diff-collapsed_.d2h-file-diff]:hidden",
  "[&_.d2h-file-wrapper.diff-collapsed_.d2h-files-diff]:hidden",
  "[&_.d2h-file-wrapper]:!mb-0 [&_.d2h-file-wrapper]:overflow-hidden [&_.d2h-file-wrapper]:rounded-md [&_.d2h-file-wrapper]:border [&_.d2h-file-wrapper]:border-border [&_.d2h-file-wrapper]:shadow-sm",
  "[&_.d2h-file-header]:relative [&_.d2h-file-header]:flex [&_.d2h-file-header]:min-h-10",
  "[&_.d2h-file-header]:cursor-pointer [&_.d2h-file-header]:select-none [&_.d2h-file-header]:items-center [&_.d2h-file-header]:gap-2",
  "[&_.d2h-file-header]:border-0 [&_.d2h-file-header]:border-b [&_.d2h-file-header]:border-border [&_.d2h-file-header]:!bg-background",
  "[&_.d2h-file-header]:px-3 [&_.d2h-file-header]:py-2 [&_.d2h-file-header]:pr-8 [&_.d2h-file-header]:!text-foreground",
  "[&_.d2h-file-header:focus-visible]:!outline-none [&_.d2h-file-header:focus-visible]:!ring-0 [&_.d2h-file-header:focus-visible]:!ring-offset-0",
  "[&_.d2h-file-name-wrapper]:!min-w-0 [&_.d2h-file-name-wrapper]:!flex-1",
  "[&_.d2h-file-header::after]:pointer-events-none [&_.d2h-file-header::after]:absolute [&_.d2h-file-header::after]:right-3 [&_.d2h-file-header::after]:left-auto",
  "[&_.d2h-file-header::after]:top-1/2 [&_.d2h-file-header::after]:mt-[-3px] [&_.d2h-file-header::after]:size-0",
  "[&_.d2h-file-header::after]:border-4 [&_.d2h-file-header::after]:border-transparent [&_.d2h-file-header::after]:border-t-muted-foreground/60",
  "[&_.d2h-file-header::after]:content-[''] [&_.d2h-file-header::after]:transition-transform [&_.d2h-file-header::after]:duration-150 [&_.d2h-file-header::after]:ease-out",
  "[&_.d2h-file-wrapper.diff-collapsed_.d2h-file-header::after]:-rotate-90",
  "[&_.d2h-file-name]:!text-foreground [&_.d2h-icon]:!text-muted-foreground",
  "[&_.d2h-file-collapse]:!text-muted-foreground",
].join(" ");

function looksLikeUnifiedDiff(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return t.includes("diff --git ") || /^---\s+/m.test(t);
}

const richDiffHtml = computed(() => {
  const raw = props.selectedDiff;
  if (!looksLikeUnifiedDiff(raw)) return null;
  if (raw.length > RICH_DIFF_MAX_BYTES) return null;
  try {
    return diffToHtml(raw, {
      drawFileList: false,
      colorScheme: diffColorScheme.value,
      outputFormat: "line-by-line",
      diffStyle: "word",
    });
  } catch {
    return null;
  }
});

function syncFileHeaderA11y(root: HTMLElement | null): void {
  if (!root) return;
  root.querySelectorAll<HTMLElement>(".d2h-file-header").forEach((header) => {
    const wrapper = header.closest(".d2h-file-wrapper");
    const collapsed = wrapper?.classList.contains("diff-collapsed") ?? false;
    header.setAttribute("role", "button");
    header.setAttribute("tabindex", "0");
    header.setAttribute("aria-expanded", collapsed ? "false" : "true");
  });
}

function toggleFileWrapperFromHeader(header: HTMLElement): void {
  const wrapper = header.closest(".d2h-file-wrapper");
  if (!wrapper) return;
  wrapper.classList.toggle("diff-collapsed");
  const collapsed = wrapper.classList.contains("diff-collapsed");
  header.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

function handleDiffHostClick(ev: MouseEvent): void {
  const target = ev.target as HTMLElement | null;
  if (!target || !diffHostRef.value) return;
  if (target.closest(".d2h-file-collapse")) return;
  const header = target.closest(".d2h-file-header");
  if (!header || !diffHostRef.value.contains(header)) return;
  toggleFileWrapperFromHeader(header as HTMLElement);
}

function handleDiffHostKeydown(ev: KeyboardEvent): void {
  if (ev.key !== "Enter" && ev.key !== " ") return;
  const target = ev.target as HTMLElement | null;
  if (!target?.classList.contains("d2h-file-header")) return;
  if (!diffHostRef.value?.contains(target)) return;
  ev.preventDefault();
  toggleFileWrapperFromHeader(target);
}

watch(
  () => richDiffHtml.value,
  async () => {
    await nextTick();
    syncFileHeaderA11y(diffHostRef.value);
  }
);

watch(
  () => props.selectedDiff,
  () => {
    rawCollapsed.value = false;
  }
);

onMounted(() => {
  diffColorScheme.value = diffColorSchemeFromDocument();
  diffThemeObserver = new MutationObserver(() => {
    diffColorScheme.value = diffColorSchemeFromDocument();
  });
  diffThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

  const el = diffHostRef.value;
  el?.addEventListener("click", handleDiffHostClick);
  el?.addEventListener("keydown", handleDiffHostKeydown);
  void nextTick(() => syncFileHeaderA11y(diffHostRef.value));
});

onBeforeUnmount(() => {
  diffThemeObserver?.disconnect();
  diffThemeObserver = null;

  const el = diffHostRef.value;
  el?.removeEventListener("click", handleDiffHostClick);
  el?.removeEventListener("keydown", handleDiffHostKeydown);
});
</script>

<template>
  <section class="flex bg-muted h-full min-h-0 flex-col bg-card text-xs">
    <!-- Single scrollport: toolbar + diff share one overflow (toolbar is sticky). -->
    <div ref="diffHostRef" class="diff-scroll-root min-h-0 flex-1 overflow-auto">
      <header
        class="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-card p-3"
      >
        <span
          v-if="summaryLabel"
          class="min-w-0 max-w-[min(100%,28rem)] truncate text-xs text-muted-foreground"
          :title="summaryLabel"
          >{{ summaryLabel }}</span
        >
        <div class="ml-auto flex flex-wrap gap-2">
          <BaseButton
            size="sm"
            variant="secondary"
            class="focus-visible:!border-transparent focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0"
            @click="emit('stageAll')"
            >Stage All</BaseButton
          >
          <BaseButton
            size="sm"
            variant="destructive"
            class="focus-visible:!border-transparent focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0"
            @click="emit('discardAll')"
            >Discard All</BaseButton
          >
        </div>
      </header>      
      <div v-if="richDiffHtml" :class="diffRichHostClass" v-html="richDiffHtml" />
      <template v-else>
        <div class="p-2">
          <div class="overflow-hidden rounded-md border border-border bg-background shadow-sm">
          <button
            v-if="summaryLabel"
            type="button"
            class="flex w-full items-center gap-2 border-0 border-b border-border bg-muted/40 px-3 py-2 text-left text-sm font-medium hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-0"
            :aria-expanded="!rawCollapsed"
            @click="rawCollapsed = !rawCollapsed"
          >
            <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ summaryLabel }}</span>
            <span
              class="pointer-events-none inline-block size-0 shrink-0 border-[5px] border-transparent border-t-muted-foreground/70 transition-transform duration-150 ease-out"
              :class="rawCollapsed ? '-rotate-90' : ''"
              aria-hidden="true"
            />
          </button>
          <pre
            v-show="!rawCollapsed || !summaryLabel"
            class="m-0 bg-background p-3 whitespace-pre-wrap font-mono"
            >{{ selectedDiff }}</pre
          >
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
@reference "../styles/globals.css";

/* Match ui/Badge.vue (badgeVariants); diff2html is v-html so we style library nodes with :deep(). */
.diff-rich-host :deep(.d2h-file-wrapper) {
  margin-bottom: 0 !important;
  border-color: var(--border) !important;
  background: var(--background);
  border-radius: 0.375rem !important;
  overflow: hidden !important;
}

.diff-rich-host :deep(.d2h-file-header) {
  background-color: var(--background) !important;
  border-color: var(--border) !important;
}

.diff-rich-host :deep(.d2h-tag) {
  margin-left: 0.375rem;
  border: none !important;
  @apply inline-flex w-fit shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors;
}

.diff-rich-host :deep(.d2h-changed-tag) {
  @apply bg-secondary text-secondary-foreground;
}

.diff-rich-host :deep(.d2h-added-tag) {
  @apply bg-chart-2/15 text-chart-2 dark:bg-chart-2/20;
}

.diff-rich-host :deep(.d2h-deleted-tag) {
  @apply bg-destructive text-white dark:bg-destructive/60;
}

.diff-rich-host :deep(.d2h-moved-tag) {
  border: 1px solid var(--border) !important;
  @apply bg-transparent text-foreground;
}

.diff-rich-host :deep(.d2h-lines-added) {
  border: none !important;
  border-radius: 9999px !important;
  @apply bg-chart-2/15 px-2 py-0.5 text-xs font-medium text-chart-2;
}

.diff-rich-host :deep(.d2h-lines-deleted) {
  border: none !important;
  border-radius: 9999px !important;
  @apply ml-1 bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive;
}

/*
 * diff2html uses position:absolute on line-number <td>s so the gutter stays fixed when the code
 * row scrolls horizontally. That reads as “sticky” line numbers — use normal table flow instead.
 */
.diff-rich-host :deep(td.d2h-code-linenumber),
.diff-rich-host :deep(td.d2h-code-side-linenumber) {
  position: relative !important;
  vertical-align: top !important;
}

.diff-rich-host :deep(td.d2h-code-linenumber) {
  width: 7.5em !important;
  max-width: 7.5em !important;
}

.diff-rich-host :deep(td.d2h-code-side-linenumber) {
  width: 4em !important;
  max-width: 4em !important;
}

.diff-rich-host :deep(.d2h-code-line) {
  padding: 0 0.5rem !important;
  width: auto !important;
  max-width: none !important;
}

.diff-rich-host :deep(.d2h-code-side-line) {
  padding: 0 0.5rem !important;
  width: auto !important;
  max-width: none !important;
}

/* Diff2Html UI adds this class when sticky file headers are enabled; plain html() output usually omits it. */
.diff-rich-host :deep(.d2h-file-header.d2h-sticky-header) {
  position: relative !important;
  top: auto !important;
  z-index: auto !important;
}
</style>
