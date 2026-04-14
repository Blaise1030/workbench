import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell, WebContentsView, type WebContents } from "electron";
import {
  IPC_CHANNELS,
  type AddProjectInput,
  type AddWorktreeInput,
  type AppUpdateAvailability,
  type CreateThreadInput,
  type CreateWorktreeGroupInput,
  type DeleteThreadInput,
  type FileAbsolutePathInput,
  type FileReadInput,
  type FileResolveMarkdownImageUrlInput,
  type FileWriteInput,
  type RemoveProjectInput,
  type RenameThreadInput,
  type ReorderProjectsInput,
  type PreviewLoadStatePayload
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
import { GitHeadWatcher } from "./services/gitHeadWatcher.js";
import { WorkspaceService } from "./services/workspaceService.js";
import { WorkspaceStore } from "./storage/store.js";

// Single-window assumption: one preview view per app instance.
let previewView: WebContentsView | null = null;
/** BrowserWindow that opened the preview (for main → renderer IPC). */
let previewHostWindow: BrowserWindow | null = null;
let disposePreviewLoadBroadcast: (() => void) | null = null;

function sendPreviewLoadState(win: BrowserWindow | null | undefined, payload: PreviewLoadStatePayload): void {
  if (!win?.webContents || win.isDestroyed()) return;
  try {
    win.webContents.send(IPC_CHANNELS.previewLoadState, payload);
  } catch {
    /* window may be closing */
  }
}

function previewSenderHostWindow(event: { sender: WebContents }): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender) ?? previewHostWindow;
}

function disposePreviewLoadHooks(): void {
  disposePreviewLoadBroadcast?.();
  disposePreviewLoadBroadcast = null;
}

const PREVIEW_DEVICE_EMULATION_PRESETS = new Set(["clear", "mobile", "tablet", "desktop"]);

/** Chromium `enableDeviceEmulation` / `disableDeviceEmulation` for the embedded preview page. */
function applyPreviewDeviceEmulation(wc: WebContents, preset: string): void {
  if (preset === "clear" || preset === "desktop") {
    try {
      wc.disableDeviceEmulation();
    } catch {
      /* noop */
    }
    return;
  }
  try {
    if (preset === "mobile") {
      wc.enableDeviceEmulation({
        screenPosition: "mobile",
        screenSize: { width: 390, height: 844 },
        viewSize: { width: 390, height: 844 },
        deviceScaleFactor: 0,
        scale: 1,
        viewPosition: { x: 0, y: 0 }
      });
      return;
    }
    if (preset === "tablet") {
      wc.enableDeviceEmulation({
        screenPosition: "mobile",
        screenSize: { width: 834, height: 1194 },
        viewSize: { width: 834, height: 1194 },
        deviceScaleFactor: 0,
        scale: 1,
        viewPosition: { x: 0, y: 0 }
      });
    }
  } catch {
    /* preview may be closing */
  }
}

