import { defineComponent, ref, type Ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread, ThreadAgent } from "@shared/domain";
import { useThreadPtyRunStatus } from "../useThreadPtyRunStatus";
import * as chirp from "@/terminal/playTerminalChirp";

vi.mock("@/terminal/playTerminalChirp", () => ({
  playTerminalChirp: vi.fn()
}));

const thread = (id: string, agent: ThreadAgent = "claude"): Thread => ({
  id,
  projectId: "p1",
  worktreeId: "wt1",
  title: `${id} title`,
  agent,
  createdAt: "",
  updatedAt: "",
  createdBranch: null
});

describe("useThreadPtyRunStatus", () => {
  let hookHandler: ((threadId: string, state: string) => void) | null = null;

  beforeEach(() => {
    vi.mocked(chirp.playTerminalChirp).mockClear();
    hookHandler = null;
    vi.stubGlobal("window", {
      ...window,
      workspaceApi: {
        onThreadRunStateChanged: (cb: (threadId: string, state: string) => void) => {
          hookHandler = cb;
          return () => { hookHandler = null; };
        }
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mountHarness(
    threads: Thread[],
    activeThreadId: string | null,
    notificationsEnabled = true
  ): {
    active: Ref<string | null>;
    runStatusByThreadId: Ref<Record<string, import("@shared/domain").RunStatus>>;
    idleAttentionByThreadId: Ref<Record<string, boolean>>;
    clearIdleAttention: (threadId: string) => void;
    markUserInput: (sessionId: string) => void;
  } {
    const threadsRef = ref(threads);
    const active = ref<string | null>(activeThreadId);
    const notif = ref(notificationsEnabled);
    const bag = {} as {
      runStatusByThreadId: Ref<Record<string, import("@shared/domain").RunStatus>>;
      idleAttentionByThreadId: Ref<Record<string, boolean>>;
      clearIdleAttention: (threadId: string) => void;
      markUserInput: (sessionId: string) => void;
    };

    const Test = defineComponent({
      setup() {
        const r = useThreadPtyRunStatus(threadsRef, {
          activeThreadId: active,
          notificationsEnabled: notif
        });
        bag.runStatusByThreadId = r.runStatusByThreadId;
        bag.idleAttentionByThreadId = r.idleAttentionByThreadId;
        bag.clearIdleAttention = r.clearIdleAttention;
        bag.markUserInput = r.markUserInput;
        return {};
      },
      template: "<div />"
    });
    mount(Test);
    return { active, ...bag };
  }

  it("sets running state when hook emits running", async () => {
    const { runStatusByThreadId } = mountHarness([thread("t-a"), thread("t-b")], "t-a");
    await flushPromises();

    hookHandler!("t-b", "running");
    await flushPromises();

    expect(runStatusByThreadId.value["t-b"]).toBe("running");
  });

  it("sets idle attention and chirps when non-active thread gets done state", async () => {
    const { runStatusByThreadId, idleAttentionByThreadId } = mountHarness(
      [thread("t-a"), thread("t-b")],
      "t-a"
    );
    await flushPromises();

    hookHandler!("t-b", "done");
    await flushPromises();

    expect(runStatusByThreadId.value["t-b"]).toBe("done");
    expect(idleAttentionByThreadId.value["t-b"]).toBe(true);
    expect(chirp.playTerminalChirp).toHaveBeenCalledTimes(1);
  });

  it("does not set idle attention when active thread gets done state", async () => {
    const { idleAttentionByThreadId } = mountHarness([thread("t-a")], "t-a");
    await flushPromises();

    hookHandler!("t-a", "done");
    await flushPromises();

    expect(idleAttentionByThreadId.value["t-a"]).toBeUndefined();
    expect(chirp.playTerminalChirp).not.toHaveBeenCalled();
  });

  it("sets idle attention and chirps on needsReview for non-active thread", async () => {
    const { runStatusByThreadId, idleAttentionByThreadId } = mountHarness(
      [thread("t-a"), thread("t-b")],
      "t-a"
    );
    await flushPromises();

    hookHandler!("t-b", "needsReview");
    await flushPromises();

    expect(runStatusByThreadId.value["t-b"]).toBe("needsReview");
    expect(idleAttentionByThreadId.value["t-b"]).toBe(true);
    expect(chirp.playTerminalChirp).toHaveBeenCalledTimes(1);
  });

  it("sets idle attention on failed for non-active thread", async () => {
    const { runStatusByThreadId, idleAttentionByThreadId } = mountHarness(
      [thread("t-a"), thread("t-b")],
      "t-a"
    );
    await flushPromises();

    hookHandler!("t-b", "failed");
    await flushPromises();

    expect(runStatusByThreadId.value["t-b"]).toBe("failed");
    expect(idleAttentionByThreadId.value["t-b"]).toBe(true);
  });

  it("does not chirp when notifications are disabled", async () => {
    const { idleAttentionByThreadId } = mountHarness(
      [thread("t-a"), thread("t-b")],
      "t-a",
      false
    );
    await flushPromises();

    hookHandler!("t-b", "done");
    await flushPromises();

    expect(idleAttentionByThreadId.value["t-b"]).toBe(true);
    expect(chirp.playTerminalChirp).not.toHaveBeenCalled();
  });

  it("clears idle attention when running hook fires (new activity)", async () => {
    const { idleAttentionByThreadId } = mountHarness([thread("t-a"), thread("t-b")], "t-a");
    await flushPromises();

    hookHandler!("t-b", "done");
    await flushPromises();
    expect(idleAttentionByThreadId.value["t-b"]).toBe(true);

    hookHandler!("t-b", "running");
    await flushPromises();
    expect(idleAttentionByThreadId.value["t-b"]).toBeUndefined();
  });

  it("clears idle attention when activeThreadId becomes that thread", async () => {
    const { idleAttentionByThreadId, active } = mountHarness(
      [thread("t-a"), thread("t-b")],
      "t-a"
    );
    await flushPromises();

    hookHandler!("t-b", "done");
    await flushPromises();
    expect(idleAttentionByThreadId.value["t-b"]).toBe(true);

    active.value = "t-b";
    await flushPromises();
    expect(idleAttentionByThreadId.value["t-b"]).toBeUndefined();
  });

  it("clearIdleAttention removes the flag", async () => {
    const { idleAttentionByThreadId, clearIdleAttention } = mountHarness(
      [thread("t-a"), thread("t-b")],
      "t-a"
    );
    await flushPromises();

    hookHandler!("t-b", "done");
    await flushPromises();
    expect(idleAttentionByThreadId.value["t-b"]).toBe(true);

    clearIdleAttention("t-b");
    expect(idleAttentionByThreadId.value["t-b"]).toBeUndefined();
  });

  it("ignores unknown state strings", async () => {
    const { runStatusByThreadId, idleAttentionByThreadId } = mountHarness(
      [thread("t-a"), thread("t-b")],
      "t-a"
    );
    await flushPromises();

    hookHandler!("t-b", "bogus");
    await flushPromises();

    expect(runStatusByThreadId.value["t-b"]).toBeUndefined();
    expect(idleAttentionByThreadId.value["t-b"]).toBeUndefined();
    expect(chirp.playTerminalChirp).not.toHaveBeenCalled();
  });

  it("markUserInput is a no-op (kept for API compat)", async () => {
    const { markUserInput, idleAttentionByThreadId } = mountHarness(
      [thread("t-a"), thread("t-b")],
      "t-a"
    );
    await flushPromises();

    markUserInput("t-b");
    hookHandler!("t-b", "done");
    await flushPromises();

    // idle attention still fires — markUserInput no longer suppresses
    expect(idleAttentionByThreadId.value["t-b"]).toBe(true);
  });
});
