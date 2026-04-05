"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC_CHANNELS = void 0;
exports.IPC_CHANNELS = {
    workspaceGetSnapshot: "workspace:getSnapshot",
    workspaceAddProject: "workspace:addProject",
    workspaceAddWorktree: "workspace:addWorktree",
    workspaceSetActive: "workspace:setActive",
    workspaceCreateThread: "workspace:createThread",
    workspaceSetActiveThread: "workspace:setActiveThread",
    workspaceDeleteThread: "workspace:deleteThread",
    workspaceRenameThread: "workspace:renameThread",
    runStart: "run:start",
    runSendInput: "run:sendInput",
    runInterrupt: "run:interrupt",
    diffChangedFiles: "diff:changedFiles",
    diffFileDiff: "diff:fileDiff",
    diffWorkingTree: "diff:workingTree",
    diffStageAll: "diff:stageAll",
    diffDiscardAll: "diff:discardAll",
    editApplyPatch: "edit:applyPatch",
    previewSetUrl: "preview:setUrl",
    previewProbeUrl: "preview:probeUrl",
    terminalPtyCreate: "terminal:ptyCreate",
    terminalPtyWrite: "terminal:ptyWrite",
    terminalPtyResize: "terminal:ptyResize",
    terminalPtyKill: "terminal:ptyKill",
    terminalPtyListSessions: "terminal:ptyListSessions",
    terminalPtyData: "terminal:ptyData",
    dialogPickRepoDirectory: "dialog:pickRepoDirectory"
};