/** Subscribe to preview `WebContents` navigation and push state to the workbench window. */
function attachPreviewLoadBroadcast(wc: WebContents, hostWin: BrowserWindow): () => void {
  disposePreviewLoadHooks();

  const filter: Electron.WebRequestFilter = { urls: ["<all_urls>"] };
  let lastMainFrame: { statusCode: number; statusLine: string; url: string } | null = null;
  let mainFrameFailed = false;

  const onCompleted = (details: Electron.OnCompletedListenerDetails): void => {
    if (details.resourceType !== "mainFrame") return;
    if (details.webContentsId !== wc.id) return;
    lastMainFrame = {
      statusCode: details.statusCode,
      statusLine: details.statusLine,
      url: details.url
    };
  };
  wc.session.webRequest.onCompleted(filter, onCompleted);

  const onStart = (): void => {
    lastMainFrame = null;
    mainFrameFailed = false;
    sendPreviewLoadState(hostWin, { kind: "loading", url: wc.getURL() || "" });
  };

  const onFinish = (): void => {
    if (mainFrameFailed) return;
    const url = wc.getURL() || "";
    if (lastMainFrame && lastMainFrame.statusCode >= 400) {
      sendPreviewLoadState(hostWin, {
        kind: "httpError",
        url: lastMainFrame.url || url,
        statusCode: lastMainFrame.statusCode,
        statusLine: lastMainFrame.statusLine
      });
      return;
    }
    const statusCode = lastMainFrame?.statusCode ?? 200;
    sendPreviewLoadState(hostWin, { kind: "loaded", url, statusCode });
  };

  const onFail = (
    _event: unknown,
    errorCode: number,
    errorDescription: string,
    validatedURL: string,
    isMainFrame: boolean
  ): void => {
    if (!isMainFrame) return;
    if (errorCode === -3) return; // ERR_ABORTED — superseded navigation
    mainFrameFailed = true;
    sendPreviewLoadState(hostWin, {
      kind: "failed",
      url: validatedURL,
      errorCode,
      errorDescription: errorDescription || `net error ${errorCode}`
    });
  };

  wc.on("did-start-loading", onStart);
  wc.on("did-finish-load", onFinish);
  wc.on("did-fail-load", onFail);
  wc.on("did-fail-provisional-load", onFail);

  return (): void => {
    wc.removeListener("did-start-loading", onStart);
    wc.removeListener("did-finish-load", onFinish);
    wc.removeListener("did-fail-load", onFail);
    wc.removeListener("did-fail-provisional-load", onFail);
    wc.session.webRequest.onCompleted(filter, null);
  };
}

/** Threads whose PTY we scan for resume IDs (stdout + submitted command lines). */
const AGENTS_WITH_RESUME_CAPTURE: ThreadAgent[] = ["cursor", "claude", "codex", "gemini"];

const WORKBENCH_RELEASES_LATEST_API =
  "https://api.github.com/repos/Blaise1030/workbench/releases/latest";
const WORKBENCH_REPO_COMPARE_BASE = "https://github.com/Blaise1030/workbench/compare";

