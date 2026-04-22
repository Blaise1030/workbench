<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { cn } from "@/lib/utils";
import ScmBranchCombobox from "@/components/ScmBranchCombobox.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";

const props = withDefaults(
  defineProps<{
    projectId: string;
    /** Tighter layout when embedded in the thread sidebar footer. */
    variant?: "default" | "footer" | "popover";
  }>(),
  { variant: "default" }
);

const emit = defineEmits<{
  create: [branch: string, baseBranch: string | null];
  cancel: [];
}>();

const branches = ref<string[]>([]);
const loading = ref(true);
const branchInput = ref("");
const baseBranch = ref("");

const branchTrimmed = computed(() => branchInput.value.trim());

/** True when the typed name is a new branch (not an existing local branch name). */
const isNewBranchName = computed(() => {
  const t = branchTrimmed.value;
  if (!t.length) return false;
  return !branches.value.includes(t);
});

const canCreate = computed(() => branchTrimmed.value.length > 0);

function getApi(): { listBranches?: (projectId: string) => Promise<string[]> } | null {
  return (typeof window !== "undefined" ? window.workspaceApi : null) as never;
}

onMounted(async () => {
  const api = getApi();
  if (api?.listBranches) {
    try {
      branches.value = await api.listBranches(props.projectId);
      if (branches.value.length > 0) {
        baseBranch.value = branches.value[0]!;
      }
    } catch {
      branches.value = [];
    }
  }
  loading.value = false;
});

function handleCreate(): void {
  const branch = branchTrimmed.value;
  if (!branch) return;
  const base = isNewBranchName.value ? baseBranch.value : null;
  emit("create", branch, base);
}
</script>

<template>
  <div
    :class="
      cn(
        'rounded-md border border-border bg-background/40 p-2.5 shadow-sm',
        props.variant === 'footer'
          ? 'mx-0 my-0 w-full'
          : props.variant === 'popover'
            ? 'mx-0 my-0 w-full border-0 bg-transparent p-0 shadow-none'
            : 'mx-2 my-1.5'
      )
    "
  >
    <p class="mb-2 text-xs font-semibold text-foreground">Add worktree</p>

    <!-- Branch input -->
    <div class="mb-2">
      <label class="mb-1 block text-[10px] text-muted-foreground">Branch</label>
      <Input
        v-model="branchInput"
        :disabled="loading"
        :placeholder="loading ? 'Loading branches...' : 'Branch name'"
      />
    </div>

    <!-- Base branch (only when creating a new branch name) — same searchable branch control as the toolbar -->
    <div v-if="isNewBranchName" class="mb-2">
      <label class="mb-1 block text-[10px] text-muted-foreground">Base branch</label>
      <ScmBranchCombobox
        v-if="!loading && branches.length > 0"
        v-model:current-branch="baseBranch"        
        mode="pick"
        variant="footer"
        :branch-line="null"
        :project-id="projectId"
      />
      <p
        v-else-if="!loading"
        class="rounded-md border border-border/60 bg-muted/20 px-2 py-2 text-xs text-muted-foreground"
      >
        No local branches to branch from.
      </p>
      <div
        v-else
        class="flex h-8 items-center rounded-md border border-border/60 bg-muted/10 px-2 text-xs text-muted-foreground"
      >
        Loading branches…
      </div>
    </div>

    <!-- Actions: primary Create is full-width and large; optional Cancel sits above when not footer. -->
    <div class="flex w-full flex-col gap-2">
      <div v-if="props.variant === 'default'" class="flex justify-end">
        <Button type="button" variant="outline" size="sm" @click="emit('cancel')">
          Cancel
        </Button>
      </div>
      <Button
        type="button"
        size="lg"
        class="w-full"
        :disabled="!canCreate"
        @click="handleCreate"
      >
        Create
      </Button>
    </div>
  </div>
</template>
