import { ref } from "vue";
import type { ThreadAgent } from "@shared/domain";

const STORAGE_KEY = "instrument.preferredThreadAgent";

const ALL: readonly ThreadAgent[] = ["claude", "cursor", "codex", "gemini"];

function isThreadAgent(v: unknown): v is ThreadAgent {
  return typeof v === "string" && (ALL as readonly string[]).includes(v);
}

export function readPreferredThreadAgent(): ThreadAgent {
  if (typeof localStorage === "undefined") return "claude";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return "claude";
    const parsed = JSON.parse(raw) as unknown;
    if (isThreadAgent(parsed)) return parsed;
  } catch {
    /* ignore */
  }
  return "claude";
}

export function writePreferredThreadAgent(agent: ThreadAgent): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(agent));
}

/** Persisted default agent for the add-thread overlay and settings. */
export function usePreferredThreadAgent() {
  const preferredAgent = ref<ThreadAgent>(readPreferredThreadAgent());

  function setPreferredAgent(agent: ThreadAgent): void {
    preferredAgent.value = agent;
    writePreferredThreadAgent(agent);
  }

  function syncFromStorage(): void {
    preferredAgent.value = readPreferredThreadAgent();
  }

  return { preferredAgent, setPreferredAgent, syncFromStorage };
}
