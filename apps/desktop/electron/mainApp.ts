import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import {
  IPC_CHANNELS,
  type AddProjectInput,
  type AddWorktreeInput,
  type CreateThreadInput,
  type CreateWorktreeGroupInput,
  type DeleteThreadInput,
  type FileReadInput,
  type FileWriteInput,
  type RemoveProjectInput,
  type RenameThreadInput,
  type ReorderProjectsInput
} from "../src/shared/ipc.js";
import type { ThreadAgent } from "../src/shared/domain.js";
import { DiffService } from "./services/diffService.js";
import { EditService } from "./services/editService.js";
import { FileService } from "./services/fileService.js";
import { RunService } from "./services/runService.js";
import { PtyService } from "./services/ptyService.js";
import { createGitAdapter } from "./services/gitAdapter.js";
import { shouldAllowAppClose } from "./lifecycle/closeConfirmation.js";
import { buildCloseConfirmationDetail } from "./lifecycle/closeConfirmation.js";
import { captureResumeIdsBeforeQuit } from "./lifecycle/quitResumeCapture.js";
import { collectResumeIdsFromActiveTerminals } from "./lifecycle/quitResumeCapture.js";
import { extractResumeIdFromStdout, RESUME_CAPTURE_TAIL_CHARS } from "./adapters/resumeIdCapture.js";
import { WorkspaceService } from "./services/workspaceService.js";
import { WorkspaceStore } from "./storage/store.js";

/** Threads whose PTY we scan for resume IDs (stdout + submitted command lines). */
const AGENTS_WITH_RESUME_CAPTURE: ThreadAgent[] = ["cursor", "claude", "codex", "gemini"];

const runService = new RunService();
const diffService = new DiffService();
const editService = new EditService();
const fileService = new FileService();
const ptyService = new PtyService();
let hasConfirmedClose = false;
let closeConfirmationInFlight = false;

async function promptForCloseConfirmation(): Promise<boolean> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const activeTerminalCount = ptyService.getActiveSessionCount();
  const opts = {
    type: "warning" as const,
    buttons: ["Cancel", "Confirm"],
    defaultId: 1,
    cancelId: 0,
    title: "Confirm close",
    message: "Are you sure you want to close the app?",
    detail: buildCloseConfirmationDetail(activeTerminalCount, [])
  };
  const { response } = win
    ? await dialog.showMessageBox(win, opts)
    : await dialog.showMessageBox(opts);
  if (response !== 1) return false;
  await collectResumeIdsFromActiveTerminals(ptyService);
  return true;
}

/** Dev / unpackaged window icon; packaged apps use platform icons from electron-builder. */
function devAppIconPath(): string | undefined {
  if (app.isPackaged) return undefined;
  const p = path.join(__dirname, "../../build/icon.png");
  return fs.existsSync(p) ? p : undefined;
}

function emitWorkspaceDidChange(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.workspaceDidChange);
  }
}

