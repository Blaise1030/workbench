<script setup lang="ts">
defineOptions({ name: "ThreadSidebarNodes" });

import type { RunStatus, Thread } from "@shared/domain";
import { computed } from "vue";
import { Plus } from "lucide-vue-next";
import ThreadRow from "@/components/ThreadRow.vue";
import Button from "@/components/ui/Button.vue";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { groupThreadsByRelativeDate } from "@/lib/threadDateGroups";

export type ThreadSidebarNodeData =
  | {
      kind: "context";
      id: string;
      title: string;
      /** true = non-primary worktree; shows "Delete context" in context menu */
      isWorktree: boolean;
      isPrimary: boolean;
      isStale: boolean;
      branch: string | null;
      threads: ThreadSidebarNodeData[];
      showMore: boolean;
      showLess: boolean;
    }
  | {
      kind: "thread";
      thread: Thread;
      isActive: boolean;
      runStatus: RunStatus | null;
      needsIdleAttention: boolean;
      hideAgentIcon: boolean;
    };

type ThreadNode = Extract<ThreadSidebarNodeData, { kind: "thread" }>;

type SubgroupWithNodes = {
  label: string;
  nodes: ThreadNode[];
};

const props = defineProps<{
  node: ThreadSidebarNodeData;
  expandedContexts: Set<string>;
  collapsed?: boolean;
}>();

const emit = defineEmits<{
  toggleContext: [id: string];
  addThread: [contextId: string];
  deleteContext: [id: string];
  expandThreadList: [contextId: string];
  collapseThreadList: [contextId: string];
  selectThread: [threadId: string];
  removeThread: [threadId: string];
  renameThread: [threadId: string, newTitle: string];
}>();

const isExpanded = computed(
  () => props.node.kind === "context" && props.expandedContexts.has(props.node.id)
);

const subgroupsWithNodes = computed((): SubgroupWithNodes[] => {
  if (props.node.kind !== "context") return [];
  const threadNodes = props.node.threads.filter(
    (n): n is ThreadNode => n.kind === "thread"
  );
  const nodeMap = new Map(threadNodes.map((n) => [n.thread.id, n]));
  return groupThreadsByRelativeDate(threadNodes.map((n) => n.thread)).map((sg) => ({
    label: sg.label,
    nodes: sg.threads.map((t) => nodeMap.get(t.id)!).filter(Boolean),
  }));
});
</script>

<template>
  <!-- Context node = directory -->
  <li v-if="node.kind === 'context'">
    <ContextMenu>
      <ContextMenuTrigger as-child>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          class="flex w-full min-w-0 max-w-none items-center justify-start gap-1.5 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted"
          :class="node.isStale ? 'text-destructive' : 'text-foreground'"
          @click="emit('toggleContext', node.id)"
        >
          <span class="w-3.5 shrink-0 text-center text-[10px] leading-none text-muted-foreground">
            {{ isExpanded ? "▾" : "▸" }}
          </span>
          <span class="min-w-0 flex-1 truncate font-medium">{{ node.title }}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            class="ml-auto h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground"
            :aria-label="`Add thread to ${node.title}`"
            @click.stop="emit('addThread', node.id)"
          >
            <Plus class="h-3 w-3" />
          </Button>
        </Button>
      </ContextMenuTrigger>
      <ContextMenuContent class="min-w-[11rem]">
        <ContextMenuItem
          v-if="node.isWorktree"
          variant="destructive"
          class="text-xs"
          @select="emit('deleteContext', node.id)"
        >
          Delete context
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>

    <ul
      v-if="isExpanded"
      class="ml-3 space-y-0.5 border-l border-border/60 pl-2"
    >
      <template v-for="(sg, sgIdx) in subgroupsWithNodes" :key="sgIdx">
        <li role="presentation" class="list-none pb-0.5 pt-2 first:pt-0">
          <span class="text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {{ sg.label }}
          </span>
        </li>
        <li
          v-for="threadNode in sg.nodes"
          :key="threadNode.thread.id"
          class="min-w-0"
        >
          <ThreadRow
            :thread="threadNode.thread"
            :is-active="threadNode.isActive"
            :run-status="threadNode.runStatus"
            :needs-idle-attention="threadNode.needsIdleAttention"
            :hide-agent-icon="threadNode.hideAgentIcon"
            :collapsed="collapsed"
            @select="emit('selectThread', threadNode.thread.id)"
            @remove="emit('removeThread', threadNode.thread.id)"
            @rename="(title) => emit('renameThread', threadNode.thread.id, title)"
          />
        </li>
      </template>
      <li v-if="node.showMore" class="flex justify-center px-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="xs"
          class="w-auto shrink-0"
          @click="emit('expandThreadList', node.id)"
        >
          Show more threads
        </Button>
      </li>
      <li v-if="node.showLess" class="flex justify-center px-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="xs"
          class="w-auto shrink-0"
          @click="emit('collapseThreadList', node.id)"
        >
          Show less
        </Button>
      </li>
    </ul>
  </li>

  <!-- Thread node = file (leaf; direct embed of ThreadRow) -->
  <li v-else-if="node.kind === 'thread'" class="min-w-0">
    <ThreadRow
      :thread="node.thread"
      :is-active="node.isActive"
      :run-status="node.runStatus"
      :needs-idle-attention="node.needsIdleAttention"
      :hide-agent-icon="node.hideAgentIcon"
      :collapsed="collapsed"
      @select="emit('selectThread', node.thread.id)"
      @remove="emit('removeThread', node.thread.id)"
      @rename="(title) => emit('renameThread', node.thread.id, title)"
    />
  </li>
</template>
