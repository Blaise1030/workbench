<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, ChevronsUpDown, GitBranch, Loader2 } from "lucide-vue-next";
import {
  Combobox,
  ComboboxAnchor,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxTrigger,
  ComboboxViewport
} from "@/components/ui/combobox";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/composables/useToast";

const props = withDefaults(
  defineProps<{
    /** Footer line, e.g. `folder / main`. */
    branchLine: string | null;
    /** Current `HEAD` short name (from repo status). */
    currentBranch: string;
    projectId: string;
    cwd: string;
    /**
     * When `false`, show a static branch line only (e.g. multi-worktree projects use the sidebar
     * branch / worktree flow instead).
     */
    switcherEnabled?: boolean;
    /** `toolbar` matches the center bar badge (compact); `footer` matches the Git panel footer. */
    variant?: "footer" | "toolbar";
  }>(),
  {
    branchLine: null,
    currentBranch: "",
    switcherEnabled: false,
    variant: "footer"
  }
);

const emit = defineEmits<{
  /** Parent should refresh repo status / snapshot after a successful checkout. */
  branchChanged: [];
}>();

const toast = useToast();
const open = ref(false);
const branches = ref<string[]>([]);
const branchesLoading = ref(false);
const checkoutBusy = ref(false);
const comboboxKey = ref(0);

const canUseApi = computed(() => {
  const api = typeof window !== "undefined" ? window.workspaceApi : undefined;
  return Boolean(
    props.switcherEnabled && api?.listBranches && api?.gitCheckoutBranch && props.projectId && props.cwd
  );
});

const triggerLabel = computed(() => {
  if (props.branchLine?.trim()) return props.branchLine.replace(" / ", "/");
  return "—";
});

/** Toolbar shows the short branch name; footer keeps the full `folder / branch` line. */
const displayTrigger = computed(() => {
  if (props.variant === "toolbar" && props.currentBranch.trim()) return props.currentBranch.trim();
  return triggerLabel.value;
});

const comboboxRootClass = computed(() =>
  props.variant === "toolbar" ? "ms-2 shrink-0" : "min-w-0 flex-1"
);

/** Override default `ComboboxAnchor` width so the toolbar pill sizes to the trigger. */
const comboboxAnchorClass = computed(() =>
  props.variant === "toolbar"
    ? "flex w-auto min-w-0 max-w-full justify-start"
    : "flex w-auto min-w-0 max-w-full"
);

const toolbarTriggerTitle = computed(() => {
  const line = props.branchLine?.trim();
  if (line) return line.replace(" / ", "/");
  if (props.currentBranch.trim()) return props.currentBranch.trim();
  return undefined;
});

const triggerClass = computed(() => {
  const busy = checkoutBusy.value ? "pointer-events-none opacity-60" : "";
  if (props.variant === "toolbar") {
    return cn(
      buttonClass({
        variant: "outline",
        size: "xs",
        className:
          "h-6 min-w-0 max-w-[200px] !justify-start text-start gap-1 px-1.5 font-mono text-[10px] font-normal text-muted-foreground shadow-xs hover:text-accent-foreground"
      }),
      busy
    );
  }
  return cn(
    "flex min-h-0 min-w-0 max-w-full flex-1 items-center gap-1 rounded border border-border/60 bg-background/40 px-1.5 py-0.5 text-left font-mono text-[8px] text-muted-foreground transition-colors",
    "hover:bg-muted/40 hover:text-foreground",
    "outline-none focus-visible:ring-1 focus-visible:ring-ring",
    busy
  );
});

const toolbarStaticClass =
  "ms-2 inline-flex size-6 shrink-0 items-center justify-center rounded-[min(var(--radius-md),10px)] border border-border bg-transparent text-muted-foreground";

watch(open, (isOpen) => {
  if (isOpen) void loadBranches();
});

async function loadBranches(): Promise<void> {
  const api = window.workspaceApi;
  if (!api?.listBranches) return;
  branchesLoading.value = true;
  try {
    branches.value = await api.listBranches(props.projectId);
  } catch (e) {
    toast.error("Could not load branches", e instanceof Error ? e.message : "Something went wrong.");
    branches.value = [];
  } finally {
    branchesLoading.value = false;
  }
}

