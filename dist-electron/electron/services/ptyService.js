"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PtyService = void 0;
const electron_1 = require("electron");
const pty = __importStar(require("node-pty"));
const ipc_js_1 = require("../../src/shared/ipc.js");
const MAX_BUFFER_BYTES = 100 * 1024; // 100 KB
class PtyService {
    sessions = new Map();
    /**
     * @param sessionId Stable PTY key: thread id, or `__wt:${worktreeId}` when no thread is active.
     */
    getOrCreate(sessionId, cwd, worktreeId) {
        const existing = this.sessions.get(sessionId);
        if (existing) {
            return { buffer: existing.buffer };
        }
        const shell = process.env.SHELL ?? "/bin/zsh";
        const instance = pty.spawn(shell, [], {
            name: "xterm-256color",
            cwd,
            env: process.env,
            cols: 80,
            rows: 24
        });
        const session = { pty: instance, buffer: "", worktreeId };
        this.sessions.set(sessionId, session);
        instance.onData((data) => {
            session.buffer += data;
            if (Buffer.byteLength(session.buffer, "utf8") > MAX_BUFFER_BYTES) {
                session.buffer = session.buffer.slice(-MAX_BUFFER_BYTES);
            }
            const payload = { sessionId, data };
            for (const win of electron_1.BrowserWindow.getAllWindows()) {
                win.webContents.send(ipc_js_1.IPC_CHANNELS.terminalPtyData, payload);
            }
        });
        instance.onExit(() => {
            this.sessions.delete(sessionId);
        });
        return { buffer: "" };
    }
    write(sessionId, data) {
        this.sessions.get(sessionId)?.pty.write(data);
    }
    resize(sessionId, cols, rows) {
        this.sessions.get(sessionId)?.pty.resize(cols, rows);
    }
    kill(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.pty.kill();
            this.sessions.delete(sessionId);
        }
    }
    /** Distinct worktree IDs that have at least one live integrated-terminal session. */
    listSessionWorktreeIds() {
        const set = new Set();
        for (const s of this.sessions.values()) {
            set.add(s.worktreeId);
        }
        return [...set];
    }
}
exports.PtyService = PtyService;
