<script setup lang="ts">
import type { RunStatus, Thread, ThreadAgent } from "@shared/domain";
import { Plus } from "lucide-vue-next";
import ThreadCreateButton from "@/components/ThreadCreateButton.vue";
import ThreadRow from "@/components/ThreadRow.vue";
import ThreadTopBar from "@/components/ThreadTopBar.vue";

defineProps<{
  threads: Thread[];
  activeThreadId: string | null;
  runStatusByThreadId?: Record<string, RunStatus>;
  /** Thread ids whose agent terminal fired attention while not visible. */
  threadsNeedingAttention?: ReadonlySet<string>;
}>();

const emit = defineEmits<{
  createWithAgent: [agent: ThreadAgent];
  select: [threadId: string];
  remove: [threadId: string];
  rename: [threadId: string, newTitle: string];
  collapse: [];
}>();
</script>

<template>
  <aside class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
    <ThreadTopBar
      @create-with-agent="emit('createWithAgent', $event)"
      @collapse="emit('collapse')"
    />
    <section
      v-if="threads.length === 0"
      class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center"
    >
      <span class="text-4xl leading-none" aria-hidden="true">🧵</span>
      <div class="space-y-1">
        <h3 class="text-sm font-semibold text-foreground">No threads yet</h3>
        <p class="max-w-[16rem] text-sm text-muted-foreground">
          Start a thread to launch an agent session for this workspace.
        </p>
      </div>
      <ThreadCreateButton
        aria-label="Add thread"
        title="Add thread"
        size="sm"
        @create-with-agent="emit('createWithAgent', $event)"
      >
        <span class="inline-flex items-center gap-2">
          <Plus class="h-4 w-4" />
          <span>Add thread</span>
        </span>
      </ThreadCreateButton>
    </section>
    <ul v-else class="min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-3 pl-3 pr-1.5 pt-2">
      <li v-for="thread in threads" :key="thread.id">
        <ThreadRow
          :thread="thread"
          :is-active="thread.id === activeThreadId"
          :run-status="runStatusByThreadId?.[thread.id] ?? null"
          :needs-attention="threadsNeedingAttention?.has(thread.id) ?? false"
          @select="emit('select', thread.id)"
          @remove="emit('remove', thread.id)"
          @rename="(title) => emit('rename', thread.id, title)"
        />
      </li>
    </ul>
  </aside>
</template>
