<script setup lang="ts">
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { Check, ChevronDown, GitBranch, Loader2 } from "lucide-vue-next";
import { computed, ref } from "vue";
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
import { useToast } from "@/composables/useToast";
import { useAppContext } from "@/app-context/useAppContext";
import Button from "./ui/button/Button.vue";

const props = defineProps<{
  cwd: string;
}>();

const appContext = useAppContext();
const queryClient = useQueryClient();
const toast = useToast();

const emit = defineEmits<{
  branchChanged: [];
}>();

const open = ref(false);
const checkoutBusy = ref(false);
const comboboxKey = ref(0);
const cwdRef = computed(() => props.cwd);

const { data: currentBranch } = useQuery({
  queryKey: ["currentBranch", cwdRef],
  enabled: computed(() => Boolean(cwdRef.value)),
  queryFn: async () => {
    const cwd = cwdRef.value;
    if (!cwd) return "";
    return appContext.value.gitService.getCurrentBranch(cwd);
  },
  staleTime: 0,
  refetchInterval: 12_000,
  refetchOnWindowFocus: true,
  refetchIntervalInBackground: false
});

const branchModel = computed(() => currentBranch.value ?? "");

const { data: branches, isPending: branchesLoading } = useQuery({
  queryKey: ["trackedHeadBranch", cwdRef],
  enabled: computed(() => Boolean(cwdRef.value)),
  queryFn: async () => {
    const cwd = cwdRef.value;
    if (!cwd) return [];
    return appContext.value.gitService.listBranchesExcludingWorktrees(cwd);
  },
  staleTime: 0,
  refetchInterval: 12_000,
  refetchOnWindowFocus: true,
  refetchIntervalInBackground: false
});

async function onModelUpdate(value: unknown): Promise<void> {
  if (checkoutBusy.value) return;
  if (typeof value !== "string" || !value) return;
  const branch = value;
  if (branch === branchModel.value) return;
  const cwd = cwdRef.value;
  if (!cwd) return;
  checkoutBusy.value = true;
  try {
    await appContext.value.gitService.checkoutBranch(cwd, branch);
    open.value = false;
    toast.success("Switched branch", `Now on \`${branch}\`.`);
    await queryClient.invalidateQueries({ queryKey: ["currentBranch"] });
    await queryClient.invalidateQueries({ queryKey: ["trackedHeadBranch"] });
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
  <Combobox
    :key="comboboxKey"
    :model-value="branchModel"
    :open="open"
    :disabled="checkoutBusy"
    open-on-click
    @update:open="open = $event"
    @update:model-value="onModelUpdate"    
  >
    <ComboboxAnchor>
      <ComboboxTrigger
        type="button"
        as-child
        :disabled="checkoutBusy"
      >
        <Button variant="outline" size="sm" class="w-full">
          <Loader2 v-if="checkoutBusy" class="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
          <template v-else>
            <GitBranch class="size-3.5 shrink-0 opacity-80" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-start">{{ branchModel }}</span>
            <ChevronDown class="size-3 shrink-0 opacity-60" aria-hidden="true" />
          </template>
        </Button>
      </ComboboxTrigger>
    </ComboboxAnchor>
    <ComboboxList align="center" class="min-w-[240px]">
      <div class="p-1">
        <ComboboxInput placeholder="Search branch…" class="text-xs" />
      </div>      
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
            checked="true"
            :value="b"
            :text="b"
            class="justify-start"
          >                      
            <span class="min-w-0 flex-1 truncate text-start text-xs">{{ b }}</span>
          </ComboboxItem>
        </template>
      </ComboboxViewport>
    </ComboboxList>
  </Combobox>
</template>