async function onModelUpdate(branch: string | undefined): Promise<void> {
  if (!branch || branch === props.currentBranch || checkoutBusy.value) return;
  const api = window.workspaceApi;
  if (!api?.gitCheckoutBranch) {
    toast.error("Checkout unavailable", "Use an up-to-date desktop build or run git checkout in the terminal.");
    return;
  }
  checkoutBusy.value = true;
  try {
    await api.gitCheckoutBranch(props.cwd, branch);
    open.value = false;
    toast.success("Switched branch", `Now on \`${branch}\`.`);
    emit("branchChanged");
  } catch (e) {
    toast.error("Checkout failed", e instanceof Error ? e.message : "Something went wrong.");
    comboboxKey.value += 1;
  } finally {
    checkoutBusy.value = false;
  }
}
</script>

<template>
  <div v-if="canUseApi" :class="comboboxRootClass">
    <Combobox
      :key="comboboxKey"
      :model-value="currentBranch || undefined"
      :open="open"
      :disabled="checkoutBusy"
      open-on-click
      @update:open="open = $event"
      @update:model-value="onModelUpdate"
    >
      <ComboboxAnchor :class="comboboxAnchorClass">
        <ComboboxTrigger
          :disabled="checkoutBusy"
          :title="variant === 'toolbar' ? toolbarTriggerTitle : undefined"
          :aria-label="`Current branch: ${displayTrigger}. Open branch switcher.`"
          :class="triggerClass"
        >
          <Loader2 v-if="checkoutBusy" class="size-2.5 shrink-0 animate-spin" aria-hidden="true" />
          <template v-if="variant === 'toolbar'">
            <GitBranch v-if="!checkoutBusy" class="size-3 shrink-0" aria-hidden="true" />
            <span v-if="!checkoutBusy" class="min-w-0 flex-1 truncate text-start">{{ displayTrigger }}</span>
          </template>
          <template v-else>
            <span class="min-w-0 flex-1 truncate">{{ displayTrigger }}</span>
            <ChevronsUpDown class="size-2.5 shrink-0 opacity-60" aria-hidden="true" />
          </template>
        </ComboboxTrigger>
      </ComboboxAnchor>
      <ComboboxList class="min-w-[var(--reka-combobox-anchor-width)] p-0">
        <ComboboxInput placeholder="Search branch…" :disabled="checkoutBusy" />
        <ComboboxViewport>
          <div
            v-if="branchesLoading"
            class="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"
          >
            <Loader2 class="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
            Loading branches…
          </div>
          <template v-else>
            <ComboboxEmpty class="px-3 py-2 text-xs">No branch found.</ComboboxEmpty>
            <ComboboxItem
              v-for="b in branches"
              :key="b"
              :value="b"
              :text-value="b"
              :disabled="checkoutBusy"
              class="justify-start"
            >
              <span
                class="flex size-4 shrink-0 items-center justify-center text-muted-foreground"
                aria-hidden="true"
              >
                <ComboboxItemIndicator>
                  <Check class="size-3.5" />
                </ComboboxItemIndicator>
              </span>
              <span class="min-w-0 flex-1 truncate text-start font-mono text-xs">{{ b }}</span>
            </ComboboxItem>
          </template>
        </ComboboxViewport>
      </ComboboxList>
    </Combobox>
  </div>
  <p
    v-else-if="branchLine && variant === 'footer'"
    class="min-w-0 truncate font-mono text-[8px] text-muted-foreground"
    :title="branchLine"
  >
    {{ branchLine.replace(" / ", "/") }}
  </p>
  <span
    v-else-if="branchLine && variant === 'toolbar'"
    :class="toolbarStaticClass"
    :title="branchLine ?? undefined"
  >
    <span class="sr-only">{{ displayTrigger }}</span>
    <GitBranch class="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
  </span>
  <span v-else-if="variant === 'toolbar'" :class="toolbarStaticClass" title="No branch">
    <span class="sr-only">No branch</span>
    <GitBranch class="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
  </span>
  <span v-else class="text-[9px] text-muted-foreground">—</span>
</template>
