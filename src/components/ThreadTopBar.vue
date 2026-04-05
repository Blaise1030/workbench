<script setup lang="ts">
import type { ThreadAgent } from "@shared/domain";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-vue-next";
import { ref } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import Badge from "@/components/ui/Badge.vue";
import ThreadCreateButton from "@/components/ThreadCreateButton.vue";
import { APP_DISPLAY_NAME } from "@/constants/appMeta";
import { titleWithShortcut } from "@/keybindings/registry";

withDefaults(
  defineProps<{
    /** Product name (serif) beside the Alpha badge. */
    title?: string;
    /** Icon-only header strip (narrow sidebar). */
    collapsed?: boolean;
  }>(),
  { title: APP_DISPLAY_NAME, collapsed: false }
);

const emit = defineEmits<{
  createWithAgent: [agent: ThreadAgent];
  collapse: [];
  expand: [];
}>();

const createButtonRef = ref<InstanceType<typeof ThreadCreateButton> | null>(null);

function openNewThreadMenu(): void {
  createButtonRef.value?.openMenu();
}

defineExpose({ openNewThreadMenu });
</script>

<template>
  <header
    v-if="collapsed"
    class="flex shrink-0 flex-col items-center gap-2 px-1 py-2"
  >
    <span class="sr-only">{{ title }} Alpha</span>
    <BaseButton
      type="button"
      size="icon-xs"
      variant="outline"
      aria-label="Expand threads sidebar"
      :title="titleWithShortcut('Expand threads sidebar', 'toggleThreadSidebar')"
      @click="emit('expand')"
    >
      <PanelLeftOpen class="h-3.5 w-3.5" />
    </BaseButton>
  </header>
  <header v-else class="flex shrink-0 items-center gap-2 px-3 py-2 pr-1.5">
    <h2
      class="m-0 flex min-w-0 flex-1 items-center gap-2 overflow-hidden p-0 text-foreground"
      data-testid="thread-sidebar-brand"
    >
      <span
        class="min-w-0 truncate font-instrument text-lg leading-none tracking-tight"
        data-testid="app-title-a11y"
      >{{ title }}</span>
      <Badge
        variant="secondary"
        class="h-5 shrink-0 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wider"
      >
        Alpha
      </Badge>
    </h2>
    <div class="flex shrink-0 items-center justify-end gap-1.5">
      <ThreadCreateButton ref="createButtonRef" @create-with-agent="emit('createWithAgent', $event)">
        <Plus class="h-3.5 w-3.5" />
      </ThreadCreateButton>
      <BaseButton
        type="button"
        size="icon-xs"
        variant="outline"
        aria-label="Collapse threads sidebar"
        :title="titleWithShortcut('Collapse threads sidebar', 'toggleThreadSidebar')"
        @click="emit('collapse')"
      >
        <PanelLeftClose class="h-3.5 w-3.5" />
      </BaseButton>
    </div>
  </header>
</template>
