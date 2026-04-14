<script setup lang="ts">
defineOptions({ name: "FileTreeNode" });

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "@/components/ui/context-menu";
import Button from "@/components/ui/Button.vue";

export type FileTreeNodeData =
  | {
      kind: "file";
      name: string;
      path: string;
    }
  | {
      kind: "folder";
      name: string;
      path: string;
      children: FileTreeNodeData[];
    };

const props = withDefaults(
  defineProps<{
    node: FileTreeNodeData;
    selectedPath: string | null;
    expandedFolders: Set<string>;
    /** When true, folders ignore `expandedFolders` and always show children (used sparingly). */
    forceExpanded?: boolean;
  }>(),
  { forceExpanded: false }
);

const emit = defineEmits<{
  toggleFolder: [path: string];
  selectFile: [path: string];
  addFile: [folderPath?: string];
  addFolder: [folderPath?: string];
  deleteFolder: [path: string];
  deleteFile: [path: string];
  queueForAgent: [payload: { kind: "file" | "folder"; path: string }];
}>();

function isExpanded(path: string): boolean {
  return props.forceExpanded || props.expandedFolders.has(path);
}
</script>

<template>
  <li>
    <ContextMenu v-if="node.kind === 'folder'">
      <ContextMenuTrigger as-child>
        <Button
          :data-testid="`folder-toggle-${node.path}`"
          :data-file-tree-row="node.path"
          type="button"
          variant="ghost"
          size="xs"
          class="flex w-full min-w-0 max-w-none items-center justify-start gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-foreground transition-colors hover:bg-muted"
          @click="emit('toggleFolder', node.path)"
        >
          <span class="w-3.5 shrink-0 text-center text-[10px] leading-none text-muted-foreground">
            {{ isExpanded(node.path) ? "▾" : "▸" }}
          </span>
          <span class="shrink-0 text-[13px] leading-none" aria-hidden="true">📁</span>
          <span class="min-w-0 whitespace-nowrap font-normal">{{ node.name }}</span>
        </Button>
      </ContextMenuTrigger>
      <ContextMenuContent data-testid="file-tree-context-menu" class="min-w-[11rem]">
        <ContextMenuItem data-testid="ctx-add-file" class="text-xs" @select="emit('addFile', node.path)">
          Add file…
        </ContextMenuItem>
        <ContextMenuItem data-testid="ctx-add-folder" class="text-xs" @select="emit('addFolder', node.path)">
          Add folder…
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="ctx-delete-folder"
          variant="destructive"
          class="text-xs"
          @select="emit('deleteFolder', node.path)"
        >
          Delete folder
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="ctx-queue-folder"
          class="text-xs"
          @select="emit('queueForAgent', { kind: 'folder', path: node.path })"
        >
          Queue folder for agent
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>

    <ContextMenu v-else>
      <ContextMenuTrigger as-child>
        <Button
          :data-testid="`file-node-${node.path}`"
          :data-file-tree-row="node.path"
          type="button"
          variant="ghost"
          size="xs"
          class="flex w-full min-w-0 max-w-none items-center justify-start gap-1.5 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted"
          :class="selectedPath === node.path ? 'bg-muted text-foreground' : 'text-muted-foreground'"
          @click="emit('selectFile', node.path)"
        >
          <span class="w-3.5 shrink-0" aria-hidden="true" />
          <span class="shrink-0 text-[13px] leading-none" aria-hidden="true">📄</span>
          <span class="min-w-0 whitespace-nowrap font-normal">{{ node.name }}</span>
        </Button>
      </ContextMenuTrigger>
      <ContextMenuContent data-testid="file-tree-context-menu" class="min-w-[11rem]">
        <ContextMenuItem
          data-testid="ctx-delete-file"
          variant="destructive"
          class="text-xs"
          @select="emit('deleteFile', node.path)"
        >
          Delete file
        </ContextMenuItem>
        <ContextMenuItem
          data-testid="ctx-queue-file"
          class="text-xs"
          @select="emit('queueForAgent', { kind: 'file', path: node.path })"
        >
          Queue file for agent
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>

    <ul
      v-if="node.kind === 'folder' && isExpanded(node.path)"
      class="ml-3 space-y-0.5 border-l border-border/60 pl-2"
    >
      <FileTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :selected-path="selectedPath"
        :expanded-folders="expandedFolders"
        :force-expanded="forceExpanded"
        @toggle-folder="emit('toggleFolder', $event)"
        @select-file="emit('selectFile', $event)"
        @add-file="emit('addFile', $event)"
        @add-folder="emit('addFolder', $event)"
        @delete-folder="emit('deleteFolder', $event)"
        @delete-file="emit('deleteFile', $event)"
        @queue-for-agent="emit('queueForAgent', $event)"
      />
    </ul>
  </li>
</template>
