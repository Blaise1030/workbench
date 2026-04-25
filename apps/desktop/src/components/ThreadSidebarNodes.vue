<script setup lang="ts">
defineOptions({ name: "ThreadSidebarNodes" });

import type { RunStatus, Thread } from "@shared/domain";
import { computed } from "vue";
import { Plus, Archive, ChevronDown, ChevronUp} from "lucide-vue-next";
import ThreadRow from "@/components/ThreadRow.vue";
import WorktreeStaleCallout from "@/components/WorktreeStaleCallout.vue";
import {Button} from "@/components/ui/button";;
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { groupThreadsByRelativeDate } from "@/lib/threadDateGroups";

/** Leaf node shape; context rows reference only these as `threads` children. */
export type ThreadSidebarThreadNode = {
  kind: "thread";
  thread: Thread;
  isActive: boolean;
  runStatus: RunStatus | null;
  needsIdleAttention: boolean;
  hideAgentIcon: boolean;
};

export type ThreadSidebarNodeData =
  | {
      kind: "context";
      id: string;
      /** Worktree id for `addThreadInline` — matches `worktreeIdForGroupAdd` semantics (not always equal to `id` / uiKey). */
      addThreadTargetId: string | null;
      title: string;
      /** true = non-primary worktree; shows "Delete context" in context menu */
      isWorktree: boolean;
      isPrimary: boolean;
      isStale: boolean;
      branch: string | null;
      threads: ThreadSidebarThreadNode[];
      showMore: boolean;
      showLess: boolean;
    }
  | ThreadSidebarThreadNode;

type ThreadNode = ThreadSidebarThreadNode;

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
  addThread: [worktreeId: string];
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
  const threadNodes = props.node.threads;
  const nodeMap = new Map(threadNodes.map((n) => [n.thread.id, n] as const));
  return groupThreadsByRelativeDate(threadNodes.map((n) => n.thread)).map((sg) => ({
    label: sg.label,
    nodes: sg.threads.flatMap((t) => {
      const n = nodeMap.get(t.id);
      return n ? [n] : [];
    }),
  }));
});

const hasContextMenuActions = computed(
  () => props.node.kind === "context" && props.node.isWorktree
);

const contextBadge = computed(() => {
  if (props.node.kind !== "context") return "";
  if (props.node.isPrimary) return "☀️";
  if (props.node.isWorktree) return "🌳";
  return "";
});

/** Mirror ThreadRow idle highlight when any thread under this context needs attention. */
const contextNeedsIdleAttention = computed(
  () =>
    props.node.kind === "context" &&
    props.node.threads.some((t) => t.needsIdleAttention)
);

const contextHasActiveThread = computed(
  () =>
    props.node.kind === "context" &&
    props.node.threads.some((t) => t.isActive)
);
</script>

