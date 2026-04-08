import type { ThreadAgent } from "./domain";

/**
 * Command injected into a new thread’s PTY once (plus Enter), after `ptyCreate`.
 * Matches the Electron run adapters where applicable; edit for your PATH and CLI versions.
 *
 * @see electron/adapters/claudeCodeCliAdapter.ts (`claude`)
 * @see electron/adapters/codexCliAdapter.ts (`codex`)
 * @see electron/adapters/cursorCliAdapter.ts (`cursor`)
 * @see electron/adapters/geminiCliAdapter.ts (`gemini`)
 */
export const THREAD_AGENT_BOOTSTRAP_COMMAND: Record<ThreadAgent, string> = {
  claude: "claude",
  codex: "codex",
  /** Google Gemini CLI — https://github.com/google-gemini/gemini-cli */
  gemini: "gemini",
  /**
   * Cursor CLI / agent entrypoint varies by install (`cursor`, `cursor-agent`, etc.).
   */
  cursor: "cursor agent"
};
