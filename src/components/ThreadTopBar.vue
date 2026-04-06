<script setup lang="ts">
import type { ThreadAgent } from "@shared/domain";
import { Plus } from "lucide-vue-next";
import { ref } from "vue";
import Badge from "@/components/ui/Badge.vue";
import InstrumentalLogoMark from "@/components/InstrumentalLogoMark.vue";
import ThreadCreateButton from "@/components/ThreadCreateButton.vue";
import { APP_DISPLAY_NAME } from "@/constants/appMeta";

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
    class="flex shrink-0 justify-center px-1 py-3"
  >
    <span class="sr-only">{{ title }} Alpha</span>
    <InstrumentalLogoMark variant="md" />
  </header>
  <header v-else class="flex shrink-0 items-center gap-2 px-3 py-2">
    <h2
      class="m-0 flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-hidden p-0 text-foreground"
      data-testid="thread-sidebar-brand"
    >
      <InstrumentalLogoMark variant="md" />
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
    <div class="flex shrink-0 items-center justify-end">
      <ThreadCreateButton ref="createButtonRef" @create-with-agent="emit('createWithAgent', $event)">
        <Plus class="h-3.5 w-3.5" />
      </ThreadCreateButton>
    </div>
  </header>
</template>
