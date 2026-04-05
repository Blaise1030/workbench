<script setup lang="ts">
import type { RunStatus, Thread } from "@shared/domain";
import { computed, nextTick, ref } from "vue";
import { Pencil, Trash2 } from "lucide-vue-next";
import AgentIcon from "@/components/ui/AgentIcon.vue";

const props = defineProps<{
  thread: Thread;
  isActive: boolean;
  runStatus?: RunStatus | null;
  /** Terminal needed attention (bell / background output) while this thread was not in view. */
  needsAttention?: boolean;
}>();

const emit = defineEmits<{
  select: [];
  remove: [];
  rename: [newTitle: string];
}>();

const rowHovered = ref(false);
const isEditing = ref(false);
const editValue = ref("");
const editInputRef = ref<HTMLInputElement | null>(null);

const showThreadMenu = computed(() => !isEditing.value && rowHovered.value);

const iconClass = computed(() => {
  if (props.needsAttention) {
    return "animate-pulse text-blue-600 dark:text-blue-400";
  }
  switch (props.runStatus) {
    case "running":     return "animate-pulse text-foreground";
    case "needsReview": return "animate-pulse text-orange-500";
    case "done":        return "text-green-500";
    case "failed":      return "text-red-500";
    default:            return "text-muted-foreground";
  }
});

function startRename(): void {
  editValue.value = props.thread.title;
  isEditing.value = true;
  void nextTick(() => {
    editInputRef.value?.focus();
    editInputRef.value?.select();
  });
}

function confirmRename(): void {
  const val = editValue.value.trim();
  if (val) emit("rename", val);
  isEditing.value = false;
}

function cancelRename(): void {
  isEditing.value = false;
}

function handleRenameKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter") confirmRename();
  else if (event.key === "Escape") cancelRename();
}

function handleDelete(): void {
  emit("remove");
}
</script>

<template>
  <div
    data-testid="thread-row"
    class="relative flex h-9 min-h-9 max-h-9 min-w-0 items-center gap-2.5 rounded-sm px-2"
    :class="isActive ? 'bg-accent' : 'hover:bg-accent/50'"
    @mouseenter="rowHovered = true"
    @mouseleave="rowHovered = false"
  >
    <AgentIcon :agent="thread.agent" :size="14" class="shrink-0" :class="iconClass" />

    <button
      v-if="!isEditing"
      data-testid="thread-select"
      type="button"
      class="min-w-0 flex-1 truncate text-left text-sm"
      @click="emit('select')"
    >
      {{ thread.title }}
    </button>
    <input
      v-else
      ref="editInputRef"
      v-model="editValue"
      data-testid="thread-rename-input"
      type="text"
      class="min-w-0 flex-1 rounded border border-border bg-background px-1 text-sm outline-none"
      @keydown="handleRenameKeydown"
      @blur="cancelRename"
    />

    <div
      v-if="showThreadMenu"
      class="relative flex h-7 shrink-0 items-center justify-center gap-1"
    >
      <button
        type="button"
        data-testid="thread-rename"
        class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Rename"
        @click.stop="startRename"
      >
        <Pencil class="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        data-testid="thread-delete"
        class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
        title="Delete"
        @click.stop="handleDelete"
      >
        <Trash2 class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</template>
