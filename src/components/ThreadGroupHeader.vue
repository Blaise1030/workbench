<script setup lang="ts">
import { ChevronDown, ChevronRight, Trash2 } from "lucide-vue-next";
import { ref } from "vue";

const props = defineProps<{
  branch: string;
  baseBranch: string | null;
  threadCount: number;
  isStale: boolean;
  collapsed: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  delete: [];
}>();

const menuOpen = ref(false);

function toggleMenu(e: Event): void {
  e.stopPropagation();
  menuOpen.value = !menuOpen.value;
}
</script>

<template>
  <div
    class="flex cursor-pointer items-center gap-1.5 border-t border-border px-2 py-1.5"
    :class="isStale ? 'opacity-60' : ''"
    role="button"
    :aria-expanded="!collapsed"
    :aria-label="`Thread group ${branch}`"
    @click="emit('toggle')"
  >
    <component
      :is="collapsed ? ChevronRight : ChevronDown"
      class="h-3 w-3 shrink-0 text-muted-foreground"
    />
    <span
      class="shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium leading-none"
      :class="isStale
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : 'border-emerald-600/30 bg-emerald-600/10 text-emerald-500'"
    >
      {{ branch }}
    </span>
    <span
      v-if="baseBranch"
      class="truncate text-[10px] text-muted-foreground"
    >
      from {{ baseBranch }}
    </span>
    <span class="ml-auto flex items-center gap-1">
      <span class="text-[10px] text-muted-foreground">{{ threadCount }}</span>
      <div class="relative">
        <button
          type="button"
          class="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Thread group actions"
          @click="toggleMenu"
        >
          <ChevronDown class="h-2.5 w-2.5" />
        </button>
        <div
          v-if="menuOpen"
          class="absolute right-0 top-full z-50 mt-0.5 min-w-[8rem] rounded-md border border-border bg-popover p-1 shadow-md"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent"
            @click.stop="emit('delete'); menuOpen = false"
          >
            <Trash2 class="h-3.5 w-3.5" />
            Delete group
          </button>
        </div>
      </div>
    </span>
  </div>
</template>
