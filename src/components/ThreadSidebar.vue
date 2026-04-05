<script setup lang="ts">
import type { Thread } from "@shared/domain";
import { PanelLeftClose, Plus } from "lucide-vue-next";
import BaseButton from "@/components/ui/BaseButton.vue";

defineProps<{
  threads: Thread[];
  activeThreadId: string | null;
}>();

const emit = defineEmits<{
  create: [];
  select: [threadId: string];
  collapse: [];
}>();
</script>

<template>
  <aside class="flex h-full flex-col border-r border-border pt-1 pb-3 pl-3 pr-1.5">
    <header class="mb-3 flex min-w-0 items-center gap-2">
      <h2 class="min-w-0 flex-1 text-sm font-semibold">Threads</h2>
      <div class="flex shrink-0 items-center justify-end gap-1.5">
        <BaseButton
          type="button"
          size="icon-xs"
          variant="outline"
          aria-label="New thread"
          title="New thread"
          @click="emit('create')"
        >
          <Plus class="h-3.5 w-3.5" />
        </BaseButton>
        <BaseButton
          type="button"
          size="icon-xs"
          variant="outline"
          aria-label="Collapse threads sidebar"
          title="Collapse threads sidebar"
          @click="emit('collapse')"
        >
          <PanelLeftClose class="h-3.5 w-3.5" />
        </BaseButton>
      </div>
    </header>
    <ul class="space-y-2">
      <li v-for="thread in threads" :key="thread.id">
        <BaseButton
          variant="ghost"
          size="md"
          class="w-full justify-start text-left"
          :class="thread.id === activeThreadId ? 'bg-accent' : ''"
          @click="emit('select', thread.id)"
        >
          {{ thread.title }}
        </BaseButton>
      </li>
    </ul>
  </aside>
</template>
