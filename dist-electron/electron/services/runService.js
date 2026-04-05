"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunService = void 0;
const node_crypto_1 = require("node:crypto");
const claudeCodeCliAdapter_js_1 = require("../adapters/claudeCodeCliAdapter.js");
const codexCliAdapter_js_1 = require("../adapters/codexCliAdapter.js");
const ptyManager_js_1 = require("../runtime/ptyManager.js");
class RunService {
    pty = new ptyManager_js_1.PtyManager();
    codex = new codexCliAdapter_js_1.CodexCliAdapter();
    claude = new claudeCodeCliAdapter_js_1.ClaudeCodeCliAdapter();
    start(agent, cwd, prompt, onOutput, onState) {
        const runId = (0, node_crypto_1.randomUUID)();
        const adapter = agent === "codex" ? this.codex : this.claude;
        const command = adapter.command({ cwd, prompt, threadId: runId });
        this.pty.start(runId, command.file, command.args, cwd, (chunk) => {
            onOutput(runId, chunk);
            const state = adapter.detectState(chunk);
            if (state)
                onState(runId, state);
        });
        onState(runId, "running");
        return runId;
    }
    sendInput(runId, input) {
        this.pty.write(runId, `${input}\r`);
    }
    interrupt(runId) {
        this.pty.interrupt(runId);
    }
    stop(runId) {
        this.pty.stop(runId);
    }
}
exports.RunService = RunService;
