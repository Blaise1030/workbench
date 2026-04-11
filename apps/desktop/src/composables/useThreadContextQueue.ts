import { reactive } from "vue";
import type { QueueItem } from "@/contextQueue/types";

type QueuesState = {
  byThreadId: Record<string, QueueItem[]>;
};

const state = reactive<QueuesState>({
  byThreadId: {}
});

function ensureQueue(threadId: string): QueueItem[] {
  let list = state.byThreadId[threadId];
  if (!list) {
    list = [];
    state.byThreadId[threadId] = list;
  }
  return list;
}

export function useThreadContextQueue() {
  function itemsFor(threadId: string): QueueItem[] {
    return ensureQueue(threadId);
  }

  function addItem(threadId: string, item: QueueItem): void {
    ensureQueue(threadId).push(item);
  }

  function removeItem(threadId: string, id: string): void {
    const list = state.byThreadId[threadId];
    if (!list) return;
    const idx = list.findIndex((row) => row.id === id);
    if (idx !== -1) list.splice(idx, 1);
  }

  function reorder(threadId: string, orderedIds: string[]): void {
    const list = state.byThreadId[threadId];
    if (!list?.length) return;

    const byId = new Map(list.map((row) => [row.id, row] as const));
    const seen = new Set<string>();
    const next: QueueItem[] = [];

    for (const id of orderedIds) {
      const row = byId.get(id);
      if (row) {
        next.push(row);
        seen.add(id);
      }
    }
    for (const row of list) {
      if (!seen.has(row.id)) next.push(row);
    }

    list.splice(0, list.length, ...next);
  }

  function updatePasteText(threadId: string, id: string, pasteText: string): void {
    const list = state.byThreadId[threadId];
    if (!list) return;
    const row = list.find((item) => item.id === id);
    if (row) row.pasteText = pasteText;
  }

  function clearThread(threadId: string): void {
    delete state.byThreadId[threadId];
  }

  return {
    itemsFor,
    addItem,
    removeItem,
    reorder,
    updatePasteText,
    clearThread
  };
}
