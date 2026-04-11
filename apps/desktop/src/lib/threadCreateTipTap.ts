import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

/** Block separator for flat prompt text (must match parsing in @ / slash menus). */
export const THREAD_PROMPT_BLOCK_SEP = "\n";

export function promptDocFlatText(doc: PMNode): string {
  return doc.textBetween(0, doc.content.size, THREAD_PROMPT_BLOCK_SEP, "");
}

export function promptFlatOffsetAtDocPos(doc: PMNode, pos: number): number {
  return doc.textBetween(0, pos, THREAD_PROMPT_BLOCK_SEP, "").length;
}

/**
 * Map a flat-text offset to a document position (smallest pos whose prefix length ≥ offset).
 */
export function docPosAtFlatOffset(doc: PMNode, offset: number): number {
  const maxPos = doc.content.size;
  if (offset <= 0) return 0;
  const fullLen = doc.textBetween(0, maxPos, THREAD_PROMPT_BLOCK_SEP, "").length;
  if (offset >= fullLen) return maxPos;
  let lo = 0;
  let hi = maxPos;
  while (hi > lo + 1) {
    const mid = Math.floor((lo + hi) / 2);
    const len = doc.textBetween(0, mid, THREAD_PROMPT_BLOCK_SEP, "").length;
    if (len < offset) lo = mid;
    else hi = mid;
  }
  return hi;
}

export function replaceFlatRange(editor: Editor, from: number, to: number, insert: string): void {
  const doc = editor.state.doc;
  const fromPos = docPosAtFlatOffset(doc, from);
  const toPos = docPosAtFlatOffset(doc, to);
  editor.chain().focus().deleteRange({ from: fromPos, to: toPos }).insertContentAt(fromPos, insert).run();
}
