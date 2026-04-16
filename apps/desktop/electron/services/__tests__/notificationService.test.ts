import { describe, expect, it, vi, beforeEach } from "vitest";
import { NotificationService } from "../notificationService";

const { mockNotificationConstructor } = vi.hoisted(() => {
  const showMock = vi.fn();
  const ctor = vi.fn().mockImplementation(() => ({ show: showMock }));
  (ctor as unknown as { isSupported: () => boolean }).isSupported = () => true;
  return { mockNotificationConstructor: ctor };
});

// Mock Electron's Notification class (not available in jsdom)
vi.mock("electron", () => ({
  Notification: mockNotificationConstructor,
}));

describe("notification service", () => {
  it("maps states to tones", () => {
    const service = new NotificationService();
    expect(service.getTone("done")).toBe("Do");
    expect(service.getTone("needsReview")).toBe("Mi");
    expect(service.getTone("failed")).toBe("Fa");
    expect(service.getTone("previewReady")).toBe("So");
  });

  it("trigger creates and shows an Electron Notification", async () => {
    const { Notification } = await import("electron");
    const showMock = vi.fn();
    (Notification as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      show: showMock,
    }));
    const service = new NotificationService();
    service.trigger("done", "MyProject", "Build the login page");
    expect(Notification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "MyProject", body: "MyProject, Build the login page needs attention" })
    );
    expect(showMock).toHaveBeenCalled();
  });

  it("trigger is a no-op when Notification.isSupported() returns false", async () => {
    const { Notification } = await import("electron");
    const mockNotification = vi.fn();
    (Notification as unknown as { isSupported: () => boolean }).isSupported = () => false;
    (Notification as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockNotification);
    const service = new NotificationService();
    service.trigger("done", "MyProject", "Build the login page");
    expect(mockNotification).not.toHaveBeenCalled();
  });
});
