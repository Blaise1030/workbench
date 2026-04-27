import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import {
  previewNativeDetach,
  previewNativeGoBack,
  previewNativeGoForward,
  previewNativeLoadUrl,
  previewNativeReload,
  previewNativeSetBounds,
  previewNativeToggleEmbeddedDevTools
} from "./previewBrowserViewHost.js";
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
  type ReorderProjectsInput
} from "../src/shared/ipc.js";
import type { ThreadAgent } from "../src/shared/domain.js";
import { DiffService } from "./services/diffService.js";
import { EditService } from "./services/editService.js";
import { FileService } from "./services/fileService.js";
import { RunService } from "./services/runService.js";
import { PtyService } from "./services/ptyService.js";
import { simpleGit } from "simple-git";
import { createGitAdapter } from "./services/gitAdapter.js";
import { filterLocalBranchesExcludingOtherWorktrees } from "../src/services/git/ipcGitService.js";
import { shouldAllowAppClose } from "./lifecycle/closeConfirmation.js";
import { buildCloseConfirmationDetail } from "./lifecycle/closeConfirmation.js";
import { collectResumeIdsFromActiveTerminals } from "./lifecycle/quitResumeCapture.js";
import { GitHeadWatcher } from "./services/gitHeadWatcher.js";
import { WorkspaceService } from "./services/workspaceService.js";
import { WorkspaceStore } from "./storage/store.js";
import { HookServer } from "./services/hookServer.js";
import { registerAllAgentHooks } from "./services/hookRegistrationService.js";
import { handleHookEvent } from "./adapters/hookHandler.js";
import { NotificationService } from "./services/notificationService.js";

function isSafePreviewOpenExternalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

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
const notificationService = new NotificationService();
const hookServer = new HookServer();
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
    transparent: true,
    backgroundColor: "#00000000",
    vibrancy: process.platform === "darwin" ? "under-window" : undefined,
    visualEffectState: process.platform === "darwin" ? "active" : undefined,
    titleBarStyle: 'hidden',
    titleBarOverlay: true,    
    trafficLightPosition: { x: 14, y: 14 }, // only relevant with native traffic lights
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
  win.on("enter-full-screen", () => {
    win.webContents.send(IPC_CHANNELS.windowFullscreenChanged, true);
  });
  win.on("leave-full-screen", () => {
    win.webContents.send(IPC_CHANNELS.windowFullscreenChanged, false);
  });

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

/** Absolute paths from renderer (Settings → Agent skill directories); allows `files:search` when not under a worktree. */
let agentSkillSearchRootsAbs: string[] = [];

const DEFAULT_AGENT_SKILL_ROOT_SEGMENTS: ReadonlyArray<readonly [string, string]> = [
  [".claude", "skills"],
  [".cursor", "skills"],
  [".codex", "skills"],
  [".gemini", "skills"]
];

function defaultAgentSkillSearchRootsFromHome(home: string): string[] {
  return DEFAULT_AGENT_SKILL_ROOT_SEGMENTS.map((segs) => path.resolve(path.join(home, ...segs)));
}

function isResolvedPathUnderAnyRoot(resolvedPath: string, roots: string[]): boolean {
  return roots.some((root) => resolvedPath === root || resolvedPath.startsWith(root + path.sep));
}

/**
 * `files:search` / `files:searchContent` may target agent skill dirs (~/.claude/skills, …) as well as worktrees.
 * Other file IPC handlers still require a registered worktree.
 */
