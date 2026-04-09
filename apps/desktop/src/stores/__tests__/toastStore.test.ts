import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useToastStore } from "../toastStore";

describe("toastStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("hydrates active notifications after a reload", () => {
    const firstSession = useToastStore();
    firstSession.show({
      title: "Push failed",
      description: "Remote rejected the branch.",
      variant: "error",
      durationMs: 10_000
    });

    setActivePinia(createPinia());
    const reloadedSession = useToastStore();
    reloadedSession.hydratePersisted();
    expect(reloadedSession.items).toHaveLength(1);
    expect(reloadedSession.items[0]).toMatchObject({
      title: "Push failed",
      description: "Remote rejected the branch.",
      variant: "error"
    });

    vi.advanceTimersByTime(10_000);
    expect(reloadedSession.items).toHaveLength(0);
  });
});
