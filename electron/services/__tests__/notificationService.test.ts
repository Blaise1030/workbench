import { describe, expect, it } from "vitest";
import { NotificationService } from "../notificationService";

describe("notification service", () => {
  it("maps states to tones", () => {
    const service = new NotificationService();
    expect(service.getTone("done")).toBe("Do");
    expect(service.getTone("needsReview")).toBe("Mi");
    expect(service.getTone("failed")).toBe("Fa");
    expect(service.getTone("previewReady")).toBe("So");
  });
});
