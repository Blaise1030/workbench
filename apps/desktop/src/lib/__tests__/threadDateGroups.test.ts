import { describe, expect, it } from "vitest";
import type { Thread } from "@shared/domain";
import {
  groupThreadsByRelativeDate,
  labelForRelativeDateBucket,
  threadRelativeDateBucket
} from "@/lib/threadDateGroups";

const baseThread = {
  id: "x",
  projectId: "p",
  worktreeId: "w",
  title: "t",
  agent: "claude" as const,
  createdBranch: null as string | null,
  updatedAt: "2026-04-01T00:00:00.000Z"
};

function thread(createdAt: string, id: string): Thread {
  return { ...baseThread, id, createdAt, updatedAt: createdAt };
}

describe("threadDateGroups", () => {
  const now = new Date("2026-04-11T15:00:00.000Z");

  it("labels buckets", () => {
    expect(labelForRelativeDateBucket("today")).toBe("Today");
    expect(labelForRelativeDateBucket("yesterday")).toBe("Yesterday");
    expect(labelForRelativeDateBucket("pastWeek")).toBe("Past week");
    expect(labelForRelativeDateBucket("older")).toBe("Older");
  });

  it("classifies calendar days relative to now", () => {
    expect(threadRelativeDateBucket("2026-04-11T08:00:00.000Z", now)).toBe("today");
    expect(threadRelativeDateBucket("2026-04-10T12:00:00.000Z", now)).toBe("yesterday");
    expect(threadRelativeDateBucket("2026-04-05T12:00:00.000Z", now)).toBe("pastWeek");
    expect(threadRelativeDateBucket("2026-03-01T12:00:00.000Z", now)).toBe("older");
  });

  it("groups contiguous same-bucket threads preserving order", () => {
    const threads = [
      thread("2026-04-11T10:00:00.000Z", "a"),
      thread("2026-04-11T09:00:00.000Z", "b"),
      thread("2026-04-10T12:00:00.000Z", "c"),
      thread("2026-04-08T12:00:00.000Z", "d"),
      thread("2026-03-01T12:00:00.000Z", "e")
    ];
    const groups = groupThreadsByRelativeDate(threads, now);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "Past week", "Older"]);
    expect(groups.map((g) => g.threads.map((t) => t.id))).toEqual([["a", "b"], ["c"], ["d"], ["e"]]);
  });
});
