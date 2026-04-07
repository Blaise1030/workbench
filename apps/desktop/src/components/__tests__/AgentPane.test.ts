import { h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import AgentPane from "@/components/AgentPane.vue";

const terminalPanePropsSpy = vi.hoisted(() => vi.fn());

vi.mock("@/components/TerminalPane.vue", () => ({
  default: {
    props: ["worktreeId", "threadId", "cwd", "pendingAgentBootstrap", "ptyKind"],
    emits: ["bootstrapConsumed"],
    setup(props: Record<string, unknown>, { emit }: { emit: (event: string) => void }) {
      terminalPanePropsSpy(props);
      return () =>
        h("div", {
          "data-testid": "terminal-pane",
          onClick: () => emit("bootstrapConsumed")
        });
    }
  }
}));

function renderAgentPane(
  props: Partial<{
    threadId: string;
    worktreeId: string;
    cwd: string;
    draft: string;
    pendingAgentBootstrap?: { threadId: string; command: string } | null;
  }> = {}
) {
  return mount(AgentPane, {
    props: {
      threadId: "thread-1",
      worktreeId: "worktree-1",
      cwd: "/tmp/instrument",
      draft: "Initial draft",
      ...props
    }
  });
}

describe("AgentPane", () => {
  afterEach(() => {
    terminalPanePropsSpy.mockClear();
  });

  it("renders the incoming draft", async () => {
    const wrapper = renderAgentPane();

    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe("Initial draft");
  });

  it("emits updateDraft when typing in the textarea", async () => {
    const wrapper = renderAgentPane();

    await wrapper.get("textarea").setValue("Updated draft");

    expect(wrapper.emitted("updateDraft")).toEqual([["Updated draft"]]);
  });

  it("emits sendDraft when Send draft is clicked", async () => {
    const wrapper = renderAgentPane();

    await wrapper.get('[data-testid="agent-send-draft"]').trigger("click");

    expect(wrapper.emitted("sendDraft")).toEqual([[]]);
  });

  it("emits discardDraft when Discard draft is clicked", async () => {
    const wrapper = renderAgentPane();

    await wrapper.get('[data-testid="agent-discard-draft"]').trigger("click");

    expect(wrapper.emitted("discardDraft")).toEqual([[]]);
  });

  it("re-emits bootstrapConsumed when TerminalPane consumes the bootstrap command", async () => {
    const wrapper = renderAgentPane({
      pendingAgentBootstrap: { threadId: "thread-1", command: "codex bootstrap" }
    });

    await wrapper.get('[data-testid="terminal-pane"]').trigger("click");

    expect(wrapper.emitted("bootstrapConsumed")).toEqual([[]]);
  });

  it("renders TerminalPane inside the wrapper", async () => {
    const wrapper = renderAgentPane();

    expect(wrapper.get('[data-testid="terminal-pane"]')).toBeTruthy();
  });

  it('passes pty-kind="agent" to TerminalPane', async () => {
    renderAgentPane();

    expect(terminalPanePropsSpy).toHaveBeenCalled();
    expect(terminalPanePropsSpy.mock.calls[0][0]).toMatchObject({ ptyKind: "agent" });
  });
});
