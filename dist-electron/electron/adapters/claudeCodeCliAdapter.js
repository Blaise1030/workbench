"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeCodeCliAdapter = void 0;
class ClaudeCodeCliAdapter {
    kind = "claude";
    command(input) {
        return { file: "claude", args: ["--cwd", input.cwd, input.prompt] };
    }
    detectState(chunk) {
        if (/awaiting feedback|waiting for feedback|approval needed/i.test(chunk))
            return "needsReview";
        if (/failed|error/i.test(chunk))
            return "failed";
        if (/done|completed|finished/i.test(chunk))
            return "done";
        return null;
    }
}
exports.ClaudeCodeCliAdapter = ClaudeCodeCliAdapter;
