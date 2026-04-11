<script setup lang="ts">
import { BookMarked, Paperclip, Slash } from "lucide-vue-next";
import { computed } from "vue";

export type SlashSuggestionItem = {
  id: string;
  label: string;
  description: string;
  itemKind: "slash";
};

export type AtSuggestionItem = {
  id: string;
  label: string;
  itemKind: "file" | "skill";
};

export type SuggestionRow = SlashSuggestionItem | AtSuggestionItem;

const props = withDefaults(
  defineProps<{
    variant: "slash" | "at";
    items: SuggestionRow[];
    selectedIndex: number;
    loading?: boolean;
    onPick: (index: number) => void;
  }>(),
  { loading: false }
);

const heading = computed(() => (props.variant === "slash" ? "Commands" : "Repository"));

function rowIcon(item: SuggestionRow) {
  if (props.variant === "slash") return Slash;
  if (item.itemKind === "skill") return BookMarked;
  return Paperclip;
}

function isSkillRow(item: SuggestionRow): boolean {
  return item.itemKind === "skill";
}
</script>

<template>
  <div
    data-testid="thread-create-suggestion-menu"
    class="flex min-h-0 min-w-[12rem] max-w-[min(100vw-2rem,22rem)] max-h-[min(13rem,45vh)] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
    role="listbox"
    :aria-label="variant === 'slash' ? 'Slash commands' : 'Repository files and skills'"
  >
    <div
      class="shrink-0 border-b border-border/60 px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
    >
      {{ heading }}
    </div>
    <div
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 [scrollbar-width:thin]"
    >
      <div v-if="loading" class="px-3 py-2 text-xs text-muted-foreground">Searching repository…</div>
      <template v-else-if="items.length === 0">
        <p class="px-3 py-2 text-xs text-muted-foreground">
          {{ variant === "slash" ? "No matching commands." : "No matching files." }}
        </p>
      </template>
      <template v-else>
        <button
          v-for="(item, idx) in items"
          :key="`${variant}-${item.id}-${idx}`"
          type="button"
          role="option"
          class="flex w-full min-w-0 flex-col gap-0.5 px-2 py-1.5 text-left text-xs hover:bg-accent"
          :class="idx === selectedIndex ? 'bg-accent' : ''"
          :aria-selected="idx === selectedIndex"
          @mousedown.prevent="onPick(idx)"
        >
          <span class="flex min-w-0 items-center gap-2">
            <component
              :is="rowIcon(item)"
              class="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span class="min-w-0 truncate font-mono text-[11px] font-medium text-foreground">{{
              variant === "slash" ? (item as SlashSuggestionItem).id : item.label
            }}</span>
          </span>
          <span
            v-if="variant === 'slash' && 'description' in item && item.description"
            class="pl-5 text-[11px] text-muted-foreground"
            >{{ (item as SlashSuggestionItem).description }}</span
          >
          <span
            v-else-if="variant === 'at' && isSkillRow(item)"
            class="pl-5 text-[10px] text-muted-foreground"
            >Skill</span
          >
        </button>
      </template>
    </div>
  </div>
</template>
