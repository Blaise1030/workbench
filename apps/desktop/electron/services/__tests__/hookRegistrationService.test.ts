import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ensureScriptsInstalled,
  registerAgentHooks,
  registerCodexHooks,
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
  it("writes Cursor hooks with event discriminator args", () => {
    const dir = tmpDir();
    const hooksPath = path.join(dir, "hooks.json");
    const scriptPath = path.join(dir, "cursor-hook.sh");
    registerCursorHooks(hooksPath, scriptPath);
    const settings = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
    expect(settings.version).toBe(1);
    expect(settings.hooks.beforeSubmitPrompt).toHaveLength(1);
    expect(settings.hooks.stop).toHaveLength(1);
    expect(settings.hooks.beforeShellExecution).toHaveLength(1);
    expect(settings.hooks.beforeMCPExecution).toHaveLength(1);
    expect(settings.hooks.beforeSubmitPrompt[0].command).toBe(`"${scriptPath}" Start`);
    expect(settings.hooks.beforeShellExecution[0].command).toBe(`"${scriptPath}" PermissionRequest`);
  });

  it("replaces stale Instrument Cursor entries without duplicating", () => {
    const dir = tmpDir();
    const hooksPath = path.join(dir, "hooks.json");
    const scriptPath = path.join(dir, "cursor-hook.sh");
    fs.writeFileSync(hooksPath, JSON.stringify({
      version: 1,
      hooks: {
        stop: [{ command: '"/tmp/cursor-hook.sh"' }],
      },
    }));
    registerCursorHooks(hooksPath, scriptPath);
    const settings = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
    expect(settings.hooks.stop).toHaveLength(1);
    expect(settings.hooks.stop[0].command).toBe(`"${scriptPath}" Stop`);
  });
});

describe("registerCodexHooks", () => {
  it("writes Codex hooks.json and enables codex_hooks in config.toml", () => {
    const dir = tmpDir();
    const configTomlPath = path.join(dir, "config.toml");
    const hooksJsonPath = path.join(dir, "hooks.json");
    const scriptPath = path.join(dir, "codex-hook.sh");
    registerCodexHooks(configTomlPath, hooksJsonPath, scriptPath);

    const hooksJson = JSON.parse(fs.readFileSync(hooksJsonPath, "utf8"));
    expect(hooksJson.hooks.SessionStart[0].matcher).toBe("*");
    expect(hooksJson.hooks.SessionStart[0].hooks[0].command).toBe(`"${scriptPath}" SessionStart`);
    expect(hooksJson.hooks.UserPromptSubmit[0].hooks[0].command).toBe(`"${scriptPath}" UserPromptSubmit`);
    expect(hooksJson.hooks.Stop[0].hooks[0].command).toBe(`"${scriptPath}" Stop`);

    const toml = fs.readFileSync(configTomlPath, "utf8");
    expect(toml).toContain("[features]");
    expect(toml).toContain("codex_hooks = true");
  });

  it("updates an existing features block without duplicating codex_hooks", () => {
    const dir = tmpDir();
    const configTomlPath = path.join(dir, "config.toml");
    const hooksJsonPath = path.join(dir, "hooks.json");
    const scriptPath = path.join(dir, "codex-hook.sh");
    fs.writeFileSync(configTomlPath, "[features]\ncodex_hooks = false\nmulti_agent = true\n");

    registerCodexHooks(configTomlPath, hooksJsonPath, scriptPath);

    const toml = fs.readFileSync(configTomlPath, "utf8");
    expect((toml.match(/codex_hooks = true/g) ?? [])).toHaveLength(1);
    expect(toml).toContain("multi_agent = true");
  });
});
