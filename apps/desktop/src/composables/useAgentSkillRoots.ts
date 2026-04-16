import { ref } from "vue";
import type { ThreadAgent } from "@shared/domain";
import { THREAD_AGENT_SKILL_ROOT_DEFAULT } from "@shared/threadAgentSkillRoots";

const STORAGE_KEY = "instrument.agentSkillRoots";

function mergeWithDefaults(
  stored: Partial<Record<ThreadAgent, string>> | null
): Record<ThreadAgent, string> {
  if (!stored) {
    return { ...THREAD_AGENT_SKILL_ROOT_DEFAULT };
  }
  const pick = (k: ThreadAgent): string => {
    if (!(k in stored) || stored[k] === undefined) {
      return THREAD_AGENT_SKILL_ROOT_DEFAULT[k];
    }
    return String(stored[k]).trim();
  };
  return {
    claude: pick("claude"),
    codex: pick("codex"),
    gemini: pick("gemini"),
    cursor: pick("cursor")
  };
}

/** Expand `~` using a POSIX home prefix; absolute paths are returned unchanged (normalized slashes). */
export function expandUserSkillRoot(configured: string, homeDir: string | null): string | null {
  const raw = configured.trim();
  if (!raw) return null;
  const norm = raw.replace(/\\/g, "/");
  if (norm.startsWith("~/")) {
    if (!homeDir) return null;
    return `${homeDir}/${norm.slice(2)}`;
  }
  if (norm === "~") {
    return homeDir;
  }
  return norm;
}

export function readStoredAgentSkillRoots(): Record<ThreadAgent, string> {
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

export function writeStoredAgentSkillRoots(roots: Record<ThreadAgent, string>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(roots));
}

export function clearStoredAgentSkillRoots(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Per-agent skill directory paths (defaults + optional localStorage). Used when searching `/` skills.
 */
export function useAgentSkillRoots() {
  const skillRoots = ref<Record<ThreadAgent, string>>(readStoredAgentSkillRoots());

  function persist(): void {
    writeStoredAgentSkillRoots(skillRoots.value);
  }

  function resetToAppDefaults(): void {
    clearStoredAgentSkillRoots();
    skillRoots.value = { ...THREAD_AGENT_SKILL_ROOT_DEFAULT };
  }

  function applySaved(next: Record<ThreadAgent, string>): void {
    skillRoots.value = { ...next };
    persist();
  }

  return {
    skillRoots,
    persist,
    resetToAppDefaults,
    applySaved
  };
}
