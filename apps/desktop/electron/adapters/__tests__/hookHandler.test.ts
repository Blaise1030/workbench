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
    ...overrides,
  };
}

describe("handleHookEvent", () => {
  it("SessionStart → captureResumeId", () => {
    const deps = makeDeps();
    handleHookEvent({ hook_event_name: "SessionStart", session_id: "sid-abc" }, "thread-1", deps);
    expect(deps.workspaceService.captureResumeId).toHaveBeenCalledWith("thread-1", "sid-abc");
    expect(deps.onChanged).toHaveBeenCalled();
  });

  it("SessionStart with no session_id does nothing", () => {
    const deps = makeDeps();
    handleHookEvent({ hook_event_name: "SessionStart" }, "thread-1", deps);
    expect(deps.workspaceService.captureResumeId).not.toHaveBeenCalled();
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

  it("Stop → onNotification done", () => {
    const deps = makeDeps();
    handleHookEvent({ hook_event_name: "Stop" }, "thread-1", deps);
    expect(deps.onNotification).toHaveBeenCalledWith("done", "thread-1");
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

  it("Stop without title → no renameThread called", () => {
    const deps = makeDeps();
    handleHookEvent({ hook_event_name: "Stop" }, "thread-1", deps);
    expect(deps.workspaceService.renameThread).not.toHaveBeenCalled();
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
