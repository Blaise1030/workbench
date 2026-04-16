// electron/services/hookRegistrationService.ts
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";

const CLAUDE_GEMINI_SCRIPT_TEMPLATE = [
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

const CURSOR_SCRIPT_TEMPLATE = [
  "#!/bin/bash",
  "# Instrument Cursor hook — maps Cursor CLI hook args to Instrument hook events.",
  'raw_input=$(cat)',
  'event_arg="${1:-}"',
  'case "$event_arg" in',
  '  Start)',
  '    event_name="UserPromptSubmit"',
  '    extra_type=""',
  "    ;;",
  '  Stop)',
  '    event_name="Stop"',
  '    extra_type=""',
  "    ;;",
  '  PermissionRequest)',
  '    event_name="Notification"',
  '    extra_type="permission_request"',
  '    printf \'{"continue":true}\\n\'',
  "    ;;",
  "  *)",
  "    exit 0",
  "    ;;",
  "esac",
  '[ -z "$INSTRUMENT_HOOK_URL" ] && exit 0',
  'payload=$(RAW_INPUT="$raw_input" EVENT_NAME="$event_name" EXTRA_TYPE="$extra_type" /usr/bin/python3 -c \'',
  "import json, os",
  "raw = os.environ.get(\"RAW_INPUT\", \"\")",
  "event_name = os.environ[\"EVENT_NAME\"]",
  "extra_type = os.environ.get(\"EXTRA_TYPE\", \"\")",
  "try:",
  "    parsed = json.loads(raw) if raw.strip() else {}",
  "except Exception:",
  "    parsed = {}",
  "if not isinstance(parsed, dict):",
  "    parsed = {\"payload\": parsed}",
  "parsed[\"hook_event_name\"] = event_name",
  "if extra_type:",
  "    parsed[\"type\"] = extra_type",
  "print(json.dumps(parsed, separators=(\",\", \":\")))",
  "')",
  'url="$INSTRUMENT_HOOK_URL/hook?thread=${INSTRUMENT_THREAD_ID:-}"',
  'curl -sf -X POST "$url" \\',
  '  -H "Content-Type: application/json" \\',
  '  -d "$payload" > /dev/null 2>&1 &',
  "exit 0",
  "",
].join("\n");

const CODEX_SCRIPT_TEMPLATE = [
  "#!/bin/bash",
  "# Instrument Codex hook — annotates Codex hook payloads with the hook event name.",
  'raw_input=$(cat)',
  'event_name="${1:-}"',
  '[ -z "$event_name" ] && exit 0',
  '[ -z "$INSTRUMENT_HOOK_URL" ] && exit 0',
  'payload=$(RAW_INPUT="$raw_input" EVENT_NAME="$event_name" /usr/bin/python3 -c \'',
  "import json, os",
  "raw = os.environ.get(\"RAW_INPUT\", \"\")",
  "event_name = os.environ[\"EVENT_NAME\"]",
  "try:",
  "    parsed = json.loads(raw) if raw.strip() else {}",
  "except Exception:",
  "    parsed = {}",
  "if not isinstance(parsed, dict):",
  "    parsed = {\"payload\": parsed}",
  "parsed[\"hook_event_name\"] = event_name",
  "print(json.dumps(parsed, separators=(\",\", \":\")))",
  "')",
  'url="$INSTRUMENT_HOOK_URL/hook?thread=${INSTRUMENT_THREAD_ID:-}"',
  'curl -sf -X POST "$url" \\',
  '  -H "Content-Type: application/json" \\',
  '  -d "$payload" > /dev/null 2>&1 &',
  "exit 0",
  "",
].join("\n");

const SCRIPT_TEMPLATES = {
  claude: CLAUDE_GEMINI_SCRIPT_TEMPLATE,
  gemini: CLAUDE_GEMINI_SCRIPT_TEMPLATE,
  cursor: CURSOR_SCRIPT_TEMPLATE,
  codex: CODEX_SCRIPT_TEMPLATE,
} as const;

type Agent = keyof typeof SCRIPT_TEMPLATES;

export const HOOK_EVENTS = {
  claude: ["SessionStart", "UserPromptSubmit", "Stop", "StopFailure", "Notification"],
  gemini: ["SessionStart", "BeforeAgent", "AfterAgent", "Notification"],
  codex: ["SessionStart", "UserPromptSubmit", "Stop"],
  cursor: {
    beforeSubmitPrompt: "Start",
    stop: "Stop",
    beforeShellExecution: "PermissionRequest",
    beforeMCPExecution: "PermissionRequest",
  },
} as const;

function scriptHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** Write hook scripts to `scriptsDir`. Skips writing if content hash is current. */
export function ensureScriptsInstalled(scriptsDir: string): void {
  fs.mkdirSync(scriptsDir, { recursive: true });

  for (const agent of Object.keys(SCRIPT_TEMPLATES) as Agent[]) {
    const template = SCRIPT_TEMPLATES[agent];
    const expectedHash = scriptHash(template);
    const scriptPath = path.join(scriptsDir, `${agent}-hook.sh`);
    const hashPath = path.join(scriptsDir, `${agent}-hook.hash`);

    const storedHash = fs.existsSync(hashPath)
      ? fs.readFileSync(hashPath, "utf8").trim()
      : "";

    if (storedHash === expectedHash && fs.existsSync(scriptPath)) continue;

    fs.writeFileSync(scriptPath, template, { mode: 0o755 });
    fs.writeFileSync(hashPath, expectedHash);
  }
}

/** Merge Instrument hook entries into a Claude/Gemini settings file. Safe to call repeatedly. */
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
    hooks[event] = (hooks[event] as Array<{ hooks: Array<{ type?: string; command?: string }> }>).filter(
      (entry) => !entry.hooks?.some((hook) => typeof hook.command === "string" && hook.command.includes(hookScriptName))
    );
    const entries = hooks[event] as Array<{ hooks: Array<{ type?: string; command?: string }> }>;
    entries.push({ hooks: [{ type: "command", command: `"${scriptPath}"` }] });
  }

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

