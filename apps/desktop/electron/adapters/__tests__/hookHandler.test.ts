// electron/adapters/__tests__/hookHandler.test.ts
import { describe, it, expect, vi } from "vitest";
import { handleHookEvent } from "../hookHandler";
import type { HookHandlerDeps } from "../hookHandler";

function makeDeps(overrides: Partial<HookHandlerDeps> = {}): HookHandlerDeps {
  return {
    workspaceService: {
      captureResumeId: vi.fn().mockReturnValue(true),
      maybeRenameThreadFromPrompt: vi.fn().mockReturnValue(true),
      renameThread: vi.fn(),
      getSnapshot: vi.fn().mockReturnValue({ projects: [], threads: [] }),
    } as unknown as HookHandlerDeps["workspaceService"],
    onChanged: vi.fn(),
    onNotification: vi.fn(),
    onRunStateChanged: vi.fn(),
    ...overrides,
  };
}

describe("handleHookEvent", () => {
  it("SessionStart → captureResumeId only", () => {
    const deps = makeDeps();
    handleHookEvent({ hook_event_name: "SessionStart", session_id: "sid-abc" }, "thread-1", deps);
    expect(deps.workspaceService.captureResumeId).toHaveBeenCalledWith("thread-1", "sid-abc");
    expect(deps.onChanged).toHaveBeenCalled();
    expect(deps.onRunStateChanged).not.toHaveBeenCalled();
  });

  it("SessionStart with no session_id does nothing", () => {
    const deps = makeDeps();
    handleHookEvent({ hook_event_name: "SessionStart" }, "thread-1", deps);
    expect(deps.workspaceService.captureResumeId).not.toHaveBeenCalled();
  });

  it("SessionStart accepts camelCase sessionId", () => {
    const deps = makeDeps();
    handleHookEvent({ hook_event_name: "SessionStart", sessionId: "sid-cursor" }, "thread-1", deps);
    expect(deps.workspaceService.captureResumeId).toHaveBeenCalledWith("thread-1", "sid-cursor");
  });

  it("UserPromptSubmit → maybeRenameThreadFromPrompt with prompt text", () => {
    const deps = makeDeps();
    handleHookEvent(
      { hook_event_name: "UserPromptSubmit", prompt: "build a login page" },
      "thread-1",
      deps
    );
    expect(deps.workspaceService.maybeRenameThreadFromPrompt).toHaveBeenCalledWith(
      "thread-1",
      "build a login page"
    );
    expect(deps.onChanged).toHaveBeenCalled();
  });

  it("UserPromptSubmit captures resumeId when session_id is present (Cursor Start mapping)", () => {
    const deps = makeDeps();
    handleHookEvent(
      { hook_event_name: "UserPromptSubmit", prompt: "build a login page", session_id: "sid-cursor-1" },
      "thread-1",
      deps
    );
    expect(deps.workspaceService.captureResumeId).toHaveBeenCalledWith("thread-1", "sid-cursor-1");
  });

  it("BeforeAgent (Gemini) → maybeRenameThreadFromPrompt", () => {
    const deps = makeDeps();
    handleHookEvent(
      { hook_event_name: "BeforeAgent", prompt: "refactor the auth module" },
      "thread-2",
      deps
    );
    expect(deps.workspaceService.maybeRenameThreadFromPrompt).toHaveBeenCalledWith(
      "thread-2",
      "refactor the auth module"
    );
  });

  it("UserPromptSubmit accepts `input` field for prompt extraction", () => {
    const deps = makeDeps();
    handleHookEvent(
      { hook_event_name: "UserPromptSubmit", input: "ship release notes UI" },
      "thread-3",
      deps
    );
    expect(deps.workspaceService.maybeRenameThreadFromPrompt).toHaveBeenCalledWith(
      "thread-3",
      "ship release notes UI"
    );
  });

  it("UserPromptSubmit accepts OpenAI-style messages[] user content", () => {
    const deps = makeDeps();
    handleHookEvent(
      {
        hook_event_name: "UserPromptSubmit",
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Refactor the payment webhook" }
        ]
      },
      "thread-msg",
      deps
    );
    expect(deps.workspaceService.maybeRenameThreadFromPrompt).toHaveBeenCalledWith(
      "thread-msg",
      "Refactor the payment webhook"
    );
  });

  it("UserPromptSubmit accepts string `content` at top level", () => {
    const deps = makeDeps();
    handleHookEvent(
      { hook_event_name: "UserPromptSubmit", content: "Add integration tests for hooks" },
      "thread-c",
      deps
    );
    expect(deps.workspaceService.maybeRenameThreadFromPrompt).toHaveBeenCalledWith(
      "thread-c",
      "Add integration tests for hooks"
    );
  });

  it("BeforeAgent accepts nested payload prompt fields", () => {
    const deps = makeDeps();
    handleHookEvent(
      { hook_event_name: "BeforeAgent", payload: { chat_prompt: "optimize sidebar render" } },
      "thread-4",
      deps
    );
    expect(deps.workspaceService.maybeRenameThreadFromPrompt).toHaveBeenCalledWith(
      "thread-4",
      "optimize sidebar render"
    );
  });

  it("Stop → onNotification done + onRunStateChanged done", () => {
    const deps = makeDeps();
    handleHookEvent({ hook_event_name: "Stop" }, "thread-1", deps);
    expect(deps.onNotification).toHaveBeenCalledWith("done", "thread-1");
    expect(deps.onRunStateChanged).toHaveBeenCalledWith("done", "thread-1");
  });

  it("Stop with conversation_title → renameThread Phase 2", () => {
    const deps = makeDeps();
    handleHookEvent(
      { hook_event_name: "Stop", conversation_title: "Add login page" },
      "thread-1",
      deps
    );
    expect(deps.workspaceService.renameThread).toHaveBeenCalledWith("thread-1", "Add login page");
    expect(deps.onChanged).toHaveBeenCalled();
    expect(deps.onNotification).toHaveBeenCalledWith("done", "thread-1");
  });

  it("Stop with chat_title renames (alternate agent field)", () => {
    const deps = makeDeps({
      workspaceService: {
        captureResumeId: vi.fn().mockReturnValue(true),
        maybeRenameThreadFromPrompt: vi.fn().mockReturnValue(true),
        renameThread: vi.fn(),
        getSnapshot: vi.fn().mockReturnValue({
          projects: [],
          threads: [{ id: "thread-1", title: "Old" }]
        })
      } as unknown as HookHandlerDeps["workspaceService"]
    });
    handleHookEvent(
      { hook_event_name: "Stop", chat_title: "Migrate auth to OAuth" },
      "thread-1",
      deps
    );
    expect(deps.workspaceService.renameThread).toHaveBeenCalledWith("thread-1", "Migrate auth to OAuth");
  });

  it("Stop without title → no renameThread called", () => {
    const deps = makeDeps();
    handleHookEvent({ hook_event_name: "Stop" }, "thread-1", deps);
    expect(deps.workspaceService.renameThread).not.toHaveBeenCalled();
  });

  it("Stop with thread_title normalizes before rename", () => {
    const deps = makeDeps({
      workspaceService: {
        captureResumeId: vi.fn().mockReturnValue(true),
        maybeRenameThreadFromPrompt: vi.fn().mockReturnValue(true),
        renameThread: vi.fn(),
        getSnapshot: vi.fn().mockReturnValue({
          projects: [],
          threads: [{ id: "thread-1", title: "Old title" }],
        }),
      } as unknown as HookHandlerDeps["workspaceService"],
    });
    handleHookEvent(
      { hook_event_name: "Stop", thread_title: "  Add\nlogin page  " },
      "thread-1",
      deps
    );
    expect(deps.workspaceService.renameThread).toHaveBeenCalledWith("thread-1", "Add login page");
  });

  it("ThreadTitle hook renames thread", () => {
    const deps = makeDeps({
      workspaceService: {
        captureResumeId: vi.fn().mockReturnValue(true),
        maybeRenameThreadFromPrompt: vi.fn().mockReturnValue(true),
        renameThread: vi.fn(),
        getSnapshot: vi.fn().mockReturnValue({
          projects: [],
          threads: [{ id: "thread-1", title: "Old title" }],
        }),
      } as unknown as HookHandlerDeps["workspaceService"],
    });
    handleHookEvent(
      { hook_event_name: "ThreadTitle", title: "Refactor auth flow" },
      "thread-1",
      deps
    );
    expect(deps.workspaceService.renameThread).toHaveBeenCalledWith("thread-1", "Refactor auth flow");
    expect(deps.onChanged).toHaveBeenCalled();
  });

  it("ThreadTitle hook with unchanged title does nothing", () => {
    const deps = makeDeps({
      workspaceService: {
        captureResumeId: vi.fn().mockReturnValue(true),
        maybeRenameThreadFromPrompt: vi.fn().mockReturnValue(true),
        renameThread: vi.fn(),
        getSnapshot: vi.fn().mockReturnValue({
          projects: [],
          threads: [{ id: "thread-1", title: "Refactor auth flow" }],
        }),
      } as unknown as HookHandlerDeps["workspaceService"],
    });
    handleHookEvent(
      { hook_event_name: "ThreadTitle", title: " Refactor   auth flow " },
      "thread-1",
      deps
    );
    expect(deps.workspaceService.renameThread).not.toHaveBeenCalled();
  });

  it("renames from nested payload title on Stop", () => {
    const deps = makeDeps({
      workspaceService: {
        captureResumeId: vi.fn().mockReturnValue(true),
        maybeRenameThreadFromPrompt: vi.fn().mockReturnValue(true),
        renameThread: vi.fn(),
        getSnapshot: vi.fn().mockReturnValue({
          projects: [],
          threads: [{ id: "thread-1", title: "Old title" }],
        }),
      } as unknown as HookHandlerDeps["workspaceService"],
    });
    handleHookEvent(
      { hook_event_name: "Stop", payload: { conversation: { title: "Nested new title" } } },
      "thread-1",
      deps
    );
    expect(deps.workspaceService.renameThread).toHaveBeenCalledWith("thread-1", "Nested new title");
  });

  it("handles non-standard title event names", () => {
    const deps = makeDeps({
      workspaceService: {
        captureResumeId: vi.fn().mockReturnValue(true),
        maybeRenameThreadFromPrompt: vi.fn().mockReturnValue(true),
        renameThread: vi.fn(),
        getSnapshot: vi.fn().mockReturnValue({
          projects: [],
          threads: [{ id: "thread-1", title: "Old title" }],
        }),
      } as unknown as HookHandlerDeps["workspaceService"],
    });
    handleHookEvent(
      { hook_event_name: "conversation_title_updated", title: "Updated from custom event" },
      "thread-1",
      deps
    );
    expect(deps.workspaceService.renameThread).toHaveBeenCalledWith(
      "thread-1",
      "Updated from custom event"
    );
  });

  it("AfterAgent → onNotification done", () => {
    const deps = makeDeps();
    handleHookEvent({ hook_event_name: "AfterAgent" }, "thread-1", deps);
    expect(deps.onNotification).toHaveBeenCalledWith("done", "thread-1");
  });

  it("StopFailure → onNotification failed", () => {
    const deps = makeDeps();
    handleHookEvent({ hook_event_name: "StopFailure" }, "thread-1", deps);
    expect(deps.onNotification).toHaveBeenCalledWith("failed", "thread-1");
  });

  it("Notification → onNotification needsReview when type is permission_request", () => {
    const deps = makeDeps();
    handleHookEvent(
      { hook_event_name: "Notification", type: "permission_request", message: "allow rm?" },
      "thread-1",
      deps
    );
    expect(deps.onNotification).toHaveBeenCalledWith("needsReview", "thread-1");
  });

  it("Notification without permission type → onNotification done", () => {
    const deps = makeDeps();
    handleHookEvent(
      { hook_event_name: "Notification", message: "Task complete" },
      "thread-1",
      deps
    );
    expect(deps.onNotification).toHaveBeenCalledWith("done", "thread-1");
  });

  it("unknown event → does nothing", () => {
    const deps = makeDeps();
    handleHookEvent({ hook_event_name: "SomeUnknownEvent" }, "thread-1", deps);
    expect(deps.onChanged).not.toHaveBeenCalled();
    expect(deps.onNotification).not.toHaveBeenCalled();
  });

  it("empty threadId → does nothing", () => {
    const deps = makeDeps();
    handleHookEvent({ hook_event_name: "SessionStart", session_id: "sid-abc" }, "", deps);
    expect(deps.workspaceService.captureResumeId).not.toHaveBeenCalled();
    expect(deps.onChanged).not.toHaveBeenCalled();
  });
});
