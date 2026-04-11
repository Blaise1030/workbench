<script setup lang="ts">
import { PanelLeftClose, PanelLeftOpen } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import Badge from "@/components/ui/Badge.vue";
import Button from "@/components/ui/Button.vue";
import WorkbenchLogoMark from "@/components/WorkbenchLogoMark.vue";
import { APP_BRAND_BADGE, APP_PRERELEASE_BADGE } from "@/constants/appMeta";
import type { KeybindingId } from "@/keybindings/registry";
import { useKeybindingsStore } from "@/stores/keybindingsStore";

const keybindings = useKeybindingsStore();
const appVersionRaw = ref<string | null>(null);

onMounted(() => {
  void (async () => {
    const fn = window.workspaceApi?.getAppVersion;
    if (!fn) return;
    try {
      appVersionRaw.value = await fn();
    } catch {
      appVersionRaw.value = null;
    }
  })();
});

const appVersionDisplay = computed(() => {
  const v = appVersionRaw.value?.trim();
  if (!v) return null;
  return /^v\d/i.test(v) ? v : `v${v}`;
});
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
  <header
    v-if="collapsed"
    class="flex shrink-0 select-none flex-col items-center gap-1.5 px-1"
  >
    <span class="sr-only"
      >{{ APP_BRAND_BADGE }} {{ APP_PRERELEASE_BADGE }} {{ contextLabel ?? "" }}</span
    >
    <div class="min-h-11 flex flex-col items-center gap-1">
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
    <p
      v-if="appVersionDisplay"
      data-testid="thread-topbar-app-version"
      class="max-w-full truncate px-0.5 text-center font-mono text-[8px] leading-none text-muted-foreground"
    >
      {{ appVersionDisplay }}
    </p>
  </header>
  <header v-else class="flex shrink-0 select-none flex-col gap-0 px-3 pb-1">
    <div class="flex min-h-11 items-center gap-2">
      <h2
        class="relative m-0 flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden p-0 text-foreground"
        data-testid="thread-sidebar-brand"
      >
        <WorkbenchLogoMark variant="md" />
        <span
          class="font-app-brand-title block min-w-0 truncate text-base uppercase leading-none text-sidebar-foreground"
          data-testid="thread-topbar-brand-badge"
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
    </div>
    <p
      v-if="appVersionDisplay"
      data-testid="thread-topbar-app-version"
      class="w-full truncate pb-0.5 font-mono text-[10px] leading-none text-muted-foreground"
    >
      {{ appVersionDisplay }}
    </p>
  </header>
</template>
