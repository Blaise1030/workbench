import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn()
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => []
  }
}));

vi.mock("node-pty", () => ({
  spawn: spawnMock
}));

import { buildPtyEnv, PtyService } from "../ptyService";

describe("buildPtyEnv", () => {
  it("adds common macOS shell paths without duplicating existing entries", () => {
    const env = buildPtyEnv(
      {
        PATH: "/usr/bin:/custom/bin:/opt/homebrew/bin:/usr/local/bin:/custom/bin",
        SHELL: "/bin/zsh"
      },
      undefined,
      "darwin"
    );

    expect(env.PATH).toBe(
      "/usr/bin:/custom/bin:/opt/homebrew/bin:/usr/local/bin:/bin:/usr/sbin:/sbin"
    );
  });

  it("lets extraEnv override base env before PATH normalization", () => {
    const env = buildPtyEnv(
      {
        PATH: "/usr/bin",
        FOO: "base"
      },
      {
        PATH: "/custom/bin:/usr/bin",
        FOO: "override"
      },
      "darwin"
    );

    expect(env.PATH).toBe(
      "/custom/bin:/usr/bin:/opt/homebrew/bin:/usr/local/bin:/bin:/usr/sbin:/sbin"
    );
    expect(env.FOO).toBe("override");
  });
});

describe("PtyService.getOrCreate", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    spawnMock.mockReturnValue({
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn()
    });
  });

  it("accepts an optional extraEnv parameter", () => {
    const service = new PtyService();
    expect(service.getOrCreate.length).toBeLessThanOrEqual(4);
  });

  it("passes the normalized env to node-pty", () => {
    const service = new PtyService();
    const originalShell = process.env.SHELL;
    process.env.SHELL = "/bin/zsh";

    try {
      service.getOrCreate("session-1", "/tmp", "wt-1", { PATH: "/custom/bin:/usr/bin" });
    } finally {
      process.env.SHELL = originalShell;
    }

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock.mock.calls[0]?.[2]?.env.PATH).toBeDefined();
    expect(spawnMock.mock.calls[0]?.[2]?.env.PATH).toContain("/custom/bin");
  });
});
