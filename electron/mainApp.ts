import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import {
  IPC_CHANNELS,
  type AddProjectInput,
  type AddWorktreeInput,
  type CreateThreadInput,
  type DeleteThreadInput,
  type FileReadInput,
  type FileWriteInput,
  type RenameThreadInput,
  type ReorderThreadsInput
} from "../src/shared/ipc.js";
import { DiffService } from "./services/diffService.js";
import { EditService } from "./services/editService.js";
import { FileService } from "./services/fileService.js";
import { RunService } from "./services/runService.js";
import { PtyService } from "./services/ptyService.js";
import { WorkspaceService } from "./services/workspaceService.js";
import { WorkspaceStore } from "./storage/store.js";

const runService = new RunService();
const diffService = new DiffService();
const editService = new EditService();
const fileService = new FileService();
const ptyService = new PtyService();

function emitWorkspaceDidChange(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.workspaceDidChange);
  }
}

function createMainWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, "preload.js");
  if (!fs.existsSync(preloadPath)) {
    console.error("[electron] Preload script missing (build may still be running):", preloadPath);
  }

  const win = new BrowserWindow({
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
  } else {
    void win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  return win;
}

function readWorkspaceSchemaSql(): string {
  const candidates = [
    path.join(__dirname, "..", "..", "electron", "storage", "schema.sql"),
    path.join(process.cwd(), "electron", "storage", "schema.sql")
  ];
  for (const schemaPath of candidates) {
    if (fs.existsSync(schemaPath)) {
      return fs.readFileSync(schemaPath, "utf8");
    }
  }
  throw new Error(`workspace schema not found. Tried:\n${candidates.join("\n")}`);
}

function registerIpc(workspaceService: WorkspaceService): void {
  ipcMain.handle(IPC_CHANNELS.workspaceGetSnapshot, () => workspaceService.getSnapshot());
  ipcMain.handle(IPC_CHANNELS.workspaceAddProject, (_, payload: AddProjectInput) => {
    const project = workspaceService.addProject(payload.name, payload.repoPath);
    const branch = payload.defaultBranch ?? "main";
    workspaceService.addWorktree(project.id, branch, payload.repoPath);
    emitWorkspaceDidChange();
    return workspaceService.getSnapshot();
  });
  ipcMain.handle(IPC_CHANNELS.workspaceAddWorktree, (_, payload: AddWorktreeInput) => {
    workspaceService.addWorktree(payload.projectId, payload.branch, payload.worktreePath);
    emitWorkspaceDidChange();
    return workspaceService.getSnapshot();
  });
  ipcMain.handle(IPC_CHANNELS.workspaceSetActive, (_, payload: { projectId: string | null; worktreeId: string | null; threadId: string | null }) => {
    workspaceService.setActive(payload.projectId, payload.worktreeId, payload.threadId);
    emitWorkspaceDidChange();
  });
  ipcMain.handle(IPC_CHANNELS.workspaceCreateThread, (_, payload: CreateThreadInput) => {
    const thread = workspaceService.createThread(payload);
    emitWorkspaceDidChange();
    return thread;
  });
  ipcMain.handle(IPC_CHANNELS.workspaceSetActiveThread, (_, threadId: string) => {
    const snapshot = workspaceService.getSnapshot();
    workspaceService.setActive(snapshot.activeProjectId, snapshot.activeWorktreeId, threadId);
    emitWorkspaceDidChange();
    return workspaceService.getSnapshot();
  });
  ipcMain.handle(IPC_CHANNELS.workspaceDeleteThread, (_, payload: DeleteThreadInput) => {
    workspaceService.deleteThread(payload.threadId);
    emitWorkspaceDidChange();
  });
  ipcMain.handle(IPC_CHANNELS.workspaceRenameThread, (_, payload: RenameThreadInput) => {
    workspaceService.renameThread(payload.threadId, payload.title);
    emitWorkspaceDidChange();
  });
  ipcMain.handle(IPC_CHANNELS.workspaceReorderThreads, (_, payload: ReorderThreadsInput) => {
    workspaceService.reorderThreads(payload.worktreeId, payload.orderedThreadIds);
    emitWorkspaceDidChange();
  });

  ipcMain.handle(IPC_CHANNELS.runStart, (_, payload: { agent: "codex" | "claude"; cwd: string; prompt: string }) =>
    runService.start(payload.agent, payload.cwd, payload.prompt, () => {}, () => {})
  );
  ipcMain.handle(IPC_CHANNELS.runSendInput, (_, payload: { runId: string; input: string }) => runService.sendInput(payload.runId, payload.input));
  ipcMain.handle(IPC_CHANNELS.runInterrupt, (_, runId: string) => runService.interrupt(runId));

  ipcMain.handle(IPC_CHANNELS.diffChangedFiles, (_, cwd: string) => diffService.changedFiles(cwd));
  ipcMain.handle(IPC_CHANNELS.diffFileDiff, (_, payload: { cwd: string; file: string }) => diffService.fileDiff(payload.cwd, payload.file));
  ipcMain.handle(IPC_CHANNELS.diffWorkingTree, (_, cwd: string) => diffService.workingTreeDiff(cwd));
  ipcMain.handle(IPC_CHANNELS.diffStageAll, (_, cwd: string) => diffService.stageAll(cwd));
  ipcMain.handle(IPC_CHANNELS.diffDiscardAll, (_, cwd: string) => diffService.discardAll(cwd));
  ipcMain.handle(IPC_CHANNELS.filesList, (_, cwd: string) => fileService.listFileSummaries(cwd));
  ipcMain.handle(IPC_CHANNELS.filesSearch, (_, payload: { cwd: string; query: string }) =>
    fileService.searchFiles(payload.cwd, payload.query)
  );
  ipcMain.handle(IPC_CHANNELS.filesRead, (_, payload: FileReadInput) =>
    fileService.readFile(payload.cwd, payload.relativePath)
  );
  ipcMain.handle(IPC_CHANNELS.filesWrite, (_, payload: FileWriteInput) =>
    fileService.writeFile(payload.cwd, payload.relativePath, payload.content)
  );
  ipcMain.handle(IPC_CHANNELS.filesCreate, (_, payload: FileReadInput) =>
    fileService.createFile(payload.cwd, payload.relativePath)
  );
  ipcMain.handle(IPC_CHANNELS.filesDelete, (_, payload: FileReadInput) =>
    fileService.deleteFile(payload.cwd, payload.relativePath)
  );
  ipcMain.handle(IPC_CHANNELS.editApplyPatch, (_, payload) => editService.applyPatch(payload));
  ipcMain.handle(
    IPC_CHANNELS.terminalPtyCreate,
    (_, payload: { sessionId: string; cwd: string; worktreeId: string }) =>
      ptyService.getOrCreate(payload.sessionId, payload.cwd, payload.worktreeId)
  );
  ipcMain.handle(IPC_CHANNELS.terminalPtyWrite, (_, payload: { sessionId: string; data: string }) => {
    ptyService.write(payload.sessionId, payload.data);
  });
  ipcMain.handle(IPC_CHANNELS.terminalPtyResize, (_, payload: { sessionId: string; cols: number; rows: number }) => {
    ptyService.resize(payload.sessionId, payload.cols, payload.rows);
  });
  ipcMain.handle(IPC_CHANNELS.terminalPtyKill, (_, payload: { sessionId: string }) => {
    ptyService.kill(payload.sessionId);
  });
  ipcMain.handle(IPC_CHANNELS.terminalPtyListSessions, () => ptyService.listSessionWorktreeIds());
  ipcMain.handle(IPC_CHANNELS.terminalPtyGetBuffer, (_, payload: { sessionId: string }) =>
    ptyService.getBuffer(payload.sessionId)
  );

  ipcMain.handle(IPC_CHANNELS.dialogPickRepoDirectory, async (event) => {
    const win =
      BrowserWindow.fromWebContents(event.sender) ??
      BrowserWindow.getFocusedWindow() ??
      BrowserWindow.getAllWindows()[0];
    const options = {
      title: "Select repository folder",
      properties: ["openDirectory" as const]
    };
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
  });
}

const dataDir = app.getPath("userData");
const schemaSql = readWorkspaceSchemaSql();
const store = new WorkspaceStore(dataDir);
store.migrate(schemaSql);
const workspaceService = new WorkspaceService(store);
ptyService.setSubmittedInputListener((sessionId, input) => {
  if (workspaceService.maybeRenameThreadFromPrompt(sessionId, input)) {
    emitWorkspaceDidChange();
  }
});
registerIpc(workspaceService);

createMainWindow();
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