function emitWorkingTreeFilesDidChange(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.workingTreeFilesDidChange);
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
    icon: devAppIconPath(),
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

  /** ⌘, / Ctrl+, is often eaten by the OS or default app menu before the renderer sees it. */
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const mac = process.platform === "darwin";
    const mod = mac ? input.meta : input.control;
    if (mod && !input.alt && !input.shift && input.key === ",") {
      event.preventDefault();
      win.webContents.send(IPC_CHANNELS.uiOpenWorkspaceSettings);
    }
  });

  const rendererUrl = process.env.VITE_DEV_SERVER_URL;
  if (rendererUrl) {
    void win.loadURL(rendererUrl);
  } else {
    void win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  win.on("close", (event) => {
    if (hasConfirmedClose) return;
    event.preventDefault();
    if (closeConfirmationInFlight) return;
    closeConfirmationInFlight = true;
    void shouldAllowAppClose(hasConfirmedClose, promptForCloseConfirmation)
      .then((confirmed) => {
        if (!confirmed) return;
        hasConfirmedClose = true;
        win.close();
      })
      .finally(() => {
        closeConfirmationInFlight = false;
      });
  });
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
    workspaceService.addWorktree(project.id, branch, payload.repoPath, true);
    emitWorkspaceDidChange();
    return workspaceService.getSnapshot();
  });
  ipcMain.handle(IPC_CHANNELS.workspaceRemoveProject, (_, payload: RemoveProjectInput) => {
    workspaceService.removeProject(payload.projectId);
    emitWorkspaceDidChange();
  });
  ipcMain.handle(IPC_CHANNELS.workspaceReorderProjects, (_, payload: ReorderProjectsInput) => {
    workspaceService.reorderProjects(payload.orderedProjectIds);
    emitWorkspaceDidChange();
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
    const thread = snapshot.threads.find((t) => t.id === threadId);
    const worktreeId = thread?.worktreeId ?? snapshot.activeWorktreeId;
    workspaceService.setActive(snapshot.activeProjectId, worktreeId, threadId);
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
  ipcMain.handle(IPC_CHANNELS.workspaceCreateWorktreeGroup, async (_, payload: CreateWorktreeGroupInput) => {
    const worktree = await workspaceService.createWorktreeGroup(payload);
    emitWorkspaceDidChange();
    return worktree;
  });
  ipcMain.handle(IPC_CHANNELS.workspaceDeleteWorktreeGroup, async (_, payload: { worktreeId: string }) => {
    await workspaceService.deleteWorktreeGroup(payload.worktreeId);
    emitWorkspaceDidChange();
  });
  ipcMain.handle(IPC_CHANNELS.workspaceListBranches, async (_, payload: { projectId: string }) => {
    return workspaceService.listBranches(payload.projectId);
  });
  ipcMain.handle(IPC_CHANNELS.workspaceWorktreeHealth, async (_, payload: { worktreeId: string }) => {
    return workspaceService.checkWorktreeHealth(payload.worktreeId);
  });
  ipcMain.handle(IPC_CHANNELS.workspaceSyncWorktrees, async (_, payload: { projectId: string }) => {
    const imported = await workspaceService.syncWorktrees(payload.projectId);
    if (imported) emitWorkspaceDidChange();
    return workspaceService.getSnapshot();
  });

  ipcMain.handle(IPC_CHANNELS.runStart, (_, payload: { agent: ThreadAgent; cwd: string; prompt: string }) =>
    runService.start(payload.agent, payload.cwd, payload.prompt, () => {}, () => {})
  );
  ipcMain.handle(IPC_CHANNELS.runSendInput, (_, payload: { runId: string; input: string }) => runService.sendInput(payload.runId, payload.input));
  ipcMain.handle(IPC_CHANNELS.runInterrupt, (_, runId: string) => runService.interrupt(runId));

  ipcMain.handle(IPC_CHANNELS.diffChangedFiles, (_, cwd: string) => diffService.changedFiles(cwd));
  ipcMain.handle(IPC_CHANNELS.diffIsGitRepository, (_, cwd: string) => diffService.isGitRepository(cwd));
  ipcMain.handle(IPC_CHANNELS.diffInitGitRepository, (_, cwd: string) => diffService.initGitRepository(cwd));
  ipcMain.handle(IPC_CHANNELS.diffRepoStatus, (_, cwd: string) => diffService.repoStatus(cwd));
  ipcMain.handle(
    IPC_CHANNELS.diffFileDiff,
    (_, payload: { cwd: string; file: string; scope?: "staged" | "unstaged" | "combined" }) =>
      diffService.fileDiff(payload.cwd, payload.file, payload.scope)
  );
  ipcMain.handle(IPC_CHANNELS.diffWorkingTree, (_, cwd: string) => diffService.workingTreeDiff(cwd));
  ipcMain.handle(IPC_CHANNELS.diffStageAll, (_, cwd: string) => diffService.stageAll(cwd));
  ipcMain.handle(IPC_CHANNELS.diffUnstageAll, (_, cwd: string) => diffService.unstageAll(cwd));
  ipcMain.handle(IPC_CHANNELS.diffDiscardAll, (_, cwd: string) => diffService.discardAll(cwd));
  ipcMain.handle(IPC_CHANNELS.diffStagePaths, (_, payload: { cwd: string; paths: string[] }) =>
    diffService.stagePaths(payload.cwd, payload.paths)
  );
  ipcMain.handle(IPC_CHANNELS.diffUnstagePaths, (_, payload: { cwd: string; paths: string[] }) =>
    diffService.unstagePaths(payload.cwd, payload.paths)
  );
  ipcMain.handle(IPC_CHANNELS.diffDiscardPaths, (_, payload: { cwd: string; paths: string[] }) =>
    diffService.discardPaths(payload.cwd, payload.paths)
  );
  ipcMain.handle(IPC_CHANNELS.diffGitFetch, (_, cwd: string) => diffService.gitFetch(cwd));
  ipcMain.handle(IPC_CHANNELS.diffGitPush, (_, cwd: string) => diffService.gitPush(cwd));
  ipcMain.handle(IPC_CHANNELS.diffGitCommit, (_, payload: { cwd: string; message: string }) =>
    diffService.commitStaged(payload.cwd, payload.message)
  );
  ipcMain.handle(IPC_CHANNELS.filesList, (_, cwd: string) => fileService.listFileSummaries(cwd));
  ipcMain.handle(IPC_CHANNELS.filesSearch, (_, payload: { cwd: string; query: string }) =>
    fileService.searchFiles(payload.cwd, payload.query)
  );
  ipcMain.handle(IPC_CHANNELS.filesRead, (_, payload: FileReadInput) =>
    fileService.readFile(payload.cwd, payload.relativePath)
  );
  ipcMain.handle(IPC_CHANNELS.filesWrite, async (_, payload: FileWriteInput) => {
    await fileService.writeFile(payload.cwd, payload.relativePath, payload.content);
    emitWorkingTreeFilesDidChange();
  });
  ipcMain.handle(IPC_CHANNELS.filesCreate, async (_, payload: FileReadInput) => {
    await fileService.createFile(payload.cwd, payload.relativePath);
    emitWorkingTreeFilesDidChange();
  });
  ipcMain.handle(IPC_CHANNELS.filesDelete, async (_, payload: FileReadInput) => {
    await fileService.deleteFile(payload.cwd, payload.relativePath);
    emitWorkingTreeFilesDidChange();
  });
  ipcMain.handle(IPC_CHANNELS.filesCreateFolder, async (_, payload: FileReadInput) => {
    await fileService.createFolder(payload.cwd, payload.relativePath);
    emitWorkingTreeFilesDidChange();
  });
  ipcMain.handle(IPC_CHANNELS.filesDeleteFolder, async (_, payload: FileReadInput) => {
    await fileService.deleteFolder(payload.cwd, payload.relativePath);
    emitWorkingTreeFilesDidChange();
  });
  ipcMain.handle(IPC_CHANNELS.editApplyPatch, async (_, payload) => {
    await editService.applyPatch(payload);
    emitWorkingTreeFilesDidChange();
  });
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
const gitAdapter = createGitAdapter();
const workspaceService = new WorkspaceService(store, gitAdapter);
ptyService.setSubmittedInputListener((sessionId, input) => {
  let didChange = workspaceService.maybeRenameThreadFromPrompt(sessionId, input);
  // Capture resume/session UUID from a submitted shell line (e.g. `gemini --resume <uuid>` Enter).
  if (!sessionId.startsWith("__")) {
    const thread = workspaceService.getSnapshot().threads.find((t) => t.id === sessionId);
    if (thread && AGENTS_WITH_RESUME_CAPTURE.includes(thread.agent)) {
      const fromLine = extractResumeIdFromStdout(input);
      if (fromLine && workspaceService.captureResumeId(sessionId, fromLine)) {
        didChange = true;
      }
    }
  }
  if (didChange) emitWorkspaceDidChange();
});
ptyService.setSessionOutputListener((sessionId) => {
  // Thread-bound sessions use the thread id as PTY session key; ignore shell/worktree sessions.
  if (sessionId.startsWith("__")) return;
  const thread = workspaceService.getSnapshot().threads.find((t) => t.id === sessionId);
  if (!thread || !AGENTS_WITH_RESUME_CAPTURE.includes(thread.agent)) return;
  const { buffer } = ptyService.getBuffer(sessionId);
  const tail =
    buffer.length > RESUME_CAPTURE_TAIL_CHARS
      ? buffer.slice(-RESUME_CAPTURE_TAIL_CHARS)
      : buffer;
  const resumeId = extractResumeIdFromStdout(tail);
  if (!resumeId) return;
  if (workspaceService.captureResumeId(sessionId, resumeId)) {
    emitWorkspaceDidChange();
  }
});
registerIpc(workspaceService);

let allowQuitAfterResumeCapture = false;
let resumeCaptureOnQuitInFlight = false;
app.on("before-quit", (event) => {
  if (allowQuitAfterResumeCapture) return;
  event.preventDefault();
  if (closeConfirmationInFlight) return;
  closeConfirmationInFlight = true;
  void shouldAllowAppClose(hasConfirmedClose, promptForCloseConfirmation)
    .then((confirmed) => {
      if (!confirmed) return;
      hasConfirmedClose = true;
      if (resumeCaptureOnQuitInFlight) return;
      resumeCaptureOnQuitInFlight = true;
      void captureResumeIdsBeforeQuit(store, workspaceService, ptyService)
        .catch((err) => console.error("[electron] resume capture on quit failed:", err))
        .finally(() => {
          allowQuitAfterResumeCapture = true;
          resumeCaptureOnQuitInFlight = false;
          ptyService.killNonThreadSessions();
          app.quit();
        });
    })
    .finally(() => {
      closeConfirmationInFlight = false;
    });
});

createMainWindow();
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

if (app.isPackaged) {
  void checkForUpdate();
}

async function checkForUpdate(): Promise<void> {
  try {
    const res = await fetch("https://api.github.com/repos/Blaise1030/instrumental/releases/latest", {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "workbench-app" }
    });
    if (!res.ok) return;
    const data = await res.json() as { tag_name?: string; html_url?: string };
    const latestTag = data.tag_name ?? "";
    const latestVersion = latestTag.replace(/^v/, "");
    const currentVersion = app.getVersion();
    if (!latestVersion || latestVersion === currentVersion) return;

    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const opts = {
      type: "info" as const,
      buttons: ["Download", "Later"],
      defaultId: 0,
      title: "Update available",
      message: `workbench ${latestVersion} is available (you have ${currentVersion}).`,
      detail: "Click Download to open the release page in your browser."
    };
    const { response } = win
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts);
    if (response === 0) {
      const url = typeof data.html_url === "string" ? data.html_url : `https://github.com/Blaise1030/instrumental/releases/latest`;
      void shell.openExternal(url);
    }
  } catch {
    // silently ignore — no network, rate limit, etc.
  }
}
