import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AppUpdateAvailability } from "../src/shared/ipc.js";

/**
 * Sandboxed preload may only `require("electron")`, not sibling modules — keep these strings in sync
 * with `electron/ipcChannels.ts` (see `electron/__tests__/preloadIpcChannelsParity.test.ts`).
 */
const IPC_CHANNELS = {
  workspaceGetSnapshot: "workspace:getSnapshot",
  workspaceAddProject: "workspace:addProject",
  workspaceRemoveProject: "workspace:removeProject",
  workspaceReorderProjects: "workspace:reorderProjects",
  workspaceAddWorktree: "workspace:addWorktree",
  workspaceSetActive: "workspace:setActive",
  workspaceCreateThread: "workspace:createThread",
  workspaceSetActiveThread: "workspace:setActiveThread",
  workspaceDeleteThread: "workspace:deleteThread",
  workspaceRenameThread: "workspace:renameThread",
  workspaceDidChange: "workspace:didChange",
  workingTreeFilesDidChange: "diff:workingTreeFilesDidChange",
  runStart: "run:start",
  runSendInput: "run:sendInput",
  runInterrupt: "run:interrupt",
  diffChangedFiles: "diff:changedFiles",
  diffRepoStatus: "diff:repoStatus",
  diffFileDiff: "diff:fileDiff",
  diffFileMergeSides: "diff:fileMergeSides",
  diffWorkingTree: "diff:workingTree",
  diffStageAll: "diff:stageAll",
  diffUnstageAll: "diff:unstageAll",
  diffDiscardAll: "diff:discardAll",
  diffStagePaths: "diff:stagePaths",
  diffUnstagePaths: "diff:unstagePaths",
  diffDiscardPaths: "diff:discardPaths",
  diffGitFetch: "diff:gitFetch",
  diffGitPush: "diff:gitPush",
  diffGitCommit: "diff:gitCommit",
  diffGitCheckoutBranch: "diff:gitCheckoutBranch",
  diffIsGitRepository: "diff:isGitRepository",
  diffInitGitRepository: "diff:initGitRepository",
  filesList: "files:list",
  filesSearch: "files:search",
  filesSearchContent: "files:searchContent",
  filesRead: "files:read",
  filesResolveMarkdownImageUrl: "files:resolveMarkdownImageUrl",
  filesReadImageDataUrlFromAbsolutePath: "files:readImageDataUrlFromAbsolutePath",
  filesWrite: "files:write",
  filesCreate: "files:create",
  filesDelete: "files:delete",
  filesCreateFolder: "files:createFolder",
  filesDeleteFolder: "files:deleteFolder",
  editApplyPatch: "edit:applyPatch",
  previewSetUrl: "preview:setUrl",
  previewProbeUrl: "preview:probeUrl",
  terminalPtyCreate: "terminal:ptyCreate",
  terminalPtyWrite: "terminal:ptyWrite",
  terminalPtyResize: "terminal:ptyResize",
  terminalPtyKill: "terminal:ptyKill",
  terminalPtyListSessions: "terminal:ptyListSessions",
  terminalPtyGetBuffer: "terminal:ptyGetBuffer",
  terminalPtyData: "terminal:ptyData",
  dialogPickRepoDirectory: "dialog:pickRepoDirectory",
  workspaceCreateWorktreeGroup: "workspace:createWorktreeGroup",
  workspaceDeleteWorktreeGroup: "workspace:deleteWorktreeGroup",
  workspaceListBranches: "workspace:listBranches",
  workspaceWorktreeHealth: "workspace:worktreeHealth",
  workspaceSyncWorktrees: "workspace:syncWorktrees",
  uiOpenWorkspaceSettings: "ui:openWorkspaceSettings",
  appGetVersion: "app:getVersion",
  appGetReleaseTag: "app:getReleaseTag",
  appGetUpdateAvailability: "app:getUpdateAvailability",
  appOpenExternalUrl: "app:openExternalUrl"
} as const;

