<script setup lang="ts">
import type { RunStatus, Thread, ThreadAgent } from "@shared/domain";
import ThreadRow from "@/components/ThreadRow.vue";
import ThreadTopBar from "@/components/ThreadTopBar.vue";

defineProps<{
  threads: Thread[];
  activeThreadId: string | null;
  runStatusByThreadId?: Record<string, RunStatus>;
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
    <ul class="min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-3 pl-3 pr-1.5 pt-2">
      <li v-for="thread in threads" :key="thread.id">
        <ThreadRow
          :thread="thread"
          :is-active="thread.id === activeThreadId"
          :run-status="runStatusByThreadId?.[thread.id] ?? null"
          @select="emit('select', thread.id)"
          @remove="emit('remove', thread.id)"
          @rename="(title) => emit('rename', thread.id, title)"
        />
      </li>
    </ul>
  </aside>
</template>
