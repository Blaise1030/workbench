<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useActiveWorkspace } from "@/composables/useActiveWorkspace";
import { takePendingAgentBootstrapForThread } from "@/lib/pendingAgentBootstrapSession";
import TerminalPane from "@/components/TerminalPane.vue";
import type { PendingAgentBootstrap } from "@shared/pendingAgentBootstrap";

const route = useRoute();
const { activeWorktree } = useActiveWorkspace();

const threadId = computed(() => route.params.threadId as string);
const pendingBootstrap = ref<PendingAgentBootstrap | null>(null);

onMounted(() => {
  const tid = threadId.value;
  if (tid) pendingBootstrap.value = takePendingAgentBootstrapForThread(tid);
});

function onBootstrapConsumed(): void {
  pendingBootstrap.value = null;
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-background">
    <TerminalPane
      v-if="activeWorktree && threadId"
      :worktree-id="activeWorktree.id"
      :thread-id="threadId"
      :cwd="activeWorktree.path"
      :pending-agent-bootstrap="pendingBootstrap"
      pty-kind="agent"
      @bootstrap-consumed="onBootstrapConsumed"
    />
    <div
      v-else
      class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
    >
      No active thread.
    </div>
  </div>
</template>
