import type { Node as PMNode } from "@tiptap/pm/model";

export type DocAttachmentBuckets = {
  skillPaths: string[];
  filePaths: string[];
};

function pushUnique(list: string[], p: string): void {
  if (!p || list.includes(p)) return;
  list.push(p);
}

/** Collect absolute paths from @ mentions, image/file paperclip badges, and inline file mentions for agent attachment blocks. */
export function collectDocAttachmentPaths(doc: PMNode): DocAttachmentBuckets {
  const skillPaths: string[] = [];
  const filePaths: string[] = [];
  doc.descendants((node) => {
    if (node.type.name === "threadMention") {
      const id = String(node.attrs.id ?? "");
      const kind = String(node.attrs.itemKind ?? "");
      if (!id) return;
      if (kind === "skill") pushUnique(skillPaths, id);
      else if (kind === "file") pushUnique(filePaths, id);
    }
    if (node.type.name === "threadImageBadge") {
      const path = String(node.attrs.path ?? "");
      if (path) pushUnique(filePaths, path);
    }
    if (node.type.name === "threadFileBadge") {
      const path = String(node.attrs.path ?? "");
      if (path) pushUnique(filePaths, path);
    }
  });
  return { skillPaths, filePaths };
}
