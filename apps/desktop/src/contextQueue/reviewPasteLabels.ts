import { parseDiffQueuePaste } from "@/contextQueue/diffPasteParse";
import type { QueueItem } from "@/contextQueue/types";

type LineSpan = { a: number; b: number };

function spanFromLineCount(lineCount: number): LineSpan {
  if (lineCount <= 0) return { a: 0, b: 0 };
  return { a: 1, b: lineCount };
}

function spanFromBody(body: string): LineSpan {
  if (!body) return { a: 0, b: 0 };
  const n = body.split(/\r?\n/).length;
  return spanFromLineCount(n);
}

/** `[file]` block produced by {@link buildPasteText} for file captures. */
export function parseFileQueuePaste(text: string): {
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  body: string;
} | null {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i] === "") i++;
  if (lines[i] !== "[file]") return null;
  i++;
  const pathLine = lines[i];
  if (pathLine == null || !pathLine.startsWith("Path: ")) return null;
  const filePath = pathLine.slice("Path: ".length);
  i++;
  let lineStart: number | undefined;
  let lineEnd: number | undefined;
  const maybeLines = lines[i];
  if (maybeLines != null && maybeLines.startsWith("Lines: ")) {
    const m = /^Lines:\s*(\d+)\s*-\s*(\d+)\s*$/.exec(maybeLines);
    if (!m) return null;
    lineStart = Number(m[1]);
    lineEnd = Number(m[2]);
    i++;
  }
  if (lines[i] !== "```") return null;
  const open = i;
  let closing = -1;
  for (let j = lines.length - 1; j > open; j--) {
    if (lines[j] === "```") {
      closing = j;
      break;
    }
  }
  if (closing <= open) return null;
  const body = lines.slice(open + 1, closing).join("\n");
  return { filePath, lineStart, lineEnd, body };
}

export function parseTerminalQueuePaste(text: string): {
  agentTab: boolean;
  sessionLabel?: string;
  body: string;
} | null {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i] === "") i++;
  const head = lines[i];
  if (head === "[Agent Tab]") {
    i++;
    if (lines[i] !== "```") return null;
    const open = i;
    let closing = -1;
    for (let j = lines.length - 1; j > open; j--) {
      if (lines[j] === "```") {
        closing = j;
        break;
      }
    }
    if (closing <= open) return null;
    const body = lines.slice(open + 1, closing).join("\n");
    return { agentTab: true, body };
  }
  if (head !== "[terminal]") return null;
  i++;
  let sessionLabel: string | undefined;
  const maybeSession = lines[i];
  if (maybeSession != null && maybeSession.startsWith("Session: ")) {
    sessionLabel = maybeSession.slice("Session: ".length).trim();
    i++;
  }
  if (lines[i] !== "```") return null;
  const open = i;
  let closing = -1;
  for (let j = lines.length - 1; j > open; j--) {
    if (lines[j] === "```") {
      closing = j;
      break;
    }
  }
  if (closing <= open) return null;
  const body = lines.slice(open + 1, closing).join("\n");
  return { agentTab: false, sessionLabel, body };
}

/** Short monospace label like `[Agent 7:11]` or `[Terminal, 1:4]`. */
export function queueContextBadgeLabel(row: QueueItem): string {
  const t = row.pasteText;
  if (row.source === "diff") {
    const p = parseDiffQueuePaste(t);
    if (p) {
      if (p.capture.lineStart != null && p.capture.lineEnd != null) {
        return `[File, ${p.capture.lineStart}:${p.capture.lineEnd}]`;
      }
      const { a, b } = spanFromBody(p.capture.selectedText);
      return `[File, ${a}:${b}]`;
    }
  }
  if (row.source === "file") {
    const p = parseFileQueuePaste(t);
    if (p) {
      if (p.lineStart != null && p.lineEnd != null) {
        return `[File, ${p.lineStart}:${p.lineEnd}]`;
      }
      const { a, b } = spanFromBody(p.body);
      return `[File, ${a}:${b}]`;
    }
  }
  if (row.source === "terminal") {
    const p = parseTerminalQueuePaste(t);
    if (p) {
      const { a, b } = spanFromBody(p.body);
      if (p.agentTab) return `[Agent ${a}:${b}]`;
      return `[Terminal, ${a}:${b}]`;
    }
  }
  if (row.source === "folder") {
    const lines = t.split(/\r?\n/).filter((l) => l.trim() !== "");
    const rest = lines.filter((l) => !l.startsWith("[folder]") && !l.startsWith("Path: "));
    const { a, b } = spanFromLineCount(Math.max(1, rest.length));
    return `[Folder, ${a}:${b}]`;
  }
  const lines = t.split(/\r?\n/).filter((l) => l.trim() !== "");
  const { a, b } = spanFromLineCount(Math.max(1, lines.length));
  return `[${row.source} ${a}:${b}]`;
}

/** Plain-text snippet for tooltip preview. */
export function queueSnippetPreview(row: QueueItem, maxLen = 900): string {
  if (row.source === "diff") {
    const p = parseDiffQueuePaste(row.pasteText);
    if (p?.capture.selectedText) return truncate(p.capture.selectedText, maxLen);
  }
  if (row.source === "file") {
    const p = parseFileQueuePaste(row.pasteText);
    if (p?.body) return truncate(p.body, maxLen);
  }
  if (row.source === "terminal") {
    const p = parseTerminalQueuePaste(row.pasteText);
    if (p?.body) return truncate(p.body, maxLen);
  }
  if (row.source === "folder") {
    const after = row.pasteText.split(/\r?\n\r?\n/).slice(1).join("\n\n").trim();
    if (after) return truncate(after, maxLen);
  }
  return truncate(row.pasteText.trim(), maxLen);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
