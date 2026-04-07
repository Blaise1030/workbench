<script setup lang="ts">
import type { ThreadAgent } from "@shared/domain";
import { Plus } from "lucide-vue-next";
import { ref } from "vue";
import Badge from "@/components/ui/Badge.vue";
import WorkbenchLogoMark from "@/components/WorkbenchLogoMark.vue";
import ThreadCreateButton from "@/components/ThreadCreateButton.vue";
import { APP_DISPLAY_NAME } from "@/constants/appMeta";

withDefaults(
  defineProps<{
    /** Product name beside the Alpha badge. */
    title?: string;
    /** Icon-only header strip (narrow sidebar). */
    collapsed?: boolean;
  }>(),
  { title: APP_DISPLAY_NAME, collapsed: false }
);

const emit = defineEmits<{
  createWithAgent: [agent: ThreadAgent];
  createWorktreeGroup: [];
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
    class="flex shrink-0 select-none justify-center px-1 py-3"
  >
    <span class="sr-only">{{ title }} Alpha</span>
    <WorkbenchLogoMark variant="md" />
  </header>
  <header v-else class="flex shrink-0 select-none items-center gap-1 px-3 py-2.5">
    <h2
      class="relative m-0 flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden p-0 text-foreground"
      data-testid="thread-sidebar-brand"
    >
      <WorkbenchLogoMark variant="md" />      
        <span
          class="font-app-brand-title block min-w-0 truncate text-base uppercase leading-none text-sidebar-foreground"
          data-testid="app-title-a11y"
        >{{ title }}</span>             
         <Badge
           variant="outline"
          data-testid="thread-sidebar-alpha-badge"
          class="shadow-xs ms-0.5 h-3.5 mt-0.5 min-h-0 rounded-sm !px-1 !py-0 text-[8px] font-semibold uppercase leading-none tracking-wide"
        >
          Alpha
        </Badge>
    </h2>
    <div class="flex shrink-0 items-center justify-end">
      <ThreadCreateButton
        ref="createButtonRef"
        variant="outline"
        @create-with-agent="emit('createWithAgent', $event)"
        @create-worktree-group="emit('createWorktreeGroup')"
      >
        <Plus class="h-3.5 w-3.5" />
      </ThreadCreateButton>
    </div>
  </header>
</template>
