/**
 * Single entry point to open the workspace "new thread" dialog. The host registers in
 * WorkspaceLayout; callers (sidebar, headers, shortcuts) invoke this without owning a Dialog.
 */

export type ThreadCreateDialogOpenOptions =
  | {
      target: "activeWorktree";
      destinationContextLabel?: string | null;
    }
  | {
      target: "worktreeGroup";
      worktreeId: string;
      destinationContextLabel?: string | null;
    };

type Opener = (opts: ThreadCreateDialogOpenOptions) => void;

let opener: Opener | null = null;

export function registerThreadCreateDialogOpener(fn: Opener): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

export function openThreadCreateDialog(opts: ThreadCreateDialogOpenOptions): void {
  opener?.(opts);
}
