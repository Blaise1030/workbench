export type LocalFileAttachment = {
  id: string;
  path: string;
  name: string;
  isImage: boolean;
};

export function pathFromFile(file: File): string {
  const getPath = window.workspaceApi?.getPathForFile;
  if (getPath) {
    try {
      const p = getPath(file);
      if (p && p.length > 0) return p;
    } catch {
      /* invalid / non-local file */
    }
  }
  const legacy = (file as File & { path?: string }).path;
  if (legacy && legacy.length > 0) return legacy;
  return file.name;
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(file.name);
}
