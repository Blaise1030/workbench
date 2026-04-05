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
      class="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-foreground transition-colors hover:bg-muted"
      @click="emit('toggleFolder', node.path)"
    >
      <span class="w-3.5 shrink-0 text-center text-[10px] leading-none text-muted-foreground">
        {{ isExpanded(node.path) ? "▾" : "▸" }}
      </span>
      <span class="shrink-0 text-[13px] leading-none" aria-hidden="true">📁</span>
      <span class="min-w-0 truncate font-medium">{{ node.name }}</span>
    </button>
    <button
      v-else
      :data-testid="`file-node-${node.path}`"
      type="button"
      class="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted"
      :class="selectedPath === node.path ? 'bg-muted text-foreground' : 'text-muted-foreground'"
      @click="emit('selectFile', node.path)"
    >
      <span class="w-3.5 shrink-0" aria-hidden="true" />
      <span class="shrink-0 text-[13px] leading-none" aria-hidden="true">📄</span>
      <span class="min-w-0 truncate">{{ node.name }}</span>
    </button>

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
      />
    </ul>
  </li>
</template>
