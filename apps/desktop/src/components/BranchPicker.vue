<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { cn } from "@/lib/utils";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

const props = withDefaults(
  defineProps<{
    projectId: string;
    /** Tighter layout when embedded in the thread sidebar footer. */
    variant?: "default" | "footer";
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
const selectedBaseBranch = computed({
  get: () => baseBranch.value,
  set: (value: string) => {
    baseBranch.value = value;
  }
});

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
        'rounded-md border border-border bg-card p-2.5 shadow-sm',
        props.variant === 'footer' ? 'mx-0 my-0 w-full' : 'mx-2 my-1.5'
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

    <!-- Base branch (only when creating a new branch name) -->
    <div v-if="isNewBranchName" class="mb-2">
      <label class="mb-1 block text-[10px] text-muted-foreground">Base branch</label>
      <Select v-model="selectedBaseBranch">
        <SelectTrigger class="h-8 w-full bg-background text-sm">
          <SelectValue placeholder="Choose base branch" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="branch in branches" :key="branch" :value="branch">{{ branch }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-1.5">
      <Button type="button" variant="outline" size="xs" @click="emit('cancel')">
        Cancel
      </Button>
      <Button type="button" size="xs" :disabled="!canCreate" @click="handleCreate">
        Create
      </Button>
    </div>
  </div>
</template>
