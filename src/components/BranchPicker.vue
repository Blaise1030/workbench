<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import Input from "@/components/ui/Input.vue";
import NativeSelect from "@/components/ui/NativeSelect.vue";

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
  <div class="mx-2 my-1.5 rounded-md border border-border bg-card p-2.5 shadow-sm">
    <p class="mb-2 text-xs font-semibold text-foreground">New Thread Group</p>

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
      <NativeSelect v-model="baseBranch">
        <option v-for="branch in branches" :key="branch" :value="branch">{{ branch }}</option>
      </NativeSelect>
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
