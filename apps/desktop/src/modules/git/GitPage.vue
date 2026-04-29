<script setup lang="ts">
import SourceControlPanel from "@/components/SourceControlPanel.vue";
import { useActiveWorkspace } from "@/composables/useActiveWorkspace";

const { activeWorktree } = useActiveWorkspace();
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <SourceControlPanel
      v-if="activeWorktree"
      :context-label="activeWorktree.branch"
    />
    <div
      v-else
      class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
    >
      No active worktree.
    </div>
  </div>
</template>
