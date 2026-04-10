import { defineComponent, ref, type Ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread, ThreadAgent } from "@shared/domain";
import { useThreadPtyRunStatus } from "../useThreadPtyRunStatus";
import * as chirp from "@/terminal/playTerminalChirp";
import type { TerminalActivitySensitivity } from "@/terminal/activitySensitivity";

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
  updatedAt: ""
});

describe("useThreadPtyRunStatus", () => {
  let ptyHandler: ((sessionId: string, data: string) => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(chirp.playTerminalChirp).mockClear();
    ptyHandler = null;
    vi.stubGlobal("window", {
      ...window,
      workspaceApi: {
        onPtyData: (cb: (sessionId: string, data: string) => void) => {
          ptyHandler = cb;
          return () => {
            ptyHandler = null;
          };
        }
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function mountHarness(
    threads: Thread[],
    activeThreadId: string | null,
    notificationsEnabled = true,
    sensitivity: TerminalActivitySensitivity = "low"
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
          notificationsEnabled: notif,
          activitySensitivity: ref(sensitivity)
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

  it("sets idle attention and chirps when running thread goes idle while not the active thread", async () => {
    const { runStatusByThreadId, idleAttentionByThreadId } = mountHarness(
      [thread("t-a"), thread("t-b")],
      "t-a"
    );
    await flushPromises();
    expect(ptyHandler).not.toBeNull();

    ptyHandler!("t-b", "hello\n");
    expect(runStatusByThreadId.value["t-b"]).toBe("running");

    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(runStatusByThreadId.value["t-b"]).toBeUndefined();
    expect(idleAttentionByThreadId.value["t-b"]).toBe(true);
    expect(chirp.playTerminalChirp).toHaveBeenCalledTimes(1);
  });

  it("does not set idle attention when output thread is the active thread", async () => {
    const { runStatusByThreadId, idleAttentionByThreadId } = mountHarness([thread("t-a")], "t-a");
    await flushPromises();

    ptyHandler!("t-a", "hello\n");
    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(runStatusByThreadId.value["t-a"]).toBeUndefined();
    expect(idleAttentionByThreadId.value["t-a"]).toBeUndefined();
    expect(chirp.playTerminalChirp).not.toHaveBeenCalled();
  });

  it("does not chirp when notifications are disabled", async () => {
    const { runStatusByThreadId, idleAttentionByThreadId } = mountHarness(
      [thread("t-a"), thread("t-b")],
      "t-a",
      false
    );
    await flushPromises();

    ptyHandler!("t-b", "hello\n");
    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(idleAttentionByThreadId.value["t-b"]).toBe(true);
    expect(chirp.playTerminalChirp).not.toHaveBeenCalled();
  });

  it("clears idle attention when activeThreadId becomes that thread", async () => {
    const { runStatusByThreadId, idleAttentionByThreadId, active } = mountHarness(
      [thread("t-a"), thread("t-b")],
      "t-a"
    );
    await flushPromises();

    ptyHandler!("t-b", "hello\n");
    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(idleAttentionByThreadId.value["t-b"]).toBe(true);

    active.value = "t-b";
    await flushPromises();
    expect(idleAttentionByThreadId.value["t-b"]).toBeUndefined();
    expect(runStatusByThreadId.value["t-b"]).toBeUndefined();
  });

  it("clearIdleAttention removes the flag", async () => {
    const { idleAttentionByThreadId, clearIdleAttention } = mountHarness(
      [thread("t-a"), thread("t-b")],
      "t-a"
    );
    await flushPromises();

    ptyHandler!("t-b", "hello\n");
    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(idleAttentionByThreadId.value["t-b"]).toBe(true);

    clearIdleAttention("t-b");
    expect(idleAttentionByThreadId.value["t-b"]).toBeUndefined();
  });

  it("clears idle attention when new output arrives", async () => {
    const { idleAttentionByThreadId } = mountHarness([thread("t-b")], "t-a");
    await flushPromises();

    ptyHandler!("t-b", "hello\n");
    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(idleAttentionByThreadId.value["t-b"]).toBe(true);

    ptyHandler!("t-b", "more\n");
    await flushPromises();
    expect(idleAttentionByThreadId.value["t-b"]).toBeUndefined();
  });

  it("ignores CSI-only reflow (resize) so it does not schedule idle chirps", async () => {
    const { runStatusByThreadId, idleAttentionByThreadId } = mountHarness(
      [thread("t-a"), thread("t-b")],
      "t-a"
    );
    await flushPromises();

    ptyHandler!("t-b", "\x1b[2J\x1b[H\x1b[?25h");
    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(runStatusByThreadId.value["t-b"]).toBeUndefined();
    expect(idleAttentionByThreadId.value["t-b"]).toBeUndefined();
    expect(chirp.playTerminalChirp).not.toHaveBeenCalled();
  });

  it("ignores carriage-return loading redraws so they do not schedule idle chirps", async () => {
    const { runStatusByThreadId, idleAttentionByThreadId } = mountHarness(
      [thread("t-a"), thread("t-b")],
      "t-a"
    );
    await flushPromises();

    ptyHandler!("t-b", "Loading...\r");
    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(runStatusByThreadId.value["t-b"]).toBeUndefined();
    expect(idleAttentionByThreadId.value["t-b"]).toBeUndefined();
    expect(chirp.playTerminalChirp).not.toHaveBeenCalled();
  });

  it("uses sensitivity threshold before treating output as activity", async () => {
    const { runStatusByThreadId, idleAttentionByThreadId } = mountHarness(
      [thread("t-a"), thread("t-b")],
      "t-a",
      true,
      "high"
    );
    await flushPromises();

    ptyHandler!("t-b", "ok");
    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(runStatusByThreadId.value["t-b"]).toBeUndefined();
    expect(idleAttentionByThreadId.value["t-b"]).toBeUndefined();
    expect(chirp.playTerminalChirp).not.toHaveBeenCalled();
  });

  it("does not set attention or chirp after idle when output thread matches activeThreadId (shell-tab vs focus)", async () => {
    const { runStatusByThreadId, idleAttentionByThreadId } = mountHarness(
      [thread("t-a"), thread("t-b")],
      "t-b"
    );
    await flushPromises();

    ptyHandler!("t-b", "hello\n");
    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(runStatusByThreadId.value["t-b"]).toBeUndefined();
    expect(idleAttentionByThreadId.value["t-b"]).toBeUndefined();
    expect(chirp.playTerminalChirp).not.toHaveBeenCalled();
  });

  it("suppresses idle attention when markUserInput precedes immediate PTY output", async () => {
    const { idleAttentionByThreadId, markUserInput } = mountHarness([thread("t-a"), thread("t-b")], "t-a");
    await flushPromises();

    markUserInput("t-b");
    ptyHandler!("t-b", "echoed\n");
    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(idleAttentionByThreadId.value["t-b"]).toBeUndefined();
    expect(chirp.playTerminalChirp).not.toHaveBeenCalled();
  });

  it("sets idle attention without markUserInput for the same chunk pattern", async () => {
    const { idleAttentionByThreadId } = mountHarness([thread("t-a"), thread("t-b")], "t-a");
    await flushPromises();

    ptyHandler!("t-b", "echoed\n");
    vi.advanceTimersByTime(1000);
    await flushPromises();

    expect(idleAttentionByThreadId.value["t-b"]).toBe(true);
    expect(chirp.playTerminalChirp).toHaveBeenCalledTimes(1);
  });
});
