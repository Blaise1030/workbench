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
/** Opens that ran before the layout host registered (e.g. very early click). */
let pending: ThreadCreateDialogOpenOptions | null = null;

export function registerThreadCreateDialogOpener(fn: Opener): () => void {
  opener = fn;
  if (pending) {
    const opts = pending;
    pending = null;
    fn(opts);
  }
  return () => {
    if (opener === fn) {
      opener = null;
      pending = null;
    }
  };
}

export function openThreadCreateDialog(opts: ThreadCreateDialogOpenOptions): void {
  if (opener) opener(opts);
  else pending = opts;
}