<template>
  <!-- Context node = directory -->
  <li v-if="node.kind === 'context'">
    <ContextMenu v-if="hasContextMenuActions">
      <ContextMenuTrigger as-child>
        <div
          class="flex w-full active:translate-y-[1px] min-w-0 max-w-none cursor-pointer items-center gap-1.5 rounded-md px-1 py-1 text-left text-xs transition-colors"
          :class="[
            node.isStale
              ? 'text-destructive hover:bg-muted'
              : contextHasActiveThread
                ? 'bg-accent/30 text-foreground'
                : contextNeedsIdleAttention
                  ? 'bg-blue-500/12 ring-1 ring-blue-500/45 text-foreground dark:bg-blue-400/14 dark:ring-blue-400/50'
                  : 'text-foreground hover:bg-muted',
          ]"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center justify-start gap-1.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            data-testid="thread-group-header"
            :data-thread-group-id="node.id"
            :aria-expanded="isExpanded"
            @click="emit('toggleContext', node.id)"
          >
            
            <ChevronDown size="10" v-if="isExpanded"/>
            <ChevronUp size="10" v-else />
            <span
              v-if="contextBadge"
              class="shrink-0 text-[11px] leading-none"
              aria-hidden="true"
            >
              {{ contextBadge }}
            </span>
            <span class="min-w-0 flex-1 truncate font-medium">{{ node.title }}</span>
          </button>
          <Button
            v-if="node.addThreadTargetId !== null && !node.isStale"
            type="button"
            variant="ghost"
            size="icon-xs"
            class="shrink-0 text-muted-foreground hover:text-foreground"
            :aria-label="`Add thread to ${node.title}`"
            @click.stop="emit('addThread', node.addThreadTargetId)"
          >
            <Plus />
          </Button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent class="min-w-[11rem]">
        <ContextMenuItem
          variant="destructive"         
          class="text-destructive" 
          @select="emit('deleteContext', node.id)"
        >
          <Archive />
          Delete context
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
    <div
      v-else
      class="flex active:translate-y-px  w-full min-w-0 max-w-none items-center gap-1.5 rounded-md px-1 py-0.5 cursor-pointer text-left text-xs transition-colors"
      :class="[
        node.isStale
          ? 'text-destructive hover:bg-muted'
          : contextHasActiveThread
            ? 'bg-black/5 dark:bg-accent/60 text-foreground'
            : contextNeedsIdleAttention
              ? 'bg-blue-500/12 ring-1 ring-blue-500/45 text-foreground dark:bg-blue-400/14 dark:ring-blue-400/50'
              : 'text-foreground hover:bg-muted',
      ]"
    >
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center justify-start gap-1.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        data-testid="thread-group-header"
        :data-thread-group-id="node.id"
        :aria-expanded="isExpanded"
        @click="emit('toggleContext', node.id)"
      >
        <ChevronDown size="10" v-if="isExpanded"/>
        <ChevronUp size="10" v-else />
        <span
          v-if="contextBadge"
          class="shrink-0 text-[11px] leading-none"
          aria-hidden="true"
        >
          {{ contextBadge }}
        </span>
        <span class="min-w-0 flex-1 truncate font-medium">{{ node.title }}</span>
      </button>
      <Button
        v-if="node.addThreadTargetId !== null && !node.isStale"
        type="button"
        variant="ghost"
        size="icon-xs"
        class="shrink-0 text-muted-foreground hover:text-foreground"
        :aria-label="`Add thread to ${node.title}`"
        @click.stop="emit('addThread', node.addThreadTargetId)"
      >
        <Plus />
      </Button>
    </div>

    <slot name="header-extra" />

    <ul
      v-show="isExpanded"
      class="ml-2.5 space-y-0.5 border-l border-border pl-1"
      :data-testid="'thread-group-threads-' + node.id"
      :data-thread-group-id="node.id"
    >
      <template v-if="node.isStale">
        <li v-if="isExpanded" class="list-none px-0 pt-1 pb-1">
          <WorktreeStaleCallout
            :branch="node.branch?.trim() || node.title"
            @delete="emit('deleteContext', node.id)"
          />
        </li>
      </template>
      <template v-else>
        <template v-for="(sg, sgIdx) in subgroupsWithNodes" :key="sgIdx">
          <li role="presentation" class="list-none p-0.5 first:pt-0">
            <span class="text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {{ sg.label }}
            </span>
          </li>
          <li
            v-for="threadNode in sg.nodes"
            :key="threadNode.thread.id"
            class="min-w-0"
            :data-testid="'thread-list-item-' + threadNode.thread.id"
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
        <li v-if="node.showMore" class="flex pt-1">
          <Button
            type="button"
            variant="link"
            size="xs"
            class="w-auto shrink-0 underline"
            :data-testid="'thread-group-show-more-' + node.id"
            @click="emit('expandThreadList', node.id)"
          >
            <ChevronDown />
            Show more
          </Button>
        </li>
        <li v-if="node.showLess" class="flex pt-1">
          <Button
            type="button"
            variant="link"
            size="xs"
            class="w-auto shrink-0 underline"
            :data-testid="'thread-group-show-less-' + node.id"
            @click="emit('collapseThreadList', node.id)"
          >
            <ChevronUp/>
            Show less
          </Button>
        </li>
      </template>
    </ul>
  </li>

  <!-- Thread node = file (leaf; direct embed of ThreadRow) -->
  <li
    v-else-if="node.kind === 'thread'"
    class="min-w-0"
    :data-testid="'thread-list-item-' + node.thread.id"
  >
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
