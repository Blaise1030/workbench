export type RunStatus = "running" | "needsReview" | "failed" | "done";

/** Agent associated with a thread (run adapters may only support a subset). */
export type ThreadAgent = "claude" | "cursor" | "codex" | "gemini";

export interface Project {
  id: string;
  name: string;
  repoPath: string;
  status: RunStatus | "idle";
  lastActiveWorktreeId?: string | null;
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
  sortOrder: number;
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
