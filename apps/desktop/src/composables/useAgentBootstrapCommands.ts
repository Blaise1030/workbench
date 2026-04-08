import { ref } from "vue";
import type { ThreadAgent } from "@shared/domain";
import { threadBootstrapCommandLine } from "@shared/threadBootstrapCommandLine";
import { THREAD_AGENT_BOOTSTRAP_COMMAND } from "@shared/threadAgentBootstrap";

const STORAGE_KEY = "instrument.agentBootstrapCommands";

function mergeWithDefaults(stored: Partial<Record<ThreadAgent, string>> | null): Record<ThreadAgent, string> {
  return {
    claude: stored?.claude ?? THREAD_AGENT_BOOTSTRAP_COMMAND.claude,
    codex: stored?.codex ?? THREAD_AGENT_BOOTSTRAP_COMMAND.codex,
    gemini: stored?.gemini ?? THREAD_AGENT_BOOTSTRAP_COMMAND.gemini,
    cursor: stored?.cursor ?? THREAD_AGENT_BOOTSTRAP_COMMAND.cursor
  }; 
}

export function readStoredAgentCommands(): Record<ThreadAgent, string> {
  if (typeof localStorage === "undefined") {
    return mergeWithDefaults(null);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return mergeWithDefaults(null);
    return mergeWithDefaults(JSON.parse(raw) as Partial<Record<ThreadAgent, string>>);
  } catch {
    return mergeWithDefaults(null);
  }
}

export function writeStoredAgentCommands(cmd: Record<ThreadAgent, string>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cmd));
}

export function clearStoredAgentCommands(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Effective per-agent PTY bootstrap lines (defaults + optional localStorage overrides).
 */
export function useAgentBootstrapCommands() {
  const commands = ref<Record<ThreadAgent, string>>(readStoredAgentCommands());

  function persist(): void {
    writeStoredAgentCommands(commands.value);
  }

  function resetToAppDefaults(): void {
    clearStoredAgentCommands();
    commands.value = { ...THREAD_AGENT_BOOTSTRAP_COMMAND };
  }

  function bootstrapCommandFor(agent: ThreadAgent): string {
    return commands.value[agent];
  }

  /** Full PTY line: settings base command plus optional double-quoted prompt. */
  function bootstrapCommandLineWithPrompt(agent: ThreadAgent, prompt: string): string {
    return threadBootstrapCommandLine(commands.value[agent], prompt);
  }

  function applySaved(next: Record<ThreadAgent, string>): void {
    commands.value = { ...next };
    persist();
  }

  return {
    commands,
    persist,
    resetToAppDefaults,
    bootstrapCommandFor,
    bootstrapCommandLineWithPrompt,
    applySaved
  };
}
