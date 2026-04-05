<script setup lang="ts">
defineOptions({ name: "FileTreeNode" });

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

const props = defineProps<{
  node: FileTreeNodeData;
  selectedPath: string | null;
  expandedFolders: Set<string>;
  forceExpanded: boolean;
}>();

const emit = defineEmits<{
  toggleFolder: [path: string];
  selectFile: [path: string];
}>();

function isExpanded(path: string): boolean {
  return props.forceExpanded || props.expandedFolders.has(path);
}
</script>

<template>
  <li>
    <button
      v-if="node.kind === 'folder'"
      :data-testid="`folder-toggle-${node.path}`"
      type="button"
      class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
      @click="emit('toggleFolder', node.path)"
    >
      <span class="w-4 text-center text-xs text-muted-foreground">
        {{ isExpanded(node.path) ? "▾" : "▸" }}
      </span>
      <span class="truncate font-medium">{{ node.name }}</span>
    </button>
    <button
      v-else
      :data-testid="`file-node-${node.path}`"
      type="button"
      class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
      :class="selectedPath === node.path ? 'bg-muted text-foreground' : 'text-muted-foreground'"
      @click="emit('selectFile', node.path)"
    >
      <span class="w-4 text-center text-xs text-muted-foreground">•</span>
      <span class="truncate">{{ node.name }}</span>
    </button>

    <ul
      v-if="node.kind === 'folder' && isExpanded(node.path)"
      class="ml-4 space-y-1"
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
      />
    </ul>
  </li>
</template>
