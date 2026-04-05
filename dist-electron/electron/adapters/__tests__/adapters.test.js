"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const claudeCodeCliAdapter_1 = require("../claudeCodeCliAdapter");
const codexCliAdapter_1 = require("../codexCliAdapter");
(0, vitest_1.describe)("agent adapters", () => {
    (0, vitest_1.it)("detects codex review state", () => {
        const adapter = new codexCliAdapter_1.CodexCliAdapter();
        (0, vitest_1.expect)(adapter.detectState("waiting for review")).toBe("needsReview");
    });
    (0, vitest_1.it)("detects claude completion state", () => {
        const adapter = new claudeCodeCliAdapter_1.ClaudeCodeCliAdapter();
        (0, vitest_1.expect)(adapter.detectState("completed successfully")).toBe("done");
    });
});
