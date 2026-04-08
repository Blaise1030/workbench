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
    /** PTY went idle in the background — row highlights until the user opens this thread. */
    needsIdleAttention?: boolean;
    isDragging?: boolean;
    isDragTarget?: boolean;
  }>(),
  { collapsed: false, needsIdleAttention: false }
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

/** Human-readable for tooltips and aria-label. Omitted when idle (no subtext). */
const statusDetail = computed((): string | null => {
  if (props.needsIdleAttention) {
    return "Needs attention";
  }
  const rs = props.runStatus ?? null;

  if (rs === null) return null;
  switch (rs) {
    case "running":
      return "Agent running";
    case "needsReview":
      return "Needs your review";
    case "failed":
      return "Failed";
    case "done":
      return "Finished";
    default:
      return null;
  }
});

const rowAriaLabel = computed(() => {
  const d = statusDetail.value;
  return d ? `${props.thread.title} — ${d}` : props.thread.title;
});

const iconClass = computed(() => {
  if (props.needsIdleAttention) {
    return "text-blue-600 dark:text-blue-400";
  }
  switch (props.runStatus) {
    case "running": return "animate-pulse text-green-600 dark:text-green-400";
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
      props.needsIdleAttention
        ? 'bg-blue-500/12 ring-1 ring-blue-500/45 dark:bg-blue-400/14 dark:ring-blue-400/50'
        : isActive
          ? 'bg-accent'
          : 'hover:bg-accent/50',
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
              :aria-label="rowAriaLabel"
              @click="emit('select')"
            >
              <AgentIcon :agent="thread.agent" :size="12" class="shrink-0" :class="iconClass" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            data-testid="thread-collapsed-tooltip"
            side="right"
            class="max-w-[min(24rem,calc(100vw-2rem))] border border-border bg-popover px-2 py-1.5 text-popover-foreground shadow-md"
          >
            <div class="break-words font-medium leading-tight">{{ thread.title }}</div>
            <div
              v-if="statusDetail"
              class="mt-0.5 text-xs leading-snug text-muted-foreground"
            >
              {{ statusDetail }}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </template>
    <template v-else>
      <template v-if="!isEditing">
        <div class="min-w-0 flex-1 overflow-hidden">
          <TooltipProvider :delay-duration="300">
            <Tooltip>
              <TooltipTrigger as-child>
                <span
                  data-testid="thread-select"
                  class="flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                  tabindex="0"
                  role="button"
                  :aria-current="isActive ? 'true' : undefined"
                  :aria-label="rowAriaLabel"
                  @click="emit('select')"
                  @keydown.enter.prevent="emit('select')"
                  @keydown.space.prevent="emit('select')"
                >
                  <AgentIcon :agent="thread.agent" :size="12" class="shrink-0" :class="iconClass" />
                  <span
                    data-testid="thread-title-truncated"
                    class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-xs leading-none text-foreground"
                  >
                    {{ thread.title }}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" class="max-w-[min(24rem,calc(100vw-2rem))] text-xs">
                <div class="break-words font-medium leading-snug">{{ thread.title }}</div>
                <div v-if="statusDetail" class="mt-1 text-muted-foreground">{{ statusDetail }}</div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </template>
      <template v-else>
        <AgentIcon :agent="thread.agent" :size="12" class="shrink-0" :class="iconClass" />
        <Input
          ref="editInputRef"
          v-model="editValue"
          data-testid="thread-rename-input"
          type="text"
          class="min-w-0 flex-1 rounded border border-border bg-background px-1 text-xs leading-none"
          @keydown="handleRenameKeydown"
          @blur="cancelRename"
        />
      </template>
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
