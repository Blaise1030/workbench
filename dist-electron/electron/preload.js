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
    createWorktreeGroup: (payload) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.workspaceCreateWorktreeGroup, payload),
    deleteWorktreeGroup: (payload) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.workspaceDeleteWorktreeGroup, payload),
    listBranches: (projectId) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.workspaceListBranches, { projectId }),
    worktreeHealth: (worktreeId) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.workspaceWorktreeHealth, { worktreeId }),
    startRun: (payload) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.runStart, payload),
    sendRunInput: (runId, input) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.runSendInput, { runId, input }),
    interruptRun: (runId) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.runInterrupt, runId),
    changedFiles: (cwd) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffChangedFiles, cwd),
    isGitRepository: (cwd) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffIsGitRepository, cwd),
    initGitRepository: (cwd) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffInitGitRepository, cwd),
    repoStatus: (cwd) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffRepoStatus, cwd),
    fileDiff: (cwd, file, scope) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffFileDiff, { cwd, file, scope }),
    workingTreeDiff: (cwd) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffWorkingTree, cwd),
    stageAll: (cwd) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffStageAll, cwd),
    unstageAll: (cwd) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffUnstageAll, cwd),
    discardAll: (cwd) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffDiscardAll, cwd),
    stagePaths: (cwd, paths) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffStagePaths, { cwd, paths }),
    unstagePaths: (cwd, paths) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffUnstagePaths, { cwd, paths }),
    discardPaths: (cwd, paths) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffDiscardPaths, { cwd, paths }),
    gitFetch: (cwd) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffGitFetch, cwd),
    gitPush: (cwd) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffGitPush, cwd),
    commitStaged: (cwd, message) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.diffGitCommit, { cwd, message }),
    listFiles: (cwd) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.filesList, cwd),
    searchFiles: (cwd, query) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.filesSearch, { cwd, query }),
    readFile: (cwd, relativePath) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.filesRead, { cwd, relativePath }),
    writeFile: (cwd, relativePath, content) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.filesWrite, { cwd, relativePath, content }),
    createFile: (cwd, relativePath) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.filesCreate, { cwd, relativePath }),
    deleteFile: (cwd, relativePath) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.filesDelete, { cwd, relativePath }),
    applyPatch: (payload) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.editApplyPatch, payload),
    ptyCreate: (sessionId, cwd, worktreeId) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.terminalPtyCreate, { sessionId, cwd, worktreeId }),
    ptyWrite: (sessionId, data) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.terminalPtyWrite, { sessionId, data }),
    ptyResize: (sessionId, cols, rows) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.terminalPtyResize, { sessionId, cols, rows }),
    ptyKill: (sessionId) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.terminalPtyKill, { sessionId }),
    ptyListSessions: () => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.terminalPtyListSessions),
    ptyGetBuffer: (sessionId) => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.terminalPtyGetBuffer, { sessionId }),
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
    onWorkingTreeFilesChanged: (callback) => {
        const handler = () => callback();
        electron_1.ipcRenderer.on(ipc_js_1.IPC_CHANNELS.workingTreeFilesDidChange, handler);
        return () => electron_1.ipcRenderer.off(ipc_js_1.IPC_CHANNELS.workingTreeFilesDidChange, handler);
    },
    onOpenWorkspaceSettings: (callback) => {
        const handler = () => callback();
        electron_1.ipcRenderer.on(ipc_js_1.IPC_CHANNELS.uiOpenWorkspaceSettings, handler);
        return () => electron_1.ipcRenderer.off(ipc_js_1.IPC_CHANNELS.uiOpenWorkspaceSettings, handler);
    },
    pickRepoDirectory: () => electron_1.ipcRenderer.invoke(ipc_js_1.IPC_CHANNELS.dialogPickRepoDirectory),
    resolveRepoRootFromWebkitFile: (file) => resolveRepoRootFromWebkitFile(file),
    /** Absolute path for a file from a drag-and-drop `DataTransfer` (Electron). */
    getPathForFile: (file) => electron_1.webUtils.getPathForFile(file)
});
