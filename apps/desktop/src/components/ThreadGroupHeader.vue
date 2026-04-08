<script setup lang="ts">
import type { ThreadAgent } from "@shared/domain";
import { ChevronDown, ChevronRight, EllipsisVertical, Plus, Trash2 } from "lucide-vue-next";
import { computed, ref } from "vue";
import ThreadCreateButton from "@/components/ThreadCreateButton.vue";
import Button from "@/components/ui/Button.vue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

const props = defineProps<{
  /** Worktree display name (not the Git branch string). */
  title: string;
  /** Checked-out branch in this worktree. */
  branch: string;
  /** Branch this worktree was created from (e.g. main), if known. */
  baseBranch: string | null;
  /** Absolute path to the worktree on disk. */
  path: string;
  threadCount: number;
  isStale: boolean;
  collapsed: boolean;
  isActive: boolean;
}>();

/** Native tooltip: full path + branch lineage (line breaks render in most desktop browsers). */
const hoverDetails = computed(() => {
  const source = props.baseBranch?.trim() ? props.baseBranch : "—";
  return `${props.title}\n${props.path}\nBranch: ${props.branch}\nSource branch: ${source}`;
});

const emit = defineEmits<{
  toggle: [];
  delete: [];
  addThread: [agent: ThreadAgent];
}>();

const menuOpen = ref(false);
</script>

<template>
  <div
    class="flex h-[30px] cursor-pointer select-none items-center gap-2 border-t border-border px-2.5 hover:bg-accent/50"
    :class="isStale ? 'opacity-60' : ''"
    role="button"
    :aria-expanded="!collapsed"
    :aria-label="`Worktree ${title}, branch ${branch}`"
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
      <span aria-hidden="true" class="shrink-0 font-normal leading-none">🌳</span>
      <span class="min-w-0 truncate">{{ title }}</span>
    </span>
    <span class="ml-auto flex shrink-0 items-center gap-1.5">
      <span
        class="flex h-6 min-w-[1.25rem] items-center justify-end tabular-nums text-[10px] leading-none text-muted-foreground"
      >
        {{ threadCount }}
      </span>
      <span class="inline-flex h-6 items-center gap-px">
        <span class="inline-flex h-6 items-center" @click.stop>
          <ThreadCreateButton
            variant="ghost"
            size="icon-xs"
            class="shrink-0 text-muted-foreground"
            aria-label="Add thread to group"
            title="Add thread (choose agent)"
            :show-new-thread-group="false"
            @create-with-agent="emit('addThread', $event)"
          >
            <Plus class="h-3.5 w-3.5" />
          </ThreadCreateButton>
        </span>
        <DropdownMenu v-model:open="menuOpen">
          <DropdownMenuTrigger as-child @click.stop>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              class="shrink-0 text-muted-foreground"
              :aria-expanded="menuOpen"
              aria-label="Thread group actions"
              title="Group actions"
            >
              <EllipsisVertical class="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-max">
            <DropdownMenuItem variant="destructive" @select="emit('delete')">
              <Trash2 class="h-3.5 w-3.5" />
              Delete group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </span>
  </div>
</template>