/** Absolute repo root from the first file in a webkitdirectory pick (Electron only). */
function resolveRepoRootFromWebkitFile(file: File): string {
  const absolute = webUtils.getPathForFile(file);
  const relative = file.webkitRelativePath;

  if (!relative) {
    // No relative path: strip filename — find last separator
    const lastSlash = Math.max(absolute.lastIndexOf("/"), absolute.lastIndexOf("\\"));
    return lastSlash >= 0 ? absolute.slice(0, lastSlash) : absolute;
  }

  // Normalise both to forward slashes for comparison
  const absForward = absolute.replace(/\\/g, "/");
  const relForward = relative.replace(/\\/g, "/");

  if (absForward.endsWith(relForward)) {
    const rootForward = absForward
      .slice(0, absForward.length - relForward.length)
      .replace(/\/+$/, "");
    // Restore original OS separator style
    return absolute.includes("\\") ? rootForward.replace(/\//g, "\\") : rootForward;
  }

  // Fallback: strip filename
  const lastSlash = Math.max(absolute.lastIndexOf("/"), absolute.lastIndexOf("\\"));
  return lastSlash >= 0 ? absolute.slice(0, lastSlash) : absolute;
}

contextBridge.exposeInMainWorld("workspaceApi", {
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceGetSnapshot),
  addProject: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceAddProject, payload),
  removeProject: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceRemoveProject, payload),
  reorderProjects: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceReorderProjects, payload),
  addWorktree: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceAddWorktree, payload),
  setActive: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceSetActive, payload),
  createThread: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceCreateThread, payload),
  setActiveThread: (threadId: string) => ipcRenderer.invoke(IPC_CHANNELS.workspaceSetActiveThread, threadId),
  deleteThread: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceDeleteThread, payload),
  renameThread: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceRenameThread, payload),
  createWorktreeGroup: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceCreateWorktreeGroup, payload),
  deleteWorktreeGroup: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceDeleteWorktreeGroup, payload),
  listBranches: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.workspaceListBranches, { projectId }),
  worktreeHealth: (worktreeId: string) => ipcRenderer.invoke(IPC_CHANNELS.workspaceWorktreeHealth, { worktreeId }),
  syncWorktrees: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.workspaceSyncWorktrees, { projectId }),
  startRun: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.runStart, payload),
  sendRunInput: (runId: string, input: string) => ipcRenderer.invoke(IPC_CHANNELS.runSendInput, { runId, input }),
  interruptRun: (runId: string) => ipcRenderer.invoke(IPC_CHANNELS.runInterrupt, runId),
  changedFiles: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffChangedFiles, cwd),
  isGitRepository: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffIsGitRepository, cwd) as Promise<boolean>,
  initGitRepository: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffInitGitRepository, cwd) as Promise<void>,
  repoStatus: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffRepoStatus, cwd),
  fileDiff: (cwd: string, file: string, scope?: "staged" | "unstaged" | "combined") =>
    ipcRenderer.invoke(IPC_CHANNELS.diffFileDiff, { cwd, file, scope }),
  fileMergeSides: (cwd: string, file: string, scope: "staged" | "unstaged") =>
    ipcRenderer.invoke(IPC_CHANNELS.diffFileMergeSides, { cwd, file, scope }),
  workingTreeDiff: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffWorkingTree, cwd),
  stageAll: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffStageAll, cwd),
  unstageAll: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffUnstageAll, cwd),
  discardAll: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffDiscardAll, cwd),
  stagePaths: (cwd: string, paths: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.diffStagePaths, { cwd, paths }),
  unstagePaths: (cwd: string, paths: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.diffUnstagePaths, { cwd, paths }),
  discardPaths: (cwd: string, paths: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.diffDiscardPaths, { cwd, paths }),
  gitFetch: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffGitFetch, cwd),
  gitPush: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffGitPush, cwd),
  commitStaged: (cwd: string, message: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.diffGitCommit, { cwd, message }),
  gitCheckoutBranch: (cwd: string, branch: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.diffGitCheckoutBranch, { cwd, branch }),
  listFiles: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.filesList, cwd),
  searchFiles: (cwd: string, query: string) => ipcRenderer.invoke(IPC_CHANNELS.filesSearch, { cwd, query }),
  searchFileContents: (cwd: string, query: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.filesSearchContent, { cwd, query }),
  readFile: (cwd: string, relativePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.filesRead, { cwd, relativePath }),
  resolveMarkdownImageUrl: (cwd: string, markdownRelativePath: string, href: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.filesResolveMarkdownImageUrl, {
      cwd,
      relativePath: markdownRelativePath,
      href
    }) as Promise<string | null>,
  readImageDataUrlFromAbsolutePath: (absolutePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.filesReadImageDataUrlFromAbsolutePath, {
      absolutePath
    }) as Promise<string | null>,
  writeFile: (cwd: string, relativePath: string, content: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.filesWrite, { cwd, relativePath, content }),
  createFile: (cwd: string, relativePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.filesCreate, { cwd, relativePath }),
  deleteFile: (cwd: string, relativePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.filesDelete, { cwd, relativePath }),
  createFolder: (cwd: string, relativePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.filesCreateFolder, { cwd, relativePath }),
  deleteFolder: (cwd: string, relativePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.filesDeleteFolder, { cwd, relativePath }),
  applyPatch: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.editApplyPatch, payload),
  ptyCreate: (sessionId: string, cwd: string, worktreeId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.terminalPtyCreate, { sessionId, cwd, worktreeId }),
  ptyWrite: (sessionId: string, data: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.terminalPtyWrite, { sessionId, data }),
  ptyResize: (sessionId: string, cols: number, rows: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.terminalPtyResize, { sessionId, cols, rows }),
  ptyKill: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.terminalPtyKill, { sessionId }),
  ptyListSessions: () => ipcRenderer.invoke(IPC_CHANNELS.terminalPtyListSessions) as Promise<string[]>,
  ptyGetBuffer: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.terminalPtyGetBuffer, { sessionId }) as Promise<{ buffer: string }>,
  onPtyData: (callback: (sessionId: string, data: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { sessionId: string; data: string }) => {
      callback(payload.sessionId, payload.data);
    };
    ipcRenderer.on(IPC_CHANNELS.terminalPtyData, handler);
    return () => ipcRenderer.off(IPC_CHANNELS.terminalPtyData, handler);
  },
  onWorkspaceChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.workspaceDidChange, handler);
    return () => ipcRenderer.off(IPC_CHANNELS.workspaceDidChange, handler);
  },
  onWorkingTreeFilesChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.workingTreeFilesDidChange, handler);
    return () => ipcRenderer.off(IPC_CHANNELS.workingTreeFilesDidChange, handler);
  },
  onOpenWorkspaceSettings: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.uiOpenWorkspaceSettings, handler);
    return () => ipcRenderer.off(IPC_CHANNELS.uiOpenWorkspaceSettings, handler);
  },
  pickRepoDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.dialogPickRepoDirectory),
  resolveRepoRootFromWebkitFile: (file: File) => resolveRepoRootFromWebkitFile(file),
  /** Absolute path for a file from a drag-and-drop `DataTransfer` (Electron). */
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.appGetVersion) as Promise<string>,
  getAppReleaseTag: () => ipcRenderer.invoke(IPC_CHANNELS.appGetReleaseTag) as Promise<string>,
  getAppUpdateAvailability: () =>
    ipcRenderer.invoke(IPC_CHANNELS.appGetUpdateAvailability) as Promise<AppUpdateAvailability | null>,
  openAppExternalUrl: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.appOpenExternalUrl, url)
});
