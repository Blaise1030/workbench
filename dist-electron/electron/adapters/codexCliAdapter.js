"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodexCliAdapter = void 0;
class CodexCliAdapter {
    kind = "codex";
    command(input) {
        return { file: "codex", args: ["--cwd", input.cwd, input.prompt] };
    }
    detectState(chunk) {
        if (/waiting for review|needs review/i.test(chunk))
            return "needsReview";
        if (/failed|error/i.test(chunk))
            return "failed";
        if (/done|completed|finished/i.test(chunk))
            return "done";
        return null;
    }
}
exports.CodexCliAdapter = CodexCliAdapter;
