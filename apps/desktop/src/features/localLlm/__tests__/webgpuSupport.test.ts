import { afterEach, describe, expect, it, vi } from "vitest";
import { isWebGpuUsable } from "@/features/localLlm/webgpuSupport";

describe("isWebGpuUsable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when navigator.gpu is undefined", async () => {
    vi.stubGlobal("navigator", { ...globalThis.navigator, gpu: undefined });
    await expect(isWebGpuUsable()).resolves.toBe(false);
  });

  it("returns true when requestAdapter resolves a non-null adapter", async () => {
    const fakeAdapter = {};
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue(fakeAdapter),
      },
    });
    await expect(isWebGpuUsable()).resolves.toBe(true);
  });
});
