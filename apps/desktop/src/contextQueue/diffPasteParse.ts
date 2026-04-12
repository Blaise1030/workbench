import { buildPasteText } from "./formatters";
import type { QueueCapture } from "./types";

export type DiffQueueCapture = Extract<QueueCapture, { source: "diff" }>;

export type ParsedDiffQueuePaste = {
  prefix: string;
  suffix: string;
  capture: DiffQueueCapture;
};

export function basenamePath(filePath: string): string {
  const n = filePath.replace(/\\/g, "/");
  const i = n.lastIndexOf("/");
  return i >= 0 ? n.slice(i + 1) : n;
}

/**
 * Split a queued diff paste into user text before / after the canonical `[diff]` block
 * produced by {@link buildPasteText}. The fenced body may contain lines equal to ```;
 * the closing fence is the last ``` line in the document.
 */
export function parseDiffQueuePaste(text: string): ParsedDiffQueuePaste | null {
  const lines = text.split(/\r?\n/);
  let diffIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "[diff]") {
      diffIdx = i;
      break;
    }
  }
  if (diffIdx < 0) return null;

  const fileLine = lines[diffIdx + 1];
  if (fileLine == null || !fileLine.startsWith("File: ")) return null;
  const filePath = fileLine.slice("File: ".length);

  let idx = diffIdx + 2;
  let lineStart: number | undefined;
  let lineEnd: number | undefined;
  const linesMaybe = lines[idx];
  if (linesMaybe != null && linesMaybe.startsWith("Lines: ")) {
    const m = /^Lines:\s*(\d+)\s*-\s*(\d+)\s*$/.exec(linesMaybe);
    if (!m) return null;
    lineStart = Number(m[1]);
    lineEnd = Number(m[2]);
    idx++;
  }

  if (idx >= lines.length || lines[idx] !== "```") return null;
  const fenceOpen = idx;
  let closing = -1;
  for (let j = lines.length - 1; j > fenceOpen; j--) {
    if (lines[j] === "```") {
      closing = j;
      break;
    }
  }
  if (closing <= fenceOpen) return null;

  const bodyLines = lines.slice(fenceOpen + 1, closing);
  const selectedText = bodyLines.join("\n");
  const prefix = lines.slice(0, diffIdx).join("\n").replace(/\n+$/, "");
  const suffix = lines.slice(closing + 1).join("\n").replace(/^\n+/, "");

  return {
    prefix,
    suffix,
    capture: { source: "diff", filePath, selectedText, lineStart, lineEnd }
  };
}

export function joinDiffQueuePaste(prefix: string, capture: DiffQueueCapture, suffix: string): string {
  const core = buildPasteText(capture);
  const p = prefix.replace(/\s+$/, "");
  const s = suffix.replace(/^\s+/, "").replace(/\s+$/, "");
  const parts: string[] = [];
  if (p) parts.push(p);
  parts.push(core);
  if (s) parts.push(s);
  return parts.join("\n\n");
}
