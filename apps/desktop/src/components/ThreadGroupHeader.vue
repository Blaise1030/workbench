<script setup lang="ts">
defineOptions({ inheritAttrs: false });

import { ChevronDown, Archive, ChevronRight, EllipsisVertical, Plus, Trash2 } from "lucide-vue-next";
import { computed, ref } from "vue";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import type { KeybindingId } from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";

const keybindings = useKeybindingsStore();
function titleWithShortcut(label: string, id: KeybindingId): string {
  return keybindings.titleWithShortcut(label, id);
}

const props = withDefaults(
  defineProps<{
    /** Context display name. */
    title: string;
    /** When set for the primary group, label badge text (active workspace context). */
    contextBadgeLabel?: string | null;
    /** Checked-out branch in this worktree. */
    branch?: string | null;
    /** Branch this worktree was created from (e.g. main), if known. */
    baseBranch?: string | null;
    /** Absolute path to the worktree on disk. */
    path?: string | null;
    threadCount: number;
    isStale: boolean;
    collapsed: boolean;
    isActive: boolean;
    isPrimary?: boolean;
    showActions?: boolean;
    /** Worktree to create the thread in; when missing the add button is hidden. */
    worktreeIdForCreate?: string | null;
  }>(),
  { showActions: true, contextBadgeLabel: null, worktreeIdForCreate: null }
);

/** Primary row: badge text matches active context when provided, else `title`. */
const primaryLabelBadgeText = computed(() => {
  if (!props.isPrimary) return null;
  const override = props.contextBadgeLabel?.trim();
  return override || props.title;
});

/** Native tooltip: full path + branch lineage (line breaks render in most desktop browsers). */
const primaryBranchBadge = computed(() => {
  if (!props.isPrimary) return null;
  const b = props.branch?.trim();
  return b ? b : null;
});

const hoverDetails = computed(() => {
  if (props.isPrimary) {
    const branchLine = primaryBranchBadge.value ? `\nBranch: ${primaryBranchBadge.value}` : "";
    return `${props.title}${branchLine}\nDefault project context`;
  }

  const source = props.baseBranch?.trim() ? props.baseBranch : "—";
  return `${props.title}\n${props.path ?? "—"}\nBranch: ${props.branch ?? "—"}\nSource branch: ${source}`;
});

const emit = defineEmits<{
  toggle: [];
  delete: [];
  "add-thread-inline": [worktreeId: string];
}>();

const menuOpen = ref(false);

function openAddThreadDialog(): void {
  const id = props.worktreeIdForCreate?.trim();
  if (!id) return;
  emit("add-thread-inline", id);
}
</script>

<template>
  <div class="px-2 group">
  <div
    v-bind="$attrs"
    data-testid="thread-group-header"
    class="flex h-[30px] cursor-pointer select-none items-center gap-2 px-2.5 bg-accent rounded-sm"
    :class="isStale ? 'opacity-60' : ''"
    role="button"
    :aria-expanded="!collapsed"
    :aria-label="
      isPrimary
        ? primaryBranchBadge
          ? `Context ${title}, branch ${primaryBranchBadge}`
          : `Context ${title}`
        : `Worktree ${title}, branch ${branch}`
    "
    :title="hoverDetails"
    @click="emit('toggle')"
  >
    <component
      :is="collapsed ? ChevronRight : ChevronDown"
      class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
    />
    <span
      class="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs font-medium leading-none text-foreground"
      :class="isStale ? 'text-destructive' : ''"
    >
      <span v-if="!isPrimary" aria-hidden="true" class="shrink-0 font-normal leading-none">🌳</span>
      <span v-else aria-hidden="true" class="shrink-0 font-normal leading-none">⭐️</span>
       {{ primaryLabelBadgeText }}
      <span v-if="!isPrimary || !primaryLabelBadgeText" class="min-w-0 truncate">{{ title }}</span>
    </span>
      <span class="ml-auto flex shrink-0 items-center gap-1.5">      
      <div class="gap-1 h-6 items-center flex">
        <span
          class="flex h-6 pr-2 items-center justify-end tabular-nums text-[10px] leading-none text-muted-foreground"
        >
          {{ threadCount }}
        </span>
        <span v-if="worktreeIdForCreate" class="inline-flex h-6 items-center" @click.stop>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"            
            aria-label="Add thread to group"
            :title="titleWithShortcut('Add thread to group', 'newThreadMenu')"
            @click="openAddThreadDialog"
            class="cursor-pointer"
          >
            <Plus class="size-4" />
          </Button>
        </span>
         <Button
            v-if="showActions"
            type="button"
            variant="ghost"
            size="icon-xs"            
            aria-label="Add thread to group"
            title="Remove thread group"
            @click="emit('delete')"
            class="cursor-pointer"
          >
            <Archive class="size-3.5"/>
          </Button>                
      </div>
    </span>
  </div>
  </div>
</template>
