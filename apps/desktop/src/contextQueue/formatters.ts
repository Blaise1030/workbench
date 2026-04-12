import type { QueueCapture } from "./types";

export function buildPasteText(c: QueueCapture): string {
  switch (c.source) {
    case "diff":
      return [
        "[diff]",
        `File: ${c.filePath}`,
        c.lineStart != null && c.lineEnd != null ? `Lines: ${c.lineStart}-${c.lineEnd}` : "",
        "```",
        c.selectedText,
        "```",
      ]
        .filter(Boolean)
        .join("\n");
    case "file":
      return [
        "[file]",
        `Path: ${c.filePath}`,
        c.lineStart != null && c.lineEnd != null ? `Lines: ${c.lineStart}-${c.lineEnd}` : "",
        "```",
        c.selectedText,
        "```",
      ]
        .filter(Boolean)
        .join("\n");
    case "folder":
      return [`[folder]`, `Path: ${c.folderPath}`, "", c.listingText].join("\n");
    case "terminal":
      if (c.agentTab) {
        return ["[Agent Tab]", "```", c.selectedText, "```"].join("\n");
      }
      return [
        "[terminal]",
        c.sessionLabel ? `Session: ${c.sessionLabel}` : "",
        "```",
        c.selectedText,
        "```",
      ]
        .filter(Boolean)
        .join("\n");
  }
}
