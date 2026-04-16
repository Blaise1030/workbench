// electron/services/hookRegistrationService.ts
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";

export const HOOK_EVENTS = {
  claude: ["SessionStart", "UserPromptSubmit", "Stop", "StopFailure", "Notification"],
  gemini: ["SessionStart", "BeforeAgent", "AfterAgent", "Notification"],
  codex:  ["SessionStart", "UserPromptSubmit", "Stop"],
  cursor: ["SessionStart", "UserPromptSubmit", "Stop"],
} as const;

type Agent = keyof typeof HOOK_EVENTS;

const SCRIPT_TEMPLATE = [
  "#!/bin/bash",
  "# Instrument hook — posts agent lifecycle events to the Electron main process.",
  '[ -z "$INSTRUMENT_HOOK_URL" ] && exit 0',
  "input=$(cat)",
  'url="$INSTRUMENT_HOOK_URL/hook?thread=${INSTRUMENT_THREAD_ID:-}"',
  'curl -sf -X POST "$url" \\',
  '  -H "Content-Type: application/json" \\',
  '  -d "$input" > /dev/null 2>&1 &',
  "exit 0",
  "",
].join("\n");

function scriptHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** Write hook scripts to `scriptsDir`. Skips writing if content hash is current. */
export function ensureScriptsInstalled(scriptsDir: string): void {
  fs.mkdirSync(scriptsDir, { recursive: true });
  const expectedHash = scriptHash(SCRIPT_TEMPLATE);

  for (const agent of Object.keys(HOOK_EVENTS) as Agent[]) {
    const scriptPath = path.join(scriptsDir, `${agent}-hook.sh`);
    const hashPath = path.join(scriptsDir, `${agent}-hook.hash`);

    const storedHash = fs.existsSync(hashPath)
      ? fs.readFileSync(hashPath, "utf8").trim()
      : "";

    if (storedHash === expectedHash && fs.existsSync(scriptPath)) continue;

    fs.writeFileSync(scriptPath, SCRIPT_TEMPLATE, { mode: 0o755 });
    fs.writeFileSync(hashPath, expectedHash);
  }
}

/** Merge Instrument hook entries into an agent's settings file. Safe to call repeatedly. */
export function registerAgentHooks(
  settingsPath: string,
  scriptPath: string,
  events: readonly string[]
): void {
  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    } catch {
      settings = {};
    }
  }

  if (typeof settings.hooks !== "object" || settings.hooks === null) {
    settings.hooks = {};
  }
  const hooks = settings.hooks as Record<string, unknown[]>;

  const hookScriptName = path.basename(scriptPath);
  for (const event of events) {
    if (!Array.isArray(hooks[event])) hooks[event] = [];
    // Remove any stale Instrument hook entries (e.g. old path with spaces like "Application Support")
    hooks[event] = (hooks[event] as Array<{ hooks: Array<{ type?: string; command?: string }> }>).filter(
      (e) => !e.hooks?.some((h) => typeof h.command === "string" && h.command.includes(hookScriptName))
    );
    const entries = hooks[event] as Array<{ hooks: Array<{ type?: string; command?: string }> }>;
    const alreadyRegistered = entries.some((e) =>
      e.hooks?.some((h) => h.command === scriptPath || h.command === `"${scriptPath}"`)
    );
    if (alreadyRegistered) continue;
    // Quote path to handle spaces (e.g. macOS "Application Support")
    entries.push({ hooks: [{ type: "command", command: `"${scriptPath}"` }] });
  }

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

/**
 * Cursor CLI reads hook configuration from `~/.cursor/hooks.json` with
 * lower-case event keys (e.g. `beforeSubmitPrompt`, `stop`), not the
 * Claude/Codex/Gemini `settings.json` schema.
 */
export function registerCursorHooks(hooksPath: string, scriptPath: string): void {
  let settings: Record<string, unknown> = {};
  if (fs.existsSync(hooksPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(hooksPath, "utf8")) as Record<string, unknown>;
    } catch {
      settings = {};
    }
  }

  if (typeof settings.version !== "number") settings.version = 1;
  if (typeof settings.hooks !== "object" || settings.hooks === null) {
    settings.hooks = {};
  }
  const hooks = settings.hooks as Record<string, unknown[]>;
  const cursorEvents = ["beforeSubmitPrompt", "stop"] as const;
  const quotedScriptPath = `"${scriptPath}"`;
  for (const event of cursorEvents) {
    if (!Array.isArray(hooks[event])) hooks[event] = [];
    const entries = hooks[event] as Array<{ command?: string }>;
    const alreadyRegistered = entries.some((entry) =>
      entry.command === scriptPath || entry.command === quotedScriptPath
    );
    if (alreadyRegistered) continue;
    entries.push({ command: quotedScriptPath });
  }

  fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
  fs.writeFileSync(hooksPath, JSON.stringify(settings, null, 2));
}

const AGENT_SETTINGS_PATHS: Record<Agent, string> = {
  claude: path.join(os.homedir(), ".claude", "settings.json"),
  gemini: path.join(os.homedir(), ".gemini", "settings.json"),
  // NOTE: Verify these paths against current Codex and Cursor docs before release
  codex:  path.join(os.homedir(), ".codex", "config.json"),
  cursor: path.join(os.homedir(), ".cursor", "hooks.json"),
};

/** Run at app startup. Writes scripts and registers hooks for all four agents. */
export function registerAllAgentHooks(scriptsDir: string): void {
  ensureScriptsInstalled(scriptsDir);
  for (const agent of Object.keys(HOOK_EVENTS) as Agent[]) {
    const scriptPath = path.join(scriptsDir, `${agent}-hook.sh`);
    const settingsPath = AGENT_SETTINGS_PATHS[agent];
    try {
      if (agent === "cursor") {
        registerCursorHooks(settingsPath, scriptPath);
      } else {
        registerAgentHooks(settingsPath, scriptPath, HOOK_EVENTS[agent]);
      }
    } catch (err) {
      console.warn(`[instrument] hook registration for ${agent} failed:`, err);
    }
  }
}
