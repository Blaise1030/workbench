export type ReviewIntent = "fix" | "clarify" | "rework";

export interface DiffReviewItem {
  id: string;
  worktreeId: string;
  threadId: string | null;
  filePath: string;
  oldLineStart: number | null;
  oldLineEnd: number | null;
  newLineStart: number | null;
  newLineEnd: number | null;
  snippet: string;
  note: string;
  intent: ReviewIntent | null;
  createdAt: string;
}

export interface DraftDiffReviewSelection {
  worktreeId: string;
  threadId: string | null;
  filePath: string;
  oldLineStart: number | null;
  oldLineEnd: number | null;
  newLineStart: number | null;
  newLineEnd: number | null;
  snippet: string;
  note?: string;
  intent?: ReviewIntent | null;
}
