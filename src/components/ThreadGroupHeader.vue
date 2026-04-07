<script setup lang="ts">
import { ChevronDown, ChevronRight, EllipsisVertical, Plus, Trash2 } from "lucide-vue-next";
import { onBeforeUnmount, onMounted, ref } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";

defineProps<{
  /** Worktree display name (not the Git branch string). */
  title: string;
  threadCount: number;
  isStale: boolean;
  collapsed: boolean;
  isActive: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  delete: [];
  addThread: [];
}>();

const menuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);

function toggleMenu(e: Event): void {
  e.stopPropagation();
  menuOpen.value = !menuOpen.value;
}

function handleClickOutside(e: MouseEvent): void {
  if (menuOpen.value && menuRef.value && !menuRef.value.contains(e.target as Node)) {
    menuOpen.value = false;
  }
}

onMounted(() => document.addEventListener("mousedown", handleClickOutside));
onBeforeUnmount(() => document.removeEventListener("mousedown", handleClickOutside));
</script>

<template>
  <div
    class="flex h-[30px] cursor-pointer select-none items-center gap-2 border-t border-border px-2.5 hover:bg-accent/50"
    :class="isStale ? 'opacity-60' : ''"
    role="button"
    :aria-expanded="!collapsed"
    :aria-label="`Thread group ${title}`"
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
    <span class="ml-auto flex shrink-0 items-center gap-1">
      <span class="text-[10px] leading-none tabular-nums text-muted-foreground">{{ threadCount }}</span>
      <span class="inline-flex items-center gap-px">
        <BaseButton
          type="button"
          variant="ghost"
          size="icon-xs"
          class="shrink-0 self-center text-muted-foreground"
          aria-label="Add thread to group"
          title="Add thread"
          @click.stop="emit('addThread')"
        >
          <Plus class="h-3.5 w-3.5" />
        </BaseButton>
        <div ref="menuRef" class="relative flex items-center">
          <BaseButton
            type="button"
            variant="ghost"
            size="icon-xs"
            class="shrink-0 self-center text-muted-foreground"
            :aria-expanded="menuOpen"
            aria-haspopup="menu"
            aria-label="Thread group actions"
            title="Group actions"
            @click.stop="toggleMenu"
          >
            <EllipsisVertical class="h-3.5 w-3.5" />
          </BaseButton>
          <div
            v-if="menuOpen"
            class="absolute right-0 top-full z-50 mt-0.5 w-max rounded-md border border-border bg-popover p-1 shadow-md"
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              class="flex items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent"
              @click.stop="emit('delete'); menuOpen = false"
            >
              <Trash2 class="h-3.5 w-3.5" />
              Delete group
            </button>
          </div>
        </div>
      </span>
    </span>
  </div>
</template>
