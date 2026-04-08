<script setup lang="ts">
import type { Worktree } from "@shared/domain";
import { computed } from "vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

const props = defineProps<{
  worktrees: Worktree[];
  activeWorktreeId: string | null;
}>();

const emit = defineEmits<{
  select: [worktreeId: string];
}>();

const activeWorktreeLabel = computed(
  () => props.worktrees.find((worktree) => worktree.id === props.activeWorktreeId)?.branch ?? ""
);

const selectedWorktreeId = computed({
  get: () => props.activeWorktreeId ?? "",
  set: (value: string) => {
    if (value) emit("select", value);
  }
});
</script>

<template>
  <label class="flex items-center gap-2 text-sm">
    <span>Worktree</span>
    <Select v-model="selectedWorktreeId">
      <SelectTrigger class="h-8 min-w-[11rem] bg-background text-sm">
        <SelectValue :placeholder="activeWorktreeLabel || 'Select worktree'">
          {{ activeWorktreeLabel }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="worktree in worktrees" :key="worktree.id" :value="worktree.id">
          {{ worktree.branch }}
        </SelectItem>
      </SelectContent>
    </Select>
  </label>
</template>
