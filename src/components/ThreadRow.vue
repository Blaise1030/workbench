<script setup lang="ts">
import type { RunStatus, Thread } from "@shared/domain";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { ChevronDown } from "lucide-vue-next";
import AgentIcon from "@/components/ui/AgentIcon.vue";

const props = defineProps<{
  thread: Thread;
  isActive: boolean;
  runStatus?: RunStatus | null;
}>();

const emit = defineEmits<{
  select: [];
  remove: [];
  rename: [newTitle: string];
}>();

const menuOpen = ref(false);
const rowHovered = ref(false);
const isEditing = ref(false);
const editValue = ref("");
const menuRootRef = ref<HTMLElement | null>(null);
const editInputRef = ref<HTMLInputElement | null>(null);

const showThreadMenu = computed(() => !isEditing.value && (rowHovered.value || menuOpen.value));

const iconClass = computed(() => {
  switch (props.runStatus) {
    case "running":     return "animate-pulse text-foreground";
    case "needsReview": return "animate-pulse text-orange-500";
    case "done":        return "text-green-500";
    case "failed":      return "text-red-500";
    default:            return "text-muted-foreground";
  }
});

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
}

function closeMenu(): void {
  menuOpen.value = false;
}

function startRename(): void {
  closeMenu();
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
  closeMenu();
  emit("remove");
}

function onDocumentPointerDown(event: MouseEvent): void {
  if (!menuOpen.value) return;
  if (menuRootRef.value && !menuRootRef.value.contains(event.target as Node)) {
    closeMenu();
  }
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") closeMenu();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeydown);
});
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
      ref="menuRootRef"
      class="relative flex h-7 w-7 shrink-0 items-center justify-center"
    >
      <button
        type="button"
        data-testid="thread-menu-trigger"
        class="flex h-full w-full items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Thread actions"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        @click.stop="toggleMenu"
      >
        <ChevronDown class="h-2.5 w-2.5" stroke-width="2.5" />
      </button>
      <div
        v-if="menuOpen"
        class="absolute right-0 top-full z-50 mt-0.5 min-w-[8rem] rounded-md border border-border bg-popover p-1 shadow-md"
        role="menu"
      >
        <button
          type="button"
          role="menuitem"
          data-testid="thread-rename"
          class="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
          @click="startRename"
        >
          Rename
        </button>
        <button
          type="button"
          role="menuitem"
          data-testid="thread-delete"
          class="w-full rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent"
          @click="handleDelete"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
</template>
