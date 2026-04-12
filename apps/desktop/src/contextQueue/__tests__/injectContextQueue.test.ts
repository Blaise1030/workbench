import { afterEach, describe, expect, it, vi } from "vitest";
import { injectContextQueue } from "../injectContextQueue";
import type { QueueItem } from "../types";

function item(pasteText: string, id: string): QueueItem {
  return {
    id,
    source: "terminal",
    pasteText,
    meta: {}
  };
}

describe("injectContextQueue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes in order with \\r suffix for single item", async () => {
    const ptyWrite = vi.fn().mockResolvedValue(undefined);
    await injectContextQueue({
      sessionId: "sess-1",
      items: [item("hello", "a")],
      ptyWrite,
      delayMs: 0
    });
    expect(ptyWrite).toHaveBeenCalledTimes(1);
    expect(ptyWrite).toHaveBeenCalledWith("sess-1", "hello\r");
  });

  it("writes two items with delay between", async () => {
    vi.useFakeTimers();
    const ptyWrite = vi.fn().mockResolvedValue(undefined);
    const p = injectContextQueue({
      sessionId: "s",
      items: [item("first", "1"), item("second", "2")],
      ptyWrite,
      delayMs: 100
    });
    await vi.runAllTimersAsync();
    await p;
    expect(ptyWrite).toHaveBeenNthCalledWith(1, "s", "first\r");
    expect(ptyWrite).toHaveBeenNthCalledWith(2, "s", "second\r");
    expect(ptyWrite).toHaveBeenCalledTimes(2);
  });

  it("skips empty pasteText but still processes next", async () => {
    const ptyWrite = vi.fn().mockResolvedValue(undefined);
    await injectContextQueue({
      sessionId: "s",
      items: [item("", "skip"), item("kept", "b")],
      ptyWrite,
      delayMs: 0
    });
    expect(ptyWrite).toHaveBeenCalledTimes(1);
    expect(ptyWrite).toHaveBeenCalledWith("s", "kept\r");
  });

  it("throws AbortError when aborted during delay between items", async () => {
    vi.useFakeTimers();
    const ptyWrite = vi.fn().mockResolvedValue(undefined);
    const controller = new AbortController();
    const p = injectContextQueue({
      sessionId: "s",
      items: [item("a", "1"), item("b", "2")],
      ptyWrite,
      delayMs: 50,
      signal: controller.signal
    });
    const rejects = expect(p).rejects.toThrowError(/aborted/i);
    await Promise.resolve();
    expect(ptyWrite).toHaveBeenCalledTimes(1);
    controller.abort();
    await vi.advanceTimersByTimeAsync(50);
    await rejects;
    expect(ptyWrite).toHaveBeenCalledTimes(1);
  });
});
