<script setup lang="ts">
import { PanelLeftClose, PanelLeftOpen } from "lucide-vue-next";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import WorkbenchLogoMark from "@/components/WorkbenchLogoMark.vue";
import { APP_DISPLAY_NAME } from "@/constants/appMeta";
import { titleWithShortcut } from "@/keybindings/registry";

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
  collapse: [];
  expand: [];
}>();
</script>

<template>
  <header
    v-if="collapsed"
    class="flex shrink-0 select-none flex-col items-center gap-2 px-1"
  >
    <span class="sr-only">{{ title }} Alpha</span>
    <div class="min-h-11 flex items-center">
      <WorkbenchLogoMark variant="md" />
    </div>
    <Button
      type="button"
      size="icon-xs"
      variant="outline"
      aria-label="Expand threads sidebar"
      :title="titleWithShortcut('Expand threads sidebar', 'toggleThreadSidebar')"
      data-testid="thread-sidebar-toggle"
      @click="emit('expand')"
    >
      <PanelLeftOpen class="h-3.5 w-3.5" />
    </Button>
  </header>
  <header v-else class="flex min-h-11 shrink-0 select-none items-center gap-2 px-3">
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
    <Button
      type="button"
      size="icon-xs"
      variant="outline"
      aria-label="Collapse threads sidebar"
      :title="titleWithShortcut('Collapse threads sidebar', 'toggleThreadSidebar')"
      data-testid="thread-sidebar-toggle"
      @click="emit('collapse')"
    >
      <PanelLeftClose class="h-3.5 w-3.5" />
    </Button>
  </header>
</template>
