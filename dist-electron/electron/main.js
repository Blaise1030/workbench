"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const electron_1 = require("electron");
const ipc_js_1 = require("../src/shared/ipc.js");
const claudeCodeCliAdapter_js_1 = require("./adapters/claudeCodeCliAdapter.js");
const codexCliAdapter_js_1 = require("./adapters/codexCliAdapter.js");
const diffService_js_1 = require("./services/diffService.js");
const editService_js_1 = require("./services/editService.js");
const runService_js_1 = require("./services/runService.js");
const ptyService_js_1 = require("./services/ptyService.js");
const workspaceService_js_1 = require("./services/workspaceService.js");
const store_js_1 = require("./storage/store.js");
const runService = new runService_js_1.RunService();
const diffService = new diffService_js_1.DiffService();
const editService = new editService_js_1.EditService();
const ptyService = new ptyService_js_1.PtyService();
function createMainWindow() {
    const preloadPath = node_path_1.default.join(__dirname, "preload.js");
    if (!node_fs_1.default.existsSync(preloadPath)) {
        console.error("[electron] Preload script missing (build may still be running):", preloadPath);
    }
    const win = new electron_1.BrowserWindow({
        width: 1600,
        height: 980,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });
    win.webContents.on("preload-error", (_event, failedPreloadPath, error) => {
        console.error("[electron] Preload failed to execute:", failedPreloadPath, error);
    });
    const rendererUrl = process.env.VITE_DEV_SERVER_URL;
    if (rendererUrl) {
        void win.loadURL(rendererUrl);
    }
    else {
        void win.loadFile(node_path_1.default.join(__dirname, "../dist/index.html"));
    }
    return win;
}
function registerIpc(workspaceService) {
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.workspaceGetSnapshot, () => workspaceService.getSnapshot());
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.workspaceAddProject, (_, payload) => {
        const project = workspaceService.addProject(payload.name, payload.repoPath);
        const branch = payload.defaultBranch ?? "main";
        workspaceService.addWorktree(project.id, branch, payload.repoPath);
        return workspaceService.getSnapshot();
    });
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.workspaceAddWorktree, (_, payload) => {
        workspaceService.addWorktree(payload.projectId, payload.branch, payload.worktreePath);
        return workspaceService.getSnapshot();
    });
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.workspaceSetActive, (_, payload) => {
        workspaceService.setActive(payload.projectId, payload.worktreeId, payload.threadId);
    });
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.workspaceCreateThread, (_, payload) => workspaceService.createThread(payload));
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.workspaceSetActiveThread, (_, threadId) => {
        const snapshot = workspaceService.getSnapshot();
        workspaceService.setActive(snapshot.activeProjectId, snapshot.activeWorktreeId, threadId);
        return workspaceService.getSnapshot();
    });
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.workspaceDeleteThread, (_, payload) => {
        workspaceService.deleteThread(payload.threadId);
    });
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.workspaceRenameThread, (_, payload) => {
        workspaceService.renameThread(payload.threadId, payload.title);
    });
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.runStart, (_, payload) => runService.start(payload.agent, payload.cwd, payload.prompt, () => { }, () => { }));
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.runSendInput, (_, payload) => runService.sendInput(payload.runId, payload.input));
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.runInterrupt, (_, runId) => runService.interrupt(runId));
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.diffChangedFiles, (_, cwd) => diffService.changedFiles(cwd));
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.diffFileDiff, (_, payload) => diffService.fileDiff(payload.cwd, payload.file));
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.diffWorkingTree, (_, cwd) => diffService.workingTreeDiff(cwd));
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.diffStageAll, (_, cwd) => diffService.stageAll(cwd));
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.diffDiscardAll, (_, cwd) => diffService.discardAll(cwd));
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.editApplyPatch, (_, payload) => editService.applyPatch(payload));
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.terminalPtyCreate, (_, payload) => ptyService.getOrCreate(payload.sessionId, payload.cwd, payload.worktreeId));
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.terminalPtyWrite, (_, payload) => {
        ptyService.write(payload.sessionId, payload.data);
    });
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.terminalPtyResize, (_, payload) => {
        ptyService.resize(payload.sessionId, payload.cols, payload.rows);
    });
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.terminalPtyKill, (_, payload) => {
        ptyService.kill(payload.sessionId);
    });
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.terminalPtyListSessions, () => ptyService.listSessionWorktreeIds());
    electron_1.ipcMain.handle(ipc_js_1.IPC_CHANNELS.dialogPickRepoDirectory, async (event) => {
        const win = electron_1.BrowserWindow.fromWebContents(event.sender) ??
            electron_1.BrowserWindow.getFocusedWindow() ??
            electron_1.BrowserWindow.getAllWindows()[0];
        const options = {
            title: "Select repository folder",
            properties: ["openDirectory"]
        };
        const { canceled, filePaths } = win
            ? await electron_1.dialog.showOpenDialog(win, options)
            : await electron_1.dialog.showOpenDialog(options);
        if (canceled || filePaths.length === 0)
            return null;
        return filePaths[0];
    });
}
void electron_1.app.whenReady().then(() => {
    const dataDir = electron_1.app.getPath("userData");
    const schemaPath = node_path_1.default.resolve(process.cwd(), "electron/storage/schema.sql");
    const schemaSql = node_fs_1.default.readFileSync(schemaPath, "utf8");
    const store = new store_js_1.WorkspaceStore(dataDir);
    store.migrate(schemaSql);
    const workspaceService = new workspaceService_js_1.WorkspaceService(store);
    ptyService.setSubmittedInputListener((sessionId, input) => {
        workspaceService.maybeRenameThreadFromPrompt(sessionId, input);
    });
    registerIpc(workspaceService);
    createMainWindow();
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createMainWindow();
    });
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
void new codexCliAdapter_js_1.CodexCliAdapter();
void new claudeCodeCliAdapter_js_1.ClaudeCodeCliAdapter();
