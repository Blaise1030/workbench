"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.THREAD_AGENT_BOOTSTRAP_COMMAND = void 0;
/**
 * Command injected into a new thread’s PTY once (plus Enter), after `ptyCreate`.
 * Matches the Electron run adapters where applicable; edit for your PATH and CLI versions.
 *
 * @see electron/adapters/claudeCodeCliAdapter.ts (`claude`)
 * @see electron/adapters/codexCliAdapter.ts (`codex`)
 */
exports.THREAD_AGENT_BOOTSTRAP_COMMAND = {
    claude: "claude",
    codex: "codex",
    /** Google Gemini CLI — https://github.com/google-gemini/gemini-cli */
    gemini: "gemini",
    /**
     * Cursor CLI / agent entrypoint varies by install (`cursor`, `cursor-agent`, etc.).
     */
    cursor: "cursor agent"
};
