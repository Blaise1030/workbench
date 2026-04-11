export type RunStatus = "running" | "needsReview" | "failed" | "done";

/** Agent associated with a thread (run adapters may only support a subset). */
export type ThreadAgent = "claude" | "cursor" | "codex" | "gemini";

/** Add-thread flow: prompt is sent to the PTY bootstrap CLI per settings; title is usually the first line of your text. The new-thread dialog may append `[Attached skills]` and `[Attached files]` path blocks. */
export interface ThreadCreateWithAgentPayload {
  agent: ThreadAgent;
  prompt: string;
  /** When set, used as the thread title (e.g. first line of the prompt, or derived from attachments). */
  threadTitle?: string;
}
export type ThreadSessionLaunchMode = "fresh" | "resume";
export type ThreadSessionStatus = "idle" | "active" | "resumable" | "resumeFailed";

export interface Project {
  id: string;
  name: string;
  repoPath: string;
  status: RunStatus | "idle";
  lastActiveWorktreeId?: string | null;
  /** Lower values appear first (left) in the project tab strip. */
  tabOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Worktree {
  id: string;
  projectId: string;
  name: string;
  branch: string;
  path: string;
  isActive: boolean;
  isDefault: boolean;
  baseBranch: string | null;
  lastActiveThreadId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Thread {
  id: string;
  projectId: string;
  worktreeId: string;
  title: string;
  agent: ThreadAgent;
  /** Git branch checked out on the thread's worktree when the thread was created (null for legacy rows). */
  createdBranch: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadSession {
  threadId: string;
  provider: ThreadAgent;
  resumeId: string | null;
  initialPrompt: string | null;
  titleCapturedAt: string | null;
  launchMode: ThreadSessionLaunchMode;
  status: ThreadSessionStatus;
  lastActivityAt: string;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Run {
  id: string;
  threadId: string;
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
}

export interface RunEvent {
  id: string;
  runId: string;
  kind: "stdout" | "stderr" | "system" | "feedback";
  payload: string;
  createdAt: string;
}

export interface PreviewSession {
  id: string;
  threadId: string;
  url: string;
  ready: boolean;
}

export interface ReviewStatus {
  threadId: string;
  changedFiles: number;
  needsApproval: boolean;
}
