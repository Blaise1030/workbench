<script setup lang="ts">
import type { RunStatus, Thread } from "@shared/domain";
import { computed, nextTick, ref } from "vue";
import { GripVertical, MoreHorizontal, Pencil, Trash2 } from "lucide-vue-next";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";

const props = withDefaults(
  defineProps<{
    thread: Thread;
    isActive: boolean;
    collapsed?: boolean;
    runStatus?: RunStatus | null;
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
const editInputRef = ref<InstanceType<typeof Input> | null>(null);

const showThreadMenu = computed(
  () => !props.collapsed && !isEditing.value && (rowHovered.value || menuOpen.value)
);

const iconClass = computed(() => {
  if (props.needsAttention) {
    return "animate-pulse text-blue-600 dark:text-blue-400";
  }
  switch (props.runStatus) {
    case "running": return "animate-pulse text-foreground";
    case "needsReview": return "animate-pulse text-orange-500";
    case "done": return "text-green-500";
    case "failed": return "text-red-500";
    default: return "text-muted-foreground";
  }
});

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
</script>

<template>
  <div
    data-testid="thread-row"
    class="relative flex h-7 min-h-7 max-h-7 min-w-0 items-center gap-1.5 rounded-sm"
    :class="[
      props.collapsed ? 'justify-center px-1.5' : 'pl-3 pr-2',
      isActive ? 'bg-accent' : 'hover:bg-accent/50',
      props.isDragging ? 'opacity-60' : '',
      props.isDragTarget ? 'ring-1 ring-border/80' : ''
    ]"
    @mouseenter="rowHovered = true"
    @mouseleave="rowHovered = false"
  >
    <div
      v-if="!collapsed"
      data-testid="thread-drag-handle"
      class="absolute right-6 top-1/2 z-10 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground active:cursor-grabbing focus:outline-none"
      :class="[
        props.isDragging ? 'cursor-grabbing opacity-100' : 'cursor-grab',
        rowHovered || props.isDragging || handleFocused ? 'opacity-100' : 'pointer-events-none opacity-0'
      ]"
      role="button"
      tabindex="0"
      draggable="true"
      aria-label="Reorder thread"
      @focus="handleFocused = true"
      @blur="handleFocused = false"
      @dragstart="emit('dragstart', $event)"
      @dragend="emit('dragend', $event)"
      @keydown="handleDragKeydown"
    >
      <GripVertical class="h-2.5 w-2.5" />
    </div>

    <template v-if="collapsed && !isEditing">
      <TooltipProvider :delay-duration="0">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              data-testid="thread-select"
              class="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
              :aria-current="isActive ? 'true' : undefined"
              :aria-label="thread.title"
              @click="emit('select')"
            >
              <AgentIcon :agent="thread.agent" :size="12" class="shrink-0" :class="iconClass" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            data-testid="thread-collapsed-tooltip"
            side="right"
            class="border border-border bg-popover px-2 py-1 font-medium text-popover-foreground shadow-md"
          >
            {{ thread.title }}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </template>
    <template v-else>
      <AgentIcon :agent="thread.agent" :size="12" class="shrink-0" :class="iconClass" />

      <Button
        v-if="!isEditing"
        data-testid="thread-select"
        type="button"
        variant="ghost"
        size="xs"
        class="min-w-0 flex-1 cursor-pointer justify-start truncate text-left text-xs leading-none"
        @click="emit('select')"
      >
        {{ thread.title }}
      </Button>
      <Input
        v-else
        ref="editInputRef"
        v-model="editValue"
        data-testid="thread-rename-input"
        type="text"
        class="min-w-0 flex-1 rounded border border-border bg-background px-1 text-xs leading-none"
        @keydown="handleRenameKeydown"
        @blur="cancelRename"
      />
    </template>

    <DropdownMenu
      v-if="showThreadMenu"
      v-model:open="menuOpen"
    >
      <DropdownMenuTrigger as-child>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          data-testid="thread-menu-trigger"
          class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Thread actions"
        >
          <MoreHorizontal class="h-2.5 w-2.5" stroke-width="2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="min-w-[8rem]">
        <DropdownMenuItem data-testid="thread-rename" class="text-xs" @select="startRename">
          <Pencil class="h-3 w-3 shrink-0" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="thread-delete"
          variant="destructive"
          class="text-xs"
          @select="handleDelete"
        >
          <Trash2 class="h-3 w-3 shrink-0" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