/**
 * Cursor CLI reads hook configuration from `~/.cursor/hooks.json`.
 * We pass a small event discriminator argument because Cursor exposes the hook type
 * via config key, not via the JSON piped to stdin.
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
  const hookScriptName = path.basename(scriptPath);
  for (const [event, eventArg] of Object.entries(HOOK_EVENTS.cursor)) {
    if (!Array.isArray(hooks[event])) hooks[event] = [];
    hooks[event] = (hooks[event] as Array<{ command?: string }>).filter(
      (entry) => !(typeof entry.command === "string" && entry.command.includes(hookScriptName))
    );
    const entries = hooks[event] as Array<{ command?: string }>;
    entries.push({ command: `"${scriptPath}" ${eventArg}` });
  }

  fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
  fs.writeFileSync(hooksPath, JSON.stringify(settings, null, 2));
}

function updateTomlBooleanBlock(content: string, section: string, key: string, value: boolean): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const sectionHeader = `[${section}]`;
  const renderedValue = value ? "true" : "false";

  if (!normalized.includes(sectionHeader)) {
    const trimmed = normalized.trimEnd();
    const prefix = trimmed ? `${trimmed}\n\n` : "";
    return `${prefix}${sectionHeader}\n${key} = ${renderedValue}\n`;
  }

  const lines = normalized.split("\n");
  const sectionStart = lines.findIndex((line) => line.trim() === sectionHeader);
  if (sectionStart === -1) {
    return `${normalized.trimEnd()}\n\n${sectionHeader}\n${key} = ${renderedValue}\n`;
  }

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i += 1) {
    if (/^\[.*\]$/.test(lines[i].trim())) {
      sectionEnd = i;
      break;
    }
  }

  for (let i = sectionStart + 1; i < sectionEnd; i += 1) {
    if (new RegExp(`^\\s*${key}\\s*=`).test(lines[i])) {
      lines[i] = `${key} = ${renderedValue}`;
      return `${lines.join("\n").trimEnd()}\n`;
    }
  }

  lines.splice(sectionEnd, 0, `${key} = ${renderedValue}`);
  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * Codex CLI discovers `hooks.json` next to `config.toml` and requires the
 * `codex_hooks` feature flag to be enabled.
 */
export function registerCodexHooks(configTomlPath: string, hooksJsonPath: string, scriptPath: string): void {
  const hookConfig = {
    hooks: {
      SessionStart: [
        {
          matcher: "*",
          hooks: [
            { type: "command", command: `"${scriptPath}" SessionStart` },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: [
            { type: "command", command: `"${scriptPath}" UserPromptSubmit` },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            { type: "command", command: `"${scriptPath}" Stop` },
          ],
        },
      ],
    },
  };

  fs.mkdirSync(path.dirname(hooksJsonPath), { recursive: true });
  fs.writeFileSync(hooksJsonPath, JSON.stringify(hookConfig, null, 2));

  const existingToml = fs.existsSync(configTomlPath)
    ? fs.readFileSync(configTomlPath, "utf8")
    : "";
  const updatedToml = updateTomlBooleanBlock(existingToml, "features", "codex_hooks", true);
  fs.mkdirSync(path.dirname(configTomlPath), { recursive: true });
  fs.writeFileSync(configTomlPath, updatedToml);
}

const AGENT_SETTINGS_PATHS = {
  claude: path.join(os.homedir(), ".claude", "settings.json"),
  gemini: path.join(os.homedir(), ".gemini", "settings.json"),
  codexConfig: path.join(os.homedir(), ".codex", "config.toml"),
  codexHooks: path.join(os.homedir(), ".codex", "hooks.json"),
  cursor: path.join(os.homedir(), ".cursor", "hooks.json"),
} as const;

/** Run at app startup. Writes scripts and registers hooks for all four agents. */
export function registerAllAgentHooks(scriptsDir: string): void {
  ensureScriptsInstalled(scriptsDir);

  try {
    registerAgentHooks(
      AGENT_SETTINGS_PATHS.claude,
      path.join(scriptsDir, "claude-hook.sh"),
      HOOK_EVENTS.claude
    );
  } catch (err) {
    console.warn("[instrument] hook registration for claude failed:", err);
  }

  try {
    registerAgentHooks(
      AGENT_SETTINGS_PATHS.gemini,
      path.join(scriptsDir, "gemini-hook.sh"),
      HOOK_EVENTS.gemini
    );
  } catch (err) {
    console.warn("[instrument] hook registration for gemini failed:", err);
  }

  try {
    registerCodexHooks(
      AGENT_SETTINGS_PATHS.codexConfig,
      AGENT_SETTINGS_PATHS.codexHooks,
      path.join(scriptsDir, "codex-hook.sh")
    );
  } catch (err) {
    console.warn("[instrument] hook registration for codex failed:", err);
  }

  try {
    registerCursorHooks(
      AGENT_SETTINGS_PATHS.cursor,
      path.join(scriptsDir, "cursor-hook.sh")
    );
  } catch (err) {
    console.warn("[instrument] hook registration for cursor failed:", err);
  }
}
