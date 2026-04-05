<script setup lang="ts">
import type { Worktree } from "@shared/domain";

defineProps<{
  worktrees: Worktree[];
  activeWorktreeId: string | null;
}>();

const emit = defineEmits<{
  select: [worktreeId: string];
}>();
</script>

<template>
  <label class="flex items-center gap-2 text-sm">
    <span>Worktree</span>
    <select
      class="rounded-md border border-input bg-background px-2 py-1"
      :value="activeWorktreeId ?? ''"
      @change="emit('select', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="worktree in worktrees" :key="worktree.id" :value="worktree.id">
        {{ worktree.branch }}
      </option>
    </select>
  </label>
</template>
