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
  startRun: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.runStart, payload),
  sendRunInput: (runId: string, input: string) => ipcRenderer.invoke(IPC_CHANNELS.runSendInput, { runId, input }),
  interruptRun: (runId: string) => ipcRenderer.invoke(IPC_CHANNELS.runInterrupt, runId),
  changedFiles: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffChangedFiles, cwd),
  fileDiff: (cwd: string, file: string) => ipcRenderer.invoke(IPC_CHANNELS.diffFileDiff, { cwd, file }),
  workingTreeDiff: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffWorkingTree, cwd),
  stageAll: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffStageAll, cwd),
  discardAll: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.diffDiscardAll, cwd),
  applyPatch: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.editApplyPatch, payload),
  ptyCreate: (worktreeId: string, cwd: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.terminalPtyCreate, { worktreeId, cwd }),
  ptyWrite: (worktreeId: string, data: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.terminalPtyWrite, { worktreeId, data }),
  ptyResize: (worktreeId: string, cols: number, rows: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.terminalPtyResize, { worktreeId, cols, rows }),
  ptyKill: (worktreeId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.terminalPtyKill, { worktreeId }),
  ptyListSessions: () => ipcRenderer.invoke(IPC_CHANNELS.terminalPtyListSessions) as Promise<string[]>,
  onPtyData: (callback: (worktreeId: string, data: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { worktreeId: string; data: string }) => {
      callback(payload.worktreeId, payload.data);
    };
    ipcRenderer.on(IPC_CHANNELS.terminalPtyData, handler);
    return () => ipcRenderer.off(IPC_CHANNELS.terminalPtyData, handler);
  },
  pickRepoDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.dialogPickRepoDirectory),
  resolveRepoRootFromWebkitFile: (file: File) => resolveRepoRootFromWebkitFile(file)
});
