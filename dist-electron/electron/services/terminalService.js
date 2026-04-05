"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalService = void 0;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
class TerminalService {
    sessionCwds = new Map();
    execute(sessionId, baseCwd, command) {
        const shell = process.env.SHELL || "/bin/zsh";
        const cwd = this.sessionCwds.get(sessionId) ?? baseCwd;
        const trimmed = command.trim();
        const cdMatch = trimmed.match(/^cd(?:\s+(.*))?$/);
        if (cdMatch) {
            const rawTarget = cdMatch[1]?.trim() || process.env.HOME || cwd;
            const expandedTarget = rawTarget.startsWith("~/")
                ? node_path_1.default.join(process.env.HOME || "", rawTarget.slice(2))
                : rawTarget;
            const target = node_path_1.default.isAbsolute(expandedTarget) ? expandedTarget : node_path_1.default.resolve(cwd, expandedTarget);
            if (!node_fs_1.default.existsSync(target) || !node_fs_1.default.statSync(target).isDirectory()) {
                return Promise.resolve({
                    stdout: "",
                    stderr: `cd: no such file or directory: ${rawTarget}`,
                    exitCode: 1,
                    cwd
                });
            }
            this.sessionCwds.set(sessionId, target);
            return Promise.resolve({
                stdout: "",
                stderr: "",
                exitCode: 0,
                cwd: target
            });
        }
        return new Promise((resolve, reject) => {
            const child = (0, node_child_process_1.spawn)(shell, ["-lc", command], {
                cwd,
                env: process.env
            });
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", (chunk) => {
                stdout += chunk.toString();
            });
            child.stderr.on("data", (chunk) => {
                stderr += chunk.toString();
            });
            child.on("error", (error) => {
                reject(error);
            });
            child.on("close", (exitCode) => {
                resolve({
                    stdout,
                    stderr,
                    exitCode,
                    cwd
                });
            });
        });
    }
}
exports.TerminalService = TerminalService;
