import path from "node:path";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import { IPC_CHANNELS } from "../src/shared/ipc.js";

/** Absolute repo root from the first file in a webkitdirectory pick (Electron only). */
function resolveRepoRootFromWebkitFile(file: File): string {
  const absolute = webUtils.getPathForFile(file);
  const relative = file.webkitRelativePath;
  if (!relative) {
    return path.dirname(absolute);
  }
  const absForward = absolute.replace(/\\/g, "/");
  const relForward = relative.replace(/\\/g, "/");
  if (absForward.endsWith(relForward)) {
    const rootForward = absForward.slice(0, absForward.length - relForward.length).replace(/\/+$/, "");
    return path.normalize(rootForward.replace(/\//g, path.sep));
  }
  return path.dirname(absolute);
}

contextBridge.exposeInMainWorld("workspaceApi", {
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceGetSnapshot),
  addProject: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceAddProject, payload),
  addWorktree: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceAddWorktree, payload),
  setActive: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceSetActive, payload),
  createThread: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceCreateThread, payload),
  setActiveThread: (threadId: string) => ipcRenderer.invoke(IPC_CHANNELS.workspaceSetActiveThread, threadId),
  deleteThread: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceDeleteThread, payload),
  renameThread: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceRenameThread, payload),
  reorderThreads: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.workspaceReorderThreads, payload),
  startRun: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.runStart, payload),
  sendRunInput: (runId: string, input: string) => ipcRenderer.invoke(IPC_CHANNELS.runSendInput, { runId, input }),
  interruptRun: (runId: string) => ipcRenderer.invoke(IPC_CHANNELS.runInterrupt, runId),
  changedFiles: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffChangedFiles, cwd),
  fileDiff: (cwd: string, file: string) => ipcRenderer.invoke(IPC_CHANNELS.diffFileDiff, { cwd, file }),
  workingTreeDiff: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffWorkingTree, cwd),
  stageAll: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffStageAll, cwd),
  discardAll: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffDiscardAll, cwd),
  listFiles: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.filesList, cwd),
  searchFiles: (cwd: string, query: string) => ipcRenderer.invoke(IPC_CHANNELS.filesSearch, { cwd, query }),
  readFile: (cwd: string, relativePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.filesRead, { cwd, relativePath }),
  writeFile: (cwd: string, relativePath: string, content: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.filesWrite, { cwd, relativePath, content }),
  createFile: (cwd: string, relativePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.filesCreate, { cwd, relativePath }),
  deleteFile: (cwd: string, relativePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.filesDelete, { cwd, relativePath }),
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
  pickRepoDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.dialogPickRepoDirectory),
  resolveRepoRootFromWebkitFile: (file: File) => resolveRepoRootFromWebkitFile(file),
  /** Absolute path for a file from a drag-and-drop `DataTransfer` (Electron). */
  getPathForFile: (file: File) => webUtils.getPathForFile(file)
});
