/**
 * One-shot CLI line typed into a thread PTY after create (or when set before attach completes).
 * `mode: "resume"` must not run when reconnecting to an already-live PTY (`ptyCreate` → `created: false`).
 */
export type PendingAgentBootstrapMode = "resume" | "prompt";

export type PendingAgentBootstrap = {
  threadId: string;
  command: string;
  mode?: PendingAgentBootstrapMode;
};
