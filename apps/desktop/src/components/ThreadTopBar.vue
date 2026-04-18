<script setup lang="ts">
import { PanelLeftClose, PanelLeftOpen } from "lucide-vue-next";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import WorkbenchLogoMark from "@/components/WorkbenchLogoMark.vue";
import { APP_BRAND_BADGE, APP_PRERELEASE_BADGE } from "@/constants/appMeta";
import type { KeybindingId } from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";

const keybindings = useKeybindingsStore();
function titleWithShortcut(label: string, id: KeybindingId): string {
  return keybindings.titleWithShortcut(label, id);
}

withDefaults(
  defineProps<{
    /** Product name beside the Alpha badge. */
    title?: string;
    /** Icon-only header strip (narrow sidebar). */
    collapsed?: boolean;
    /** Active worktree label (Primary/linked name); sr-only when sidebar is collapsed. */
    contextLabel?: string | null;
  }>(),
  { title: APP_BRAND_BADGE, collapsed: false, contextLabel: null }
);

const emit = defineEmits<{
  collapse: [];
  expand: [];
}>();
</script>

<template>  
  <header class="flex shrink-0 select-none flex-col gap-0 px-1 py-1">
    <div class="flex items-center justify-end gap-2">       
    <Button
      type="button"
      size="icon-sm"
      variant="outline"
      aria-label="Collapse threads sidebar"
      :title="titleWithShortcut('Collapse threads sidebar', 'toggleThreadSidebar')"
      data-testid="thread-sidebar-toggle"
      @click="emit('collapse')"
    >
      <PanelLeftClose class="size-4" />
    </Button>
    </div>    
  </header>
</template>
