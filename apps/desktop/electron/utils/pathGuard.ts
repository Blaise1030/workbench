import path from "node:path";

/**
 * Resolves `relativePath` against `root` and asserts the result stays within `root`.
 * Throws if the resolved path escapes via `..` traversal or is an absolute path outside root.
 *
 * @returns The resolved absolute path, guaranteed to be within root.
 */
export function assertPathWithinRoot(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  const relativeToRoot = path.relative(resolvedRoot, resolvedPath);

  if (
    relativeToRoot === "" ||
    (!relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot))
  ) {
    return resolvedPath;
  }

  throw new Error(
    `Path escapes root: "${relativePath}" resolves outside "${resolvedRoot}"`
  );
}
