import type { QueueItem } from "./types";

export type InjectDeps = {
  sessionId: string;
  items: QueueItem[];
  ptyWrite: (sessionId: string, data: string) => Promise<void>;
  delayMs: number;
  signal?: AbortSignal;
};

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

export async function injectContextQueue(deps: InjectDeps): Promise<void> {
  for (let i = 0; i < deps.items.length; i++) {
    if (deps.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const text = deps.items[i]?.pasteText ?? "";
    if (text === "") continue;
    await deps.ptyWrite(deps.sessionId, text);
    if (i < deps.items.length - 1) await delay(deps.delayMs, deps.signal);
  }
}
