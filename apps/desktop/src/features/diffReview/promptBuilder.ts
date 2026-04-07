import type { DiffReviewItem } from "@/features/diffReview/types";

function formatLineSummary(item: DiffReviewItem): string {
  const parts: string[] = [];

  if (item.oldLineStart !== null && item.oldLineEnd !== null) {
    parts.push(`old ${item.oldLineStart}-${item.oldLineEnd}`);
  }

  if (item.newLineStart !== null && item.newLineEnd !== null) {
    parts.push(`new ${item.newLineStart}-${item.newLineEnd}`);
  }

  return parts.length > 0 ? `lines: ${parts.join(", ")}` : "lines: unavailable";
}

function formatNote(note: string): string {
  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : "Please review this selected change";
}

function formatNoteBlock(note: string): string {
  const lines = formatNote(note).split("\n");

  return ["note: |", ...lines.map((line) => `  ${line}`)].join("\n");
}

export function buildAgentReviewPrompt(items: DiffReviewItem[]): string {
  const lines: string[] = ["Please address the following review findings from the current git diff."];

  items.forEach((item, index) => {
    lines.push("");
    lines.push(`${index + 1}. file: ${item.filePath}`);
    lines.push(formatLineSummary(item));
    if (item.intent !== null) {
      lines.push(`intent: ${item.intent}`);
    }
    lines.push(formatNoteBlock(item.note));
    lines.push("snippet:");
    lines.push(item.snippet);
  });

  lines.push("");
  lines.push("Please make the required code changes and explain what you changed.");

  return lines.join("\n");
}
