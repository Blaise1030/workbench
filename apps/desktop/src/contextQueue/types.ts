import type { LocalFileAttachment } from "@/lib/localFileAttachment";

export type QueueSource = "diff" | "file" | "folder" | "terminal";

export type QueueCapture =
  | {
      source: "diff";
      filePath: string;
      selectedText: string;
      /** Optional line numbers if resolved from CM */
      lineStart?: number;
      lineEnd?: number;
    }
  | {
      source: "file";
      filePath: string;
      selectedText: string;
      lineStart?: number;
      lineEnd?: number;
    }
  | { source: "folder"; folderPath: string; listingText: string }
  | {
      source: "terminal";
      selectedText: string;
      /** Main thread agent pane — paste uses `[Agent Tab]` instead of `[terminal]`. */
      agentTab?: boolean;
      sessionLabel?: string;
    };

export type QueueItem = {
  id: string;
  source: QueueSource;
  pasteText: string;
  /** Optional note + files; merged into {@link pasteText} when the review panel confirms send */
  reviewComment?: string;
  reviewAttachments?: LocalFileAttachment[];
  /** Debug / future UI; not required for inject */
  meta: Record<string, string | number | undefined>;
};
