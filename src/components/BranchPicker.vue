<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";

const props = defineProps<{
  projectId: string;
}>();

const emit = defineEmits<{
  create: [branch: string, baseBranch: string | null];
  cancel: [];
}>();

const branches = ref<string[]>([]);
const loading = ref(true);
const branchInput = ref("");
const isNewBranch = ref(true);
const baseBranch = ref("main");
const showBranchDropdown = ref(false);

const filteredBranches = computed(() => {
  const q = branchInput.value.toLowerCase();
  if (!q) return branches.value;
  return branches.value.filter((b) => b.toLowerCase().includes(q));
});

const canCreate = computed(() => branchInput.value.trim().length > 0);

function getApi(): { listBranches?: (projectId: string) => Promise<string[]> } | null {
  return (typeof window !== "undefined" ? window.workspaceApi : null) as never;
}

onMounted(async () => {
  const api = getApi();
  if (api?.listBranches) {
    try {
      branches.value = await api.listBranches(props.projectId);
      if (branches.value.length > 0) {
        baseBranch.value = branches.value[0];
      }
    } catch {
      branches.value = [];
    }
  }
  loading.value = false;
});

function selectExistingBranch(branch: string): void {
  branchInput.value = branch;
  isNewBranch.value = false;
  showBranchDropdown.value = false;
}

function selectCreateNew(): void {
  isNewBranch.value = true;
  branchInput.value = "";
  showBranchDropdown.value = false;
}

function handleCreate(): void {
  const branch = branchInput.value.trim();
  if (!branch) return;
  emit("create", branch, isNewBranch.value ? baseBranch.value : null);
}
</script>

<template>
  <div class="mx-2 my-1.5 rounded-md border border-border bg-card p-2.5 shadow-sm">
    <p class="mb-2 text-xs font-semibold text-foreground">New Thread Group</p>

    <!-- Branch input -->
    <div class="mb-2">
      <label class="mb-1 block text-[10px] text-muted-foreground">Branch</label>
      <div class="relative">
        <input
          v-model="branchInput"
          type="text"
          class="w-full rounded-sm border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          :placeholder="loading ? 'Loading branches...' : 'Branch name'"
          @focus="showBranchDropdown = true"
        />
        <div
          v-if="showBranchDropdown && !loading"
          class="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-32 overflow-y-auto rounded-sm border border-border bg-popover shadow-md"
        >
          <button
            type="button"
            class="flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs text-emerald-500 hover:bg-accent"
            @click="selectCreateNew"
          >
            Create new branch...
          </button>
          <button
            v-for="branch in filteredBranches"
            :key="branch"
            type="button"
            class="flex w-full items-center px-2 py-1 text-left text-xs text-foreground hover:bg-accent"
            @click="selectExistingBranch(branch)"
          >
            {{ branch }}
          </button>
        </div>
      </div>
    </div>

    <!-- Base branch (only for new branches) -->
    <div v-if="isNewBranch" class="mb-2">
      <label class="mb-1 block text-[10px] text-muted-foreground">Base branch</label>
      <select
        v-model="baseBranch"
        class="w-full rounded-sm border border-border bg-background px-2 py-1 text-xs text-foreground"
      >
        <option v-for="branch in branches" :key="branch" :value="branch">{{ branch }}</option>
      </select>
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-1.5">
      <BaseButton type="button" variant="outline" size="xs" @click="emit('cancel')">
        Cancel
      </BaseButton>
      <BaseButton type="button" size="xs" :disabled="!canCreate" @click="handleCreate">
        Create
      </BaseButton>
    </div>
  </div>
</template>
