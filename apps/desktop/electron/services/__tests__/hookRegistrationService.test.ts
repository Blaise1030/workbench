// electron/services/__tests__/hookRegistrationService.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ensureScriptsInstalled,
  registerAgentHooks,
  registerCursorHooks,
  HOOK_EVENTS,
} from "../hookRegistrationService";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "instrument-hook-test-"));
}

describe("ensureScriptsInstalled", () => {
  it("writes executable scripts for all four agents", () => {
    const dir = tmpDir();
    ensureScriptsInstalled(dir);
    for (const agent of ["claude", "gemini", "codex", "cursor"]) {
      const scriptPath = path.join(dir, `${agent}-hook.sh`);
      expect(fs.existsSync(scriptPath)).toBe(true);
      const content = fs.readFileSync(scriptPath, "utf8");
      expect(content).toContain("INSTRUMENT_HOOK_URL");
      expect(content).toContain("INSTRUMENT_THREAD_ID");
    }
  });

  it("rewrites scripts when content hash is stale", () => {
    const dir = tmpDir();
    ensureScriptsInstalled(dir);
    const scriptPath = path.join(dir, "claude-hook.sh");
    fs.writeFileSync(scriptPath, "stale content");
    fs.writeFileSync(path.join(dir, "claude-hook.hash"), "bad-hash");
    ensureScriptsInstalled(dir);
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).toContain("INSTRUMENT_HOOK_URL");
  });

  it("skips rewriting when hash is current", () => {
    const dir = tmpDir();
    ensureScriptsInstalled(dir);
    const scriptPath = path.join(dir, "claude-hook.sh");
    const mtime1 = fs.statSync(scriptPath).mtimeMs;
    ensureScriptsInstalled(dir);
    const mtime2 = fs.statSync(scriptPath).mtimeMs;
    expect(mtime2).toBe(mtime1);
  });
});

describe("registerAgentHooks", () => {
  it("creates settings file with hook entries when none exists", () => {
    const dir = tmpDir();
    const settingsPath = path.join(dir, "settings.json");
    const scriptPath = path.join(dir, "claude-hook.sh");
    registerAgentHooks(settingsPath, scriptPath, HOOK_EVENTS.claude);
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    expect(settings.hooks.Stop).toHaveLength(1);
    expect(settings.hooks.Stop[0].hooks[0].command).toBe(`"${scriptPath}"`);
  });

  it("appends to existing hooks without overwriting them", () => {
    const dir = tmpDir();
    const settingsPath = path.join(dir, "settings.json");
    const scriptPath = path.join(dir, "claude-hook.sh");
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "/existing/hook.sh" }] }],
        },
      })
    );
    registerAgentHooks(settingsPath, scriptPath, HOOK_EVENTS.claude);
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    expect(settings.hooks.Stop).toHaveLength(2);
    expect(settings.hooks.Stop[0].hooks[0].command).toBe("/existing/hook.sh");
    expect(settings.hooks.Stop[1].hooks[0].command).toBe(`"${scriptPath}"`);
  });

  it("does not duplicate entries when called twice", () => {
    const dir = tmpDir();
    const settingsPath = path.join(dir, "settings.json");
    const scriptPath = path.join(dir, "claude-hook.sh");
    registerAgentHooks(settingsPath, scriptPath, HOOK_EVENTS.claude);
    registerAgentHooks(settingsPath, scriptPath, HOOK_EVENTS.claude);
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    expect(settings.hooks.Stop).toHaveLength(1);
  });
});

describe("registerCursorHooks", () => {
  it("writes Cursor hooks to hooks.json using cursor event keys", () => {
    const dir = tmpDir();
    const hooksPath = path.join(dir, "hooks.json");
    const scriptPath = path.join(dir, "cursor-hook.sh");
    registerCursorHooks(hooksPath, scriptPath);
    const settings = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
    expect(settings.version).toBe(1);
    expect(settings.hooks.beforeSubmitPrompt).toHaveLength(1);
    expect(settings.hooks.stop).toHaveLength(1);
    expect(settings.hooks.beforeSubmitPrompt[0].command).toBe(`"${scriptPath}"`);
  });

  it("does not duplicate Cursor hooks when called twice", () => {
    const dir = tmpDir();
    const hooksPath = path.join(dir, "hooks.json");
    const scriptPath = path.join(dir, "cursor-hook.sh");
    registerCursorHooks(hooksPath, scriptPath);
    registerCursorHooks(hooksPath, scriptPath);
    const settings = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
    expect(settings.hooks.beforeSubmitPrompt).toHaveLength(1);
    expect(settings.hooks.stop).toHaveLength(1);
  });
});