function assertCwdAllowedForFileSearch(cwd: string): void {
  const snapshot = workspaceService.getSnapshot();
  const registered = snapshot.worktrees.some(
    (wt) => cwd === wt.path || cwd.startsWith(wt.path + path.sep)
  );
  if (registered) return;

  const resolved = path.resolve(cwd);
  const home = os.homedir();
  if (isResolvedPathUnderAnyRoot(resolved, defaultAgentSkillSearchRootsFromHome(home))) return;
  if (isResolvedPathUnderAnyRoot(resolved, agentSkillSearchRootsAbs)) return;

  throw new Error(
    `Operation refused: cwd is not allowed for file search (not a worktree or agent skill directory): "${cwd}"`
  );
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
  ipcMain.handle(IPC_CHANNELS.workspaceGetWorktreeEditorState, (_, payload: { worktreeId: string }) => {
    return workspaceService.getWorktreeEditorState(payload.worktreeId);
  });
  ipcMain.handle(
    IPC_CHANNELS.workspaceSetWorktreeEditorState,
    (_, payload: { worktreeId: string; selectedFilePath: string | null; openFilePaths: string[] }) => {
      workspaceService.setWorktreeEditorState(
        payload.worktreeId,
        payload.selectedFilePath,
        payload.openFilePaths
      );
    }
  );
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
  ipcMain.handle(IPC_CHANNELS.workspaceUpdateThread, (_, payload: { threadId: string; title?: string; agent?: ThreadAgent }) => {
    workspaceService.updateThread(payload.threadId, payload);
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
  ipcMain.handle(IPC_CHANNELS.workspaceSetAgentSkillSearchRoots, (_, roots: unknown) => {
    if (!Array.isArray(roots)) {
      agentSkillSearchRootsAbs = [];
      return;
    }
    const out: string[] = [];
    const seen = new Set<string>();
    for (const r of roots) {
      if (typeof r !== "string") continue;
      const t = r.trim();
      if (!t) continue;
      const n = path.resolve(t);
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    agentSkillSearchRootsAbs = out;
  });

  ipcMain.handle(IPC_CHANNELS.runStart, (_, payload: { agent: ThreadAgent; cwd: string; prompt: string }) => {
    assertCwdIsRegistered(payload.cwd);
    return runService.start(payload.agent, payload.cwd, payload.prompt, () => {});
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
  ipcMain.handle(IPC_CHANNELS.diffStagedUnified, (_, cwd: string) => {
    assertCwdIsRegistered(cwd);
    return diffService.stagedUnifiedDiff(cwd);
  });
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
  ipcMain.handle(IPC_CHANNELS.diffGitListWorktrees, (_, cwd: string) => {
    assertCwdIsRegistered(cwd);
    return gitAdapter.worktreeList(cwd);
  });
  ipcMain.handle(IPC_CHANNELS.diffGitListBranchesExcludingWorktrees, async (_, cwd: string) => {
    assertCwdIsRegistered(cwd);
    const git = simpleGit(cwd);
    const [branchResult, raw] = await Promise.all([
      git.branchLocal(),
      git.raw(["worktree", "list", "--porcelain"])
    ]);
    return filterLocalBranchesExcludingOtherWorktrees(cwd, branchResult.all, raw);
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
    assertCwdAllowedForFileSearch(payload.cwd);
    return fileService.searchFiles(payload.cwd, payload.query);
  });
  ipcMain.handle(IPC_CHANNELS.filesSearchContent, (_, payload: { cwd: string; query: string }) => {
    assertCwdAllowedForFileSearch(payload.cwd);
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
      const extraEnv: Record<string, string> = {};
      if (!payload.sessionId.startsWith("__")) {
        try {
          extraEnv["INSTRUMENT_HOOK_URL"] = hookServer.getUrl();
        } catch {
          // hookServer not started yet — no env injected
        }
        extraEnv["INSTRUMENT_THREAD_ID"] = payload.sessionId;
      }
      return ptyService.getOrCreate(payload.sessionId, payload.cwd, payload.worktreeId, extraEnv);
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
  ipcMain.handle(IPC_CHANNELS.appGetUserHomeDir, () => os.homedir());
  ipcMain.handle(IPC_CHANNELS.appGetReleaseTag, () => getAppReleaseTag());
  ipcMain.handle(IPC_CHANNELS.appGetUpdateAvailability, () => getWorkbenchUpdateAvailability());
  ipcMain.handle(IPC_CHANNELS.appOpenExternalUrl, async (_, url: unknown) => {
    if (typeof url !== "string" || !isAllowedAppOpenExternalUrl(url)) return;
    await shell.openExternal(url);
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

  ipcMain.handle(IPC_CHANNELS.previewOpenUrlExternally, async (_, url: unknown) => {
    if (typeof url !== "string" || !isSafePreviewOpenExternalUrl(url)) return;
    await shell.openExternal(url);
  });

  ipcMain.handle(IPC_CHANNELS.previewNativeSetBounds, (event, bounds: unknown) => {
    previewNativeSetBounds(event, bounds);
  });
  ipcMain.handle(IPC_CHANNELS.previewNativeDetach, (event) => {
    previewNativeDetach(event);
  });
  ipcMain.handle(IPC_CHANNELS.previewNativeLoadUrl, (event, url: unknown) => previewNativeLoadUrl(event, url));
  ipcMain.handle(IPC_CHANNELS.previewNativeReload, (event) => previewNativeReload(event));
  ipcMain.handle(IPC_CHANNELS.previewNativeToggleDevTools, (event) => previewNativeToggleEmbeddedDevTools(event));
  ipcMain.handle(IPC_CHANNELS.previewNativeGoBack, (event) => previewNativeGoBack(event));
  ipcMain.handle(IPC_CHANNELS.previewNativeGoForward, (event) => previewNativeGoForward(event));
}

const dataDir = app.getPath("userData");
const schemaSql = readWorkspaceSchemaSql();
const store = new WorkspaceStore(dataDir);
store.migrate(schemaSql);
const gitAdapter = createGitAdapter();
const workspaceService = new WorkspaceService(store, gitAdapter);

// Use home directory to avoid spaces in paths like "Application Support" on macOS
const hookScriptsDir = path.join(os.homedir(), ".workbench", "hooks");
void hookServer.start().then(() => {
  hookServer.setHandler((event, threadId) => {
    handleHookEvent(event, threadId, {
      workspaceService,
      onChanged: emitWorkspaceDidChange,
      onNotification: (kind, tid) => {
        const snapshot = workspaceService.getSnapshot();
        const thread = snapshot.threads.find((t) => t.id === tid);
        if (!thread) return;
        const project = snapshot.projects.find((p) => p.id === thread.projectId);
        notificationService.trigger(kind, project?.name ?? "", thread.title, () => {
          // Bring app to front and navigate to the thread
          const win = BrowserWindow.getAllWindows()[0];
          if (win) { win.show(); win.focus(); }
          workspaceService.setActive(thread.projectId, thread.worktreeId, thread.id);
          emitWorkspaceDidChange();
        });
      },
      onRunStateChanged: (state, tid) => {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send(IPC_CHANNELS.threadRunStateChanged, { threadId: tid, state });
        }
      },
    });
  });
  registerAllAgentHooks(hookScriptsDir);
}).catch((err) => console.warn("[instrument] HookServer start failed:", err));

gitHeadWatcher = new GitHeadWatcher({
  diffService,
  workspaceService,
  onWorkingTreeChanged: emitWorkingTreeFilesDidChange,
  onWorkspaceMetadataChanged: emitWorkspaceDidChange
});
ptyService.setSubmittedInputListener((sessionId, input) => {
  if (workspaceService.maybeRenameThreadFromPrompt(sessionId, input)) {
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
      allowQuitAfterResumeCapture = true;
      resumeCaptureOnQuitInFlight = false;
      ptyService.killNonThreadSessions();
      app.quit();
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
