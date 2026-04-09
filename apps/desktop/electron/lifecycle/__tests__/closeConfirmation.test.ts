import { describe, expect, it, vi } from "vitest";
import { buildCloseConfirmationDetail, shouldAllowAppClose } from "../closeConfirmation";

describe("shouldAllowAppClose", () => {
  it("allows close immediately when already confirmed", async () => {
    const prompt = vi.fn(async () => false);

    await expect(shouldAllowAppClose(true, prompt)).resolves.toBe(true);
    expect(prompt).not.toHaveBeenCalled();
  });

  it("blocks close when user cancels the popup", async () => {
    const prompt = vi.fn(async () => false);

    await expect(shouldAllowAppClose(false, prompt)).resolves.toBe(false);
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("allows close when user confirms in the popup", async () => {
    const prompt = vi.fn(async () => true);

    await expect(shouldAllowAppClose(false, prompt)).resolves.toBe(true);
    expect(prompt).toHaveBeenCalledTimes(1);
  });
});

describe("buildCloseConfirmationDetail", () => {
  it("shows terminal count and no resume ids when none are found", () => {
    expect(buildCloseConfirmationDetail(2, [])).toBe(
      "You have 2 active terminal instances. Close is blocked until you click Confirm."
    );
  });

  it("uses singular terminal label", () => {
    expect(buildCloseConfirmationDetail(1, [])).toBe(
      "You have 1 active terminal instance. Close is blocked until you click Confirm."
    );
  });

  it("includes detected resume ids", () => {
    expect(buildCloseConfirmationDetail(3, ["abc-123", "def-456"])).toBe(
      "You have 3 active terminal instances. Resume IDs detected: abc-123, def-456. Close is blocked until you click Confirm."
    );
  });
});