function readBundledPackageJsonVersion(): string | null {
  try {
    const pkgPath = path.join(app.getAppPath(), "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || !("version" in parsed)) return null;
    const v = (parsed as { version?: unknown }).version;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/** Ship semver for update checks and release-tag display (bundled package.json first, then `app.getVersion()`). */
function getWorkbenchAppSemver(): string {
  return readBundledPackageJsonVersion() ?? app.getVersion()?.trim() ?? "";
}

/** GitHub-style tag string for the running build (e.g. `v0.6.0`). */
function getAppReleaseTag(): string {
  const s = getWorkbenchAppSemver();
  if (!s) return "";
  return /^v\d/i.test(s) ? s : `v${s}`;
}

function githubCompareRefForCurrent(currentSemver: string, latestTag: string): string {
  const cur = currentSemver.replace(/^v/i, "");
  return /^v\d/i.test(latestTag) ? `v${cur}` : cur;
}

async function fetchWorkbenchUpdateFromGitHub(): Promise<AppUpdateAvailability | null> {
  try {
    const res = await fetch(WORKBENCH_RELEASES_LATEST_API, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "workbench-app" }
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    const latestTag = data.tag_name ?? "";
    const latestVersion = latestTag.replace(/^v/i, "");
    const currentVersion = getWorkbenchAppSemver().replace(/^v/i, "");
    if (!latestVersion || latestVersion === currentVersion) return null;
    const releasePageUrl =
      typeof data.html_url === "string"
        ? data.html_url
        : "https://github.com/Blaise1030/workbench/releases/latest";
    const lhs = githubCompareRefForCurrent(currentVersion, latestTag);
    const compareUrl = `${WORKBENCH_REPO_COMPARE_BASE}/${encodeURIComponent(lhs)}...${encodeURIComponent(latestTag)}`;
    return {
      currentVersion,
      latestVersion,
      latestTag,
      releasePageUrl,
      compareUrl
    };
  } catch {
    return null;
  }
}

/** Single in-flight / resolved result per app run (startup check + renderer IPC share one GitHub request). */
let workbenchUpdateCheckPromise: Promise<AppUpdateAvailability | null> | null = null;

function getWorkbenchUpdateAvailability(): Promise<AppUpdateAvailability | null> {
  if (!app.isPackaged) return Promise.resolve(null);
  workbenchUpdateCheckPromise ??= fetchWorkbenchUpdateFromGitHub();
  return workbenchUpdateCheckPromise;
}

/** Packaged builds: probe GitHub for a newer release shortly after launch (UI uses IPC). */
async function checkForUpdate(): Promise<void> {
  if (!app.isPackaged) return;
  try {
    await getWorkbenchUpdateAvailability();
  } catch {
    // network / parse failures already yield null from fetch
  }
}

function isAllowedAppOpenExternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "github.com";
  } catch {
    return false;
  }
}

const runService = new RunService();
const diffService = new DiffService();
const editService = new EditService();
const fileService = new FileService();
const ptyService = new PtyService();
let gitHeadWatcher: GitHeadWatcher | null = null;
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
  gitHeadWatcher?.syncFromSnapshot(workspaceService.getSnapshot());
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
      sandbox: true
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

/**
 * Asserts that `cwd` is a registered worktree path or a sub-path of one.
 * Exempt handlers: diffIsGitRepository, diffInitGitRepository (used before project is registered).
 */
function assertCwdIsRegistered(cwd: string): void {
  const snapshot = workspaceService.getSnapshot();
  const registered = snapshot.worktrees.some(
    (wt) => cwd === wt.path || cwd.startsWith(wt.path + path.sep)
  );
  if (!registered) {
    throw new Error(`Operation refused: cwd is not a registered worktree path: "${cwd}"`);
  }
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
  ipcMain.handle(IPC_CHANNELS.workspaceCreateThread, async (_, payload: CreateThreadInput) => {
    const snapshot = workspaceService.getSnapshot();
    const wt = snapshot.worktrees.find((w) => w.id === payload.worktreeId);
    const createdBranchOverride =
      wt == null ? undefined : (await diffService.readAbbrevRefHead(wt.path)) ?? wt.branch ?? null;
    const thread = workspaceService.createThread(payload, createdBranchOverride);
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

  ipcMain.handle(IPC_CHANNELS.runStart, (_, payload: { agent: ThreadAgent; cwd: string; prompt: string }) => {
    assertCwdIsRegistered(payload.cwd);
    return runService.start(payload.agent, payload.cwd, payload.prompt, () => {}, () => {});
  });
  ipcMain.handle(IPC_CHANNELS.runSendInput, (_, payload: { runId: string; input: string }) => runService.sendInput(payload.runId, payload.input));
  ipcMain.handle(IPC_CHANNELS.runInterrupt, (_, runId: string) => runService.interrupt(runId));

  ipcMain.handle(IPC_CHANNELS.diffChangedFiles, (_, cwd: string) => { assertCwdIsRegistered(cwd); return diffService.changedFiles(cwd); });
  ipcMain.handle(IPC_CHANNELS.diffIsGitRepository, (_, cwd: string) => diffService.isGitRepository(cwd));
  ipcMain.handle(IPC_CHANNELS.diffInitGitRepository, (_, cwd: string) => diffService.initGitRepository(cwd));
  ipcMain.handle(IPC_CHANNELS.diffRepoStatus, (_, cwd: string) => { assertCwdIsRegistered(cwd); return diffService.repoStatus(cwd); });
  ipcMain.handle(
    IPC_CHANNELS.diffFileDiff,
    (_, payload: { cwd: string; file: string; scope?: "staged" | "unstaged" | "combined" }) => {
      assertCwdIsRegistered(payload.cwd);
      return diffService.fileDiff(payload.cwd, payload.file, payload.scope);
    }
  );
  ipcMain.handle(
    IPC_CHANNELS.diffFileMergeSides,
    (_, payload: { cwd: string; file: string; scope: "staged" | "unstaged" }) => {
      assertCwdIsRegistered(payload.cwd);
      return diffService.fileMergeSides(payload.cwd, payload.file, payload.scope);
    }
  );
  ipcMain.handle(IPC_CHANNELS.diffWorkingTree, (_, cwd: string) => { assertCwdIsRegistered(cwd); return diffService.workingTreeDiff(cwd); });
  ipcMain.handle(IPC_CHANNELS.diffStageAll, (_, cwd: string) => { assertCwdIsRegistered(cwd); return diffService.stageAll(cwd); });
  ipcMain.handle(IPC_CHANNELS.diffUnstageAll, (_, cwd: string) => { assertCwdIsRegistered(cwd); return diffService.unstageAll(cwd); });
  ipcMain.handle(IPC_CHANNELS.diffDiscardAll, (_, cwd: string) => { assertCwdIsRegistered(cwd); return diffService.discardAll(cwd); });
  ipcMain.handle(IPC_CHANNELS.diffStagePaths, (_, payload: { cwd: string; paths: string[] }) => {
    assertCwdIsRegistered(payload.cwd);
    return diffService.stagePaths(payload.cwd, payload.paths);
  });
  ipcMain.handle(IPC_CHANNELS.diffUnstagePaths, (_, payload: { cwd: string; paths: string[] }) => {
    assertCwdIsRegistered(payload.cwd);
    return diffService.unstagePaths(payload.cwd, payload.paths);
  });
  ipcMain.handle(IPC_CHANNELS.diffDiscardPaths, (_, payload: { cwd: string; paths: string[] }) => {
    assertCwdIsRegistered(payload.cwd);
    return diffService.discardPaths(payload.cwd, payload.paths);
  });
  ipcMain.handle(IPC_CHANNELS.diffGitFetch, (_, cwd: string) => { assertCwdIsRegistered(cwd); return diffService.gitFetch(cwd); });
  ipcMain.handle(IPC_CHANNELS.diffGitPush, (_, cwd: string) => { assertCwdIsRegistered(cwd); return diffService.gitPush(cwd); });
  ipcMain.handle(IPC_CHANNELS.diffGitCommit, (_, payload: { cwd: string; message: string }) => {
    assertCwdIsRegistered(payload.cwd);
    return diffService.commitStaged(payload.cwd, payload.message);
  });
  ipcMain.handle(IPC_CHANNELS.diffGitCheckoutBranch, async (_, payload: { cwd: string; branch: string }) => {
    assertCwdIsRegistered(payload.cwd);
    await diffService.checkoutBranch(payload.cwd, payload.branch);
    workspaceService.updateWorktreeBranchAtPath(payload.cwd, payload.branch);
    emitWorkspaceDidChange();
    emitWorkingTreeFilesDidChange();
  });
  ipcMain.handle(IPC_CHANNELS.filesList, (_, cwd: string) => {
    assertCwdIsRegistered(cwd);
    return fileService.listFileSummariesCached(cwd);
  });
  ipcMain.handle(IPC_CHANNELS.filesSearch, (_, payload: { cwd: string; query: string }) => {
    assertCwdIsRegistered(payload.cwd);
    return fileService.searchFiles(payload.cwd, payload.query);
  });
  ipcMain.handle(IPC_CHANNELS.filesSearchContent, (_, payload: { cwd: string; query: string }) => {
    assertCwdIsRegistered(payload.cwd);
    return fileService.searchFileContents(payload.cwd, payload.query);
  });
  ipcMain.handle(IPC_CHANNELS.filesRead, (_, payload: FileReadInput) => {
    assertCwdIsRegistered(payload.cwd);
    return fileService.readFile(payload.cwd, payload.relativePath);
  });
  ipcMain.handle(IPC_CHANNELS.filesResolveMarkdownImageUrl, (_, payload: FileResolveMarkdownImageUrlInput) =>
    fileService.resolveMarkdownImageUrl(payload.cwd, payload.relativePath, payload.href)
  );
  ipcMain.handle(
    IPC_CHANNELS.filesReadImageDataUrlFromAbsolutePath,
    (_, payload: FileAbsolutePathInput) => fileService.readImageDataUrlFromAbsolutePath(payload.absolutePath)
  );
  ipcMain.handle(IPC_CHANNELS.filesWrite, async (_, payload: FileWriteInput) => {
    assertCwdIsRegistered(payload.cwd);
    await fileService.writeFile(payload.cwd, payload.relativePath, payload.content);
    emitWorkingTreeFilesDidChange();
  });
  ipcMain.handle(IPC_CHANNELS.filesCreate, async (_, payload: FileReadInput) => {
    assertCwdIsRegistered(payload.cwd);
    await fileService.createFile(payload.cwd, payload.relativePath);
    emitWorkingTreeFilesDidChange();
  });
  ipcMain.handle(IPC_CHANNELS.filesDelete, async (_, payload: FileReadInput) => {
    assertCwdIsRegistered(payload.cwd);
    await fileService.deleteFile(payload.cwd, payload.relativePath);
    emitWorkingTreeFilesDidChange();
  });
  ipcMain.handle(IPC_CHANNELS.filesCreateFolder, async (_, payload: FileReadInput) => {
    assertCwdIsRegistered(payload.cwd);
    await fileService.createFolder(payload.cwd, payload.relativePath);
    emitWorkingTreeFilesDidChange();
  });
  ipcMain.handle(IPC_CHANNELS.filesDeleteFolder, async (_, payload: FileReadInput) => {
    assertCwdIsRegistered(payload.cwd);
    await fileService.deleteFolder(payload.cwd, payload.relativePath);
    emitWorkingTreeFilesDidChange();
  });
  ipcMain.handle(IPC_CHANNELS.editApplyPatch, async (_, payload) => {
    assertCwdIsRegistered(payload.cwd);
    await editService.applyPatch(payload);
    emitWorkingTreeFilesDidChange();
  });
  ipcMain.handle(
    IPC_CHANNELS.terminalPtyCreate,
    (_, payload: { sessionId: string; cwd: string; worktreeId: string }) => {
      assertCwdIsRegistered(payload.cwd);
      return ptyService.getOrCreate(payload.sessionId, payload.cwd, payload.worktreeId);
    }
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

  ipcMain.handle(IPC_CHANNELS.appGetVersion, () => app.getVersion());
  ipcMain.handle(IPC_CHANNELS.appGetReleaseTag, () => getAppReleaseTag());
  ipcMain.handle(IPC_CHANNELS.appGetUpdateAvailability, () => getWorkbenchUpdateAvailability());
  ipcMain.handle(IPC_CHANNELS.appOpenExternalUrl, async (_, url: unknown) => {
    if (typeof url !== "string" || !isAllowedAppOpenExternalUrl(url)) return;
    await shell.openExternal(url);
  });

  ipcMain.handle(IPC_CHANNELS.previewShow, (event) => {
    if (previewView) return;
    const win =
      BrowserWindow.fromWebContents(event.sender) ??
      BrowserWindow.getFocusedWindow() ??
      BrowserWindow.getAllWindows()[0];
    if (!win) return;
    previewView = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        /** Own session so `webRequest` main-frame events map to this `webContents` (HTTP status / errors). */
        partition: "persist:instrument.preview"
      }
    });
    try {
      win.contentView.addChildView(previewView);
    } catch (err) {
      previewView.webContents.close();
      previewView = null;
      throw err;
    }
    previewHostWindow = win;
    disposePreviewLoadBroadcast = attachPreviewLoadBroadcast(previewView.webContents, win);

    // Forward workspace-owned key combos to the renderer. When focus is inside the
    // WebContentsView its keydown events never reach the BrowserWindow, so we intercept
    // them here and re-emit via IPC so `useWorkspaceKeybindings` can handle them.
    const PREVIEW_WORKSPACE_CODES = new Set([
      "BracketLeft", "BracketRight",
      "KeyB", "KeyT", "KeyN", "KeyJ", "KeyF", "KeyA", "KeyG", "KeyE", "KeyK", "KeyS",
      "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9",
      "Comma", "Backslash", "Enter"
    ]);
    previewView.webContents.on("before-input-event", (inputEvent, input) => {
      if (input.type !== "keyDown") return;
      if (!previewHostWindow || previewHostWindow.isDestroyed()) return;
      const mac = process.platform === "darwin";
      const mod = mac ? input.meta : input.control;
      if (!mod) return;
      if (!PREVIEW_WORKSPACE_CODES.has(input.code)) return;
      inputEvent.preventDefault();
      previewHostWindow.webContents.send(IPC_CHANNELS.previewShortcutFired, {
        mod: true,
        shift: Boolean(input.shift),
        alt: Boolean(input.alt),
        code: input.code
      });
    });
  });

  ipcMain.handle(IPC_CHANNELS.previewHide, () => {
    if (!previewView) return;
    disposePreviewLoadHooks();
    previewHostWindow = null;
    try {
      previewView.webContents.disableDeviceEmulation();
    } catch {
      /* noop */
    }
    for (const win of BrowserWindow.getAllWindows()) {
      try { win.contentView.removeChildView(previewView!); } catch { /* already removed */ }
    }
    previewView.webContents.close();
    previewView = null;
  });

  ipcMain.handle(IPC_CHANNELS.previewSetBounds, (_, bounds: { x: number; y: number; width: number; height: number }) => {
    if (!previewView) return;
    previewView.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    });
  });

  ipcMain.handle(IPC_CHANNELS.previewSetUrl, (event, url: string) => {
    if (!previewView) return;
    const win = previewSenderHostWindow(event);
    sendPreviewLoadState(win, { kind: "loading", url });
    void previewView.webContents.loadURL(url);
  });

  ipcMain.handle(IPC_CHANNELS.previewProbeUrl, async (_, url: string) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, code: "invalid", message: "Not a valid URL" } as const;
    }
    try {
      // Uses global fetch (undici) which is sufficient for localhost probing.
      // For proxy-aware or session-aware probing, replace with Electron's net.fetch.
      const res = await fetch(parsed.href);
      return { ok: true, status: res.status } as const;
    } catch (e) {
      return { ok: false, code: "network", message: String(e) } as const;
    }
  });

  ipcMain.handle(IPC_CHANNELS.previewReload, (event) => {
    if (!previewView) return;
    const win = previewSenderHostWindow(event);
    sendPreviewLoadState(win, {
      kind: "loading",
      url: previewView.webContents.getURL() || ""
    });
    previewView.webContents.reload();
  });

  ipcMain.handle(IPC_CHANNELS.previewOpenDevTools, () => {
    if (!previewView) return;
    /** Dock inside the preview `WebContentsView` (split below the page). */
    previewView.webContents.openDevTools({ mode: "bottom" });
  });

  ipcMain.handle(IPC_CHANNELS.previewSetDeviceEmulation, (_, payload: unknown) => {
    if (!previewView || typeof payload !== "string") return;
    if (!PREVIEW_DEVICE_EMULATION_PRESETS.has(payload)) return;
    applyPreviewDeviceEmulation(previewView.webContents, payload);
  });

  ipcMain.handle(IPC_CHANNELS.previewSetOccludedByModal, (_, occluded: unknown) => {
    if (!previewView || typeof occluded !== "boolean") return;
    try {
      previewView.setVisible(!occluded);
    } catch {
      /* preview tearing down */
    }
  });
}

const dataDir = app.getPath("userData");
const schemaSql = readWorkspaceSchemaSql();
const store = new WorkspaceStore(dataDir);
store.migrate(schemaSql);
const gitAdapter = createGitAdapter();
const workspaceService = new WorkspaceService(store, gitAdapter);
gitHeadWatcher = new GitHeadWatcher({
  diffService,
  workspaceService,
  onWorkingTreeChanged: emitWorkingTreeFilesDidChange,
  onWorkspaceMetadataChanged: emitWorkspaceDidChange
});
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
gitHeadWatcher.syncFromSnapshot(workspaceService.getSnapshot());

app.on("will-quit", () => {
  gitHeadWatcher?.dispose();
  gitHeadWatcher = null;
});

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
