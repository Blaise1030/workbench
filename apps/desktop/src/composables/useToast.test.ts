import { beforeEach, describe, expect, it, vi } from "vitest";
import { hydratePersistedToasts, useToast } from "./useToast";

const {
  toastSuccessMock,
  toastErrorMock,
  toastDismissMock
} = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(() => "success-id"),
  toastErrorMock: vi.fn(() => "error-id"),
  toastDismissMock: vi.fn()
}));

vi.mock("vue-sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
    dismiss: toastDismissMock
  }
}));

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T10:00:00.000Z"));
    localStorage.clear();
    toastSuccessMock.mockClear();
    toastErrorMock.mockClear();
    toastDismissMock.mockClear();
  });

  it("persists success toast and forwards to shadcn toast", () => {
    const toast = useToast();
    const id = toast.success("Push succeeded", "Branch main pushed.");

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Push succeeded", {
      description: "Branch main pushed.",
      duration: 5_000,
      id: expect.any(String)
    });

    const persisted = JSON.parse(localStorage.getItem("instrument.toast.items") ?? "[]");
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      title: "Push succeeded",
      description: "Branch main pushed.",
      variant: "success"
    });
  });

  it("replays active persisted toasts and drops expired ones", () => {
    const now = Date.now();
    localStorage.setItem(
      "instrument.toast.items",
      JSON.stringify([
        {
          id: "active-error",
          title: "Push failed",
          description: "Remote rejected branch.",
          variant: "error",
          expiresAt: now + 8_000
        },
        {
          id: "expired-success",
          title: "Done",
          description: "Old toast",
          variant: "success",
          expiresAt: now - 1
        }
      ])
    );

    hydratePersistedToasts();

    expect(toastErrorMock).toHaveBeenCalledWith("Push failed", {
      id: "active-error",
      description: "Remote rejected branch.",
      duration: 8_000
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();

    const persisted = JSON.parse(localStorage.getItem("instrument.toast.items") ?? "[]");
    expect(persisted).toHaveLength(1);
    expect(persisted[0].id).toBe("active-error");
  });
});
