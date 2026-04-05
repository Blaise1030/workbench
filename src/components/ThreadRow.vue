<script setup lang="ts">
import type { RunStatus, Thread } from "@shared/domain";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { ChevronDown, GripVertical, Pencil, Trash2 } from "lucide-vue-next";
import AgentIcon from "@/components/ui/AgentIcon.vue";

const props = withDefaults(
  defineProps<{
    thread: Thread;
    isActive: boolean;
    /** Icon-only row (narrow sidebar). */
    collapsed?: boolean;
    runStatus?: RunStatus | null;
    /** Terminal needed attention (bell / background output) while this thread was not in view. */
    needsAttention?: boolean;
    isDragging?: boolean;
    isDragTarget?: boolean;
  }>(),
  { collapsed: false }
);

const emit = defineEmits<{
  (e: "dragstart", event: DragEvent): void;
  (e: "dragend", event: DragEvent): void;
  (e: "keyboard-reorder", direction: "up" | "down"): void;
  (e: "select"): void;
  (e: "remove"): void;
  (e: "rename", newTitle: string): void;
}>();

const menuOpen = ref(false);
const rowHovered = ref(false);
const handleFocused = ref(false);
const isEditing = ref(false);
const editValue = ref("");
const menuRootRef = ref<HTMLElement | null>(null);
const editInputRef = ref<HTMLInputElement | null>(null);

const showThreadMenu = computed(
  () => !props.collapsed && !isEditing.value && (rowHovered.value || menuOpen.value)
);

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

function handleDragKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowUp") {
    event.preventDefault();
    emit("keyboard-reorder", "up");
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    emit("keyboard-reorder", "down");
  }
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
    class="relative flex h-9 min-h-9 max-h-9 min-w-0 items-center gap-2.5 rounded-sm"
    :class="[
      props.collapsed ? 'justify-center px-1.5' : 'pl-3 pr-2',
      isActive ? 'bg-accent' : 'hover:bg-accent/50',
      props.isDragging ? 'opacity-60' : '',
      props.isDragTarget ? 'ring-1 ring-border/80' : ''
    ]"
    @mouseenter="rowHovered = true"
    @mouseleave="rowHovered = false"
  >
    <button
      v-if="!collapsed"
      type="button"
      data-testid="thread-drag-handle"
      class="absolute right-8 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground active:cursor-grabbing focus:outline-none"
      :class="[
        props.isDragging ? 'cursor-grabbing opacity-100' : 'cursor-grab',
        rowHovered || props.isDragging || handleFocused ? 'opacity-100' : 'pointer-events-none opacity-0'
      ]"
      draggable="true"
      aria-label="Reorder thread"
      @focus="handleFocused = true"
      @blur="handleFocused = false"
      @dragstart="emit('dragstart', $event)"
      @dragend="emit('dragend', $event)"
      @keydown="handleDragKeydown"
    >
      <GripVertical class="h-3.5 w-3.5" />
    </button>

    <template v-if="collapsed && !isEditing">
      <button
        type="button"
        data-testid="thread-select"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        :aria-current="isActive ? 'true' : undefined"
        :aria-label="thread.title"
        :title="thread.title"
        @click="emit('select')"
      >
        <AgentIcon :agent="thread.agent" :size="14" class="shrink-0" :class="iconClass" />
      </button>
    </template>
    <template v-else>
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
    </template>

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
          class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
          @click="startRename"
        >
          <Pencil class="h-3.5 w-3.5" />
          Rename
        </button>
        <button
          type="button"
          role="menuitem"
          data-testid="thread-delete"
          class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent"
          @click="handleDelete"
        >
          <Trash2 class="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  </div>
</template>
