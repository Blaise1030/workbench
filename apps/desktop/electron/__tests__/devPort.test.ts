import { describe, expect, it } from "vitest";

type DevPortModule = {
  getDevPort: (env?: NodeJS.ProcessEnv) => string;
  getDevServerUrl: (env?: NodeJS.ProcessEnv) => string;
};

const { getDevPort, getDevServerUrl } = require("../../build/devPort.cjs") as DevPortModule;

describe("desktop dev port helpers", () => {
  it("defaults to port 5180 when PORT is unset", () => {
    expect(getDevPort({})).toBe("5180");
    expect(getDevServerUrl({})).toBe("http://localhost:5180");
  });

  it("uses PORT when it is set", () => {
    expect(getDevPort({ PORT: "5191" })).toBe("5191");
    expect(getDevServerUrl({ PORT: "5191" })).toBe("http://localhost:5191");
  });
});
