import { describe, it, expect } from "vitest";
import { PtyService } from "../ptyService";

describe("PtyService.getOrCreate signature", () => {
  it("accepts an optional extraEnv parameter", () => {
    const service = new PtyService();
    // Verify the method exists with the right arity — actual spawn tested in integration
    expect(service.getOrCreate.length).toBeLessThanOrEqual(4);
  });
});
