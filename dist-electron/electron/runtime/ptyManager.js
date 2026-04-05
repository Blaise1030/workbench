"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PtyManager = void 0;
const node_pty_1 = __importDefault(require("node-pty"));
class PtyManager {
    sessions = new Map();
    start(id, file, args, cwd, onData) {
        const ptyProcess = node_pty_1.default.spawn(file, args, {
            cols: 120,
            rows: 40,
            cwd,
            env: globalThis.process.env
        });
        ptyProcess.onData(onData);
        const session = { id, process: ptyProcess };
        this.sessions.set(id, session);
        return session;
    }
    write(id, input) {
        this.sessions.get(id)?.process.write(input);
    }
    interrupt(id) {
        this.sessions.get(id)?.process.kill("SIGINT");
    }
    stop(id) {
        this.sessions.get(id)?.process.kill();
        this.sessions.delete(id);
    }
}
exports.PtyManager = PtyManager;
