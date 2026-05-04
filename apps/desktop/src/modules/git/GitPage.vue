<script setup lang="ts">
import { ref } from "vue";
import SourceControlPanel from "@/components/SourceControlPanel.vue";
import RemotePrPanel from "./RemotePrPanel.vue";
import PillTabs from "@/components/ui/PillTabs.vue";
import { useActiveWorkspace } from "@/composables/useActiveWorkspace";
import type { PillTabItem } from "@/components/ui/PillTabs.vue";

const { activeWorktree } = useActiveWorkspace();

const activeTab = ref("local");

const tabs: PillTabItem[] = [
  { value: "local", label: "Local" },
  { value: "prs", label: "Pull Requests" },
];
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex h-9 items-center border-b border-border px-2">
      <PillTabs v-model="activeTab" :tabs="tabs" aria-label="Git view" />
    </div>

    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <template v-if="activeWorktree">
        <SourceControlPanel
          v-if="activeTab === 'local'"
          :context-label="activeWorktree.branch"
        />
        <RemotePrPanel
          v-else
          :cwd="activeWorktree.path"
        />
      </template>
      <div
        v-else
        class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
      >
        No active worktree.
      </div>
    </div>
  </div>
</template>
