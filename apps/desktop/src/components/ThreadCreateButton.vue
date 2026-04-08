<script lang="ts">
import { titleWithShortcut } from "@/keybindings/registry";

export const threadCreateButtonDefaultTitle = titleWithShortcut(
  "New thread",
  "newThreadMenu"
);
</script>

<script setup lang="ts">
import type { ThreadAgent } from "@shared/domain";
import { ref } from "vue";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import Button from "@/components/ui/Button.vue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

withDefaults(
  defineProps<{
    ariaLabel?: string;
    title?: string;
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    size?: "default" | "sm" | "lg" | "icon" | "xs" | "icon-xs";
    buttonClass?: string;
    showNewThreadGroup?: boolean;
  }>(),
  {
    ariaLabel: "New thread",
    title: threadCreateButtonDefaultTitle,
    variant: "outline",
    size: "icon-xs",
    buttonClass: "",
    showNewThreadGroup: true
  }
);

const emit = defineEmits<{
  createWithAgent: [agent: ThreadAgent];
  createWorktreeGroup: [];
}>();

const AGENT_OPTIONS: { agent: ThreadAgent; label: string }[] = [
  { agent: "claude", label: "Claude Code" },
  { agent: "cursor", label: "Cursor Agent" },
  { agent: "codex", label: "Codex CLI" },
  { agent: "gemini", label: "Gemini CLI" }
];

const menuOpen = ref(false);

function openMenu(): void {
  menuOpen.value = true;
}

function pickAgent(agent: ThreadAgent): void {
  emit("createWithAgent", agent);
  menuOpen.value = false;
}

function createGroup(): void {
  emit("createWorktreeGroup");
  menuOpen.value = false;
}

defineExpose({ openMenu });
</script>

<template>
  <DropdownMenu v-model:open="menuOpen">
    <DropdownMenuTrigger as-child>
      <Button
        type="button"
        :size="size"
        :variant="variant"
        :aria-label="ariaLabel"
        :title="title"
        :class="buttonClass"
      >
        <slot />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      data-testid="thread-agent-menu-panel"
      align="start"
      class="w-[15rem] rounded-xl p-1.5"
    >
      <DropdownMenuLabel class="px-2 py-1 text-xs font-semibold leading-tight">
        Add thread
      </DropdownMenuLabel>
      <div class="mt-1.5 flex flex-col gap-1">
        <DropdownMenuItem
          v-for="opt in AGENT_OPTIONS"
          :key="opt.agent"
          :title="opt.label"
          class="justify-start gap-2 rounded-md px-2.5 py-2 text-xs font-medium leading-tight"
          @select="pickAgent(opt.agent)"
        >
          <AgentIcon :agent="opt.agent" :size="18" class="shrink-0" />
          <span class="min-w-0 truncate">{{ opt.label }}</span>
        </DropdownMenuItem>
      </div>
      <template v-if="showNewThreadGroup">
        <DropdownMenuSeparator class="mt-1.5" />
        <DropdownMenuItem
          class="justify-start gap-2 rounded-md px-2.5 py-2 text-xs font-medium leading-tight"
          @select="createGroup"
        >
          <span class="text-base leading-none">🌳</span>
          <span class="min-w-0 truncate">New Thread Group</span>
        </DropdownMenuItem>
        <p class="px-1.5 pt-1 text-start text-[9px] leading-snug text-muted-foreground">
          Uses git worktrees for isolation
        </p>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
