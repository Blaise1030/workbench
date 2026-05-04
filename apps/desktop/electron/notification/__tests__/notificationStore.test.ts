import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import type { AppNotification } from "../../../src/shared/domain";

vi.mock("better-sqlite3", async () => {
  const module = await import("../../storage/__tests__/betterSqlite3Compat");
  return { default: module.default };
});

import Database from "better-sqlite3";
import { NotificationStore } from "../notificationStore";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    thread_title TEXT NOT NULL,
    project_name TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
`;

function makeDb() {
  const db = new Database(":memory:");
  db.exec(SCHEMA);
  return db;
}

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: randomUUID(),
    threadId: "thread-1",
    projectId: "project-1",
    kind: "done",
    threadTitle: "Build login page",
    projectName: "My Project",
    read: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("NotificationStore", () => {
  let store: NotificationStore;

  beforeEach(() => {
    const db = makeDb();
    store = new NotificationStore(db as unknown as import("better-sqlite3").Database);
  });

  it("adds a notification and returns it in list()", () => {
    const n = makeNotification();
    store.add(n);
    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(n.id);
    expect(list[0].threadTitle).toBe(n.threadTitle);
    expect(list[0].read).toBe(false);
  });

  it("list() returns notifications ordered by createdAt DESC", () => {
    const base = Date.now();
    store.add(makeNotification({ id: "a", createdAt: new Date(base).toISOString() }));
    store.add(makeNotification({ id: "b", createdAt: new Date(base + 1000).toISOString() }));
    store.add(makeNotification({ id: "c", createdAt: new Date(base + 2000).toISOString() }));
    const ids = store.list().map((n) => n.id);
    expect(ids).toEqual(["c", "b", "a"]);
  });

  it("prunes to the 20 most recent after exceeding the limit", () => {
    const base = Date.now();
    for (let i = 0; i < 25; i++) {
      store.add(
        makeNotification({
          id: `n-${i}`,
          createdAt: new Date(base + i * 1000).toISOString(),
        })
      );
    }
    const list = store.list();
    expect(list).toHaveLength(20);
    // Should keep the newest 20 (indices 5–24)
    const ids = list.map((n) => n.id);
    expect(ids).toContain("n-24");
    expect(ids).toContain("n-5");
    expect(ids).not.toContain("n-4");
    expect(ids).not.toContain("n-0");
  });

  it("markRead marks a single notification as read", () => {
    const n = makeNotification({ id: "target" });
    const other = makeNotification({ id: "other" });
    store.add(n);
    store.add(other);
    store.markRead("target");
    const list = store.list();
    expect(list.find((x) => x.id === "target")?.read).toBe(true);
    expect(list.find((x) => x.id === "other")?.read).toBe(false);
  });

  it("markAllRead marks every notification as read", () => {
    store.add(makeNotification({ id: "a" }));
    store.add(makeNotification({ id: "b" }));
    store.add(makeNotification({ id: "c" }));
    store.markAllRead();
    const allRead = store.list().every((n) => n.read);
    expect(allRead).toBe(true);
  });

  it("maps kind correctly for needsReview and failed", () => {
    store.add(makeNotification({ id: "r", kind: "needsReview" }));
    store.add(makeNotification({ id: "f", kind: "failed" }));
    const list = store.list();
    expect(list.find((n) => n.id === "r")?.kind).toBe("needsReview");
    expect(list.find((n) => n.id === "f")?.kind).toBe("failed");
  });
});
