"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const electron_1 = require("electron");
const ipc_js_1 = require("../src/shared/ipc.js");
/** Absolute repo root from the first file in a webkitdirectory pick (Electron only). */
function resolveRepoRootFromWebkitFile(file) {
    const absolute = electron_1.webUtils.getPathForFile(file);
    const relative = file.webkitRelativePath;
    if (!relative) {
        return node_path_1.default.dirname(absolute);
    }
    const absForward = absolute.replace(/\\/g, "/");
    const relForward = relative.replace(/\\/g, "/");
    if (absForward.endsWith(relForward)) {
        const rootForward = absForward.slice(0, absForward.length - relForward.length).replace(/\/+$/, "");
        return node_path_1.default.normalize(rootForward.replace(/\//g, node_path_1.default.sep));
    }
    return node_path_1.default.dirname(absolute);
}
electron_1.contextBridge.exposeInMainWorld("workspaceApi", {
    getSnapshot: () => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.workspaceGetSnapshot),
    addProject: (payload) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.workspaceAddProject, payload),
    addWorktree: (payload) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.workspaceAddWorktree, payload),
    setActive: (payload) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.workspaceSetActive, payload),
    createThread: (payload) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.workspaceCreateThread, payload),
    setActiveThread: (threadId) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.workspaceSetActiveThread, threadId),
    deleteThread: (payload) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.workspaceDeleteThread, payload),
    renameThread: (payload) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.workspaceRenameThread, payload),
    reorderThreads: (payload) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.workspaceReorderThreads, payload),
    startRun: (payload) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.runStart, payload),
    sendRunInput: (runId, input) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.runSendInput, { runId, input }),
    interruptRun: (runId) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.runInterrupt, runId),
    changedFiles: (cwd) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffChangedFiles, cwd),
    fileDiff: (cwd, file) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffFileDiff, { cwd, file }),
    workingTreeDiff: (cwd) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffWorkingTree, cwd),
    stageAll: (cwd) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffStageAll, cwd),
    discardAll: (cwd) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffDiscardAll, cwd),
    listFiles: (cwd) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.filesList, cwd),
    searchFiles: (cwd, query) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.filesSearch, { cwd, query }),
    readFile: (cwd, relativePath) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.filesRead, { cwd, relativePath }),
    writeFile: (cwd, relativePath, content) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.filesWrite, { cwd, relativePath, content }),
    applyPatch: (payload) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.editApplyPatch, payload),
    ptyCreate: (sessionId, cwd, worktreeId) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.terminalPtyCreate, { sessionId, cwd, worktreeId }),
    ptyWrite: (sessionId, data) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.terminalPtyWrite, { sessionId, data }),
    ptyResize: (sessionId, cols, rows) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.terminalPtyResize, { sessionId, cols, rows }),
    ptyKill: (sessionId) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.terminalPtyKill, { sessionId }),
    ptyListSessions: () => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.terminalPtyListSessions),
    onPtyData: (callback) => {
        const handler = (_event, payload) => {
            callback(payload.sessionId, payload.data);
        };
        electron_1.ipcRenderer.on(ipc_js_1.IPC_CHANNELS.terminalPtyData, handler);
        return () => electron_1.ipcRenderer.off(ipc_js_1.IPC_CHANNELS.terminalPtyData, handler);
    },
    onWorkspaceChanged: (callback) => {
        const handler = () => callback();
        electron_1.ipcRenderer.on(ipc_js_1.IPC_CHANNELS.workspaceDidChange, handler);
        return () => electron_1.ipcRenderer.off(ipc_js_1.IPC_CHANNELS.workspaceDidChange, handler);
    },
    pickRepoDirectory: () => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.dialogPickRepoDirectory),
    resolveRepoRootFromWebkitFile: (file) => resolveRepoRootFromWebkitFile(file),
    /** Absolute path for a file from a drag-and-drop `DataTransfer` (Electron). */
    getPathForFile: (file) => electron_1.webUtils.getPathForFile(file)
});
