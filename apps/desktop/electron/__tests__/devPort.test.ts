import { describe, expect, it } from "vitest";

describe("desktop dev port helpers", () => {
  it("defaults to port 5180 when PORT is unset", async () => {
    const { getDevPort, getDevServerUrl } = await import("../../build/devPort.cjs");

    expect(getDevPort({})).toBe("5180");
    expect(getDevServerUrl({})).toBe("http://localhost:5180");
  });

  it("uses PORT when it is set", async () => {
    const { getDevPort, getDevServerUrl } = await import("../../build/devPort.cjs");

    expect(getDevPort({ PORT: "5191" })).toBe("5191");
    expect(getDevServerUrl({ PORT: "5191" })).toBe("http://localhost:5191");
  });
});
