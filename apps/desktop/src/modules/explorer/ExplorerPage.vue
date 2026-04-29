<script setup lang="ts">
import FileSearchEditor from "@/components/FileSearchEditor.vue";
import { useActiveWorkspace } from "@/composables/useActiveWorkspace";

const { activeWorktree, activeThreadId } = useActiveWorkspace();
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <FileSearchEditor
      v-if="activeWorktree"
      :worktree-id="activeWorktree.id"
      :worktree-path="activeWorktree.path"
      :active-thread-id="activeThreadId"
    />
    <div
      v-else
      class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
    >
      No active worktree.
    </div>
  </div>
</template>
