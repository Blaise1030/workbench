import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { QueueItem } from "@/contextQueue/types";
import { useThreadContextQueue } from "../useThreadContextQueue";

function item(id: string, pasteText = ""): QueueItem {
  return {
    id,
    source: "file",
    pasteText,
    meta: {}
  };
}

describe("useThreadContextQueue", () => {
  const q = useThreadContextQueue();

  beforeEach(() => {
    q.clearThread("t1");
    q.clearThread("t2");
  });

  afterEach(() => {
    q.clearThread("t1");
    q.clearThread("t2");
  });

  it("isolates queues per thread", () => {
    const a = item("a");
    const b = item("b");
    q.addItem("t1", a);
    q.addItem("t2", b);

    expect(q.itemsFor("t1").map((i) => i.id)).toEqual(["a"]);
    expect(q.itemsFor("t2").map((i) => i.id)).toEqual(["b"]);
  });

  it("removeItem removes one row", () => {
    q.addItem("t1", item("x"));
    q.addItem("t1", item("y"));
    q.removeItem("t1", "x");

    expect(q.itemsFor("t1").map((i) => i.id)).toEqual(["y"]);
  });

  it("reorder changes order to match orderedIds", () => {
    q.addItem("t1", item("a"));
    q.addItem("t1", item("b"));
    q.addItem("t1", item("c"));

    q.reorder("t1", ["c", "a", "bogus", "b"]);

    expect(q.itemsFor("t1").map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("updatePasteText mutates pasteText", () => {
    q.addItem("t1", item("z", "old"));
    q.updatePasteText("t1", "z", "new");

    expect(q.itemsFor("t1")[0]?.pasteText).toBe("new");
  });
});
