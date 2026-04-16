/** Canonical IPC channel names for main/renderer. Sandboxed preload inlines the same strings (see `preload.ts`). */

export const IPC_CHANNELS = {
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
  workspaceUpdateThread: "workspace:updateThread",
  workspaceDidChange: "workspace:didChange",
  /** Repo working tree may have changed (save, patch, etc.); refresh diff / git state in renderer. */
  workingTreeFilesDidChange: "diff:workingTreeFilesDidChange",
  runStart: "run:start",
  runSendInput: "run:sendInput",
  runInterrupt: "run:interrupt",
  diffChangedFiles: "diff:changedFiles",
  diffRepoStatus: "diff:repoStatus",
  diffFileDiff: "diff:fileDiff",
  diffFileMergeSides: "diff:fileMergeSides",
  diffWorkingTree: "diff:workingTree",
  diffStagedUnified: "diff:stagedUnified",
  diffStageAll: "diff:stageAll",
  diffUnstageAll: "diff:unstageAll",
  diffDiscardAll: "diff:discardAll",
  diffStagePaths: "diff:stagePaths",
  diffUnstagePaths: "diff:unstagePaths",
  diffDiscardPaths: "diff:discardPaths",
  diffGitFetch: "diff:gitFetch",
  diffGitPush: "diff:gitPush",
  diffGitCommit: "diff:gitCommit",
  /** Checkout an existing local branch in the given worktree directory. */
  diffGitCheckoutBranch: "diff:gitCheckoutBranch",
  diffIsGitRepository: "diff:isGitRepository",
  diffInitGitRepository: "diff:initGitRepository",
  filesList: "files:list",
  filesSearch: "files:search",
  filesSearchContent: "files:searchContent",
  filesRead: "files:read",
  /** Resolve `![](href)` in a Markdown file to a loadable URL (`data:` for workspace images, pass-through for http(s)). */
  filesResolveMarkdownImageUrl: "files:resolveMarkdownImageUrl",
  /** Read an image outside the worktree (e.g. temp screencapture) as `data:` — restricted to temp + user media folders. */
  filesReadImageDataUrlFromAbsolutePath: "files:readImageDataUrlFromAbsolutePath",
  filesWrite: "files:write",
  filesCreate: "files:create",
  filesDelete: "files:delete",
  filesCreateFolder: "files:createFolder",
  filesDeleteFolder: "files:deleteFolder",
  editApplyPatch: "edit:applyPatch",
  /** Main process: probe a URL (no CORS) for HTTP status after iframe navigation. */
  previewProbeUrl: "preview:probeUrl",
  /** Open http(s) preview URL in the system browser (e.g. full DevTools). */
  previewOpenUrlExternally: "preview:openUrlExternally",
  /** Position the preview `BrowserView` over the renderer viewport (DIP, content-area coords). */
  previewNativeSetBounds: "preview:nativeSetBounds",
  /** Load http(s) URL in the preview `BrowserView`; resolves when the main frame finishes or fails. */
  previewNativeLoadUrl: "preview:nativeLoadUrl",
  /** Reload the preview `BrowserView`. */
  previewNativeReload: "preview:nativeReload",
  /** Remove the preview `BrowserView` from the window (e.g. tab hidden or panel unmounted). */
  previewNativeDetach: "preview:nativeDetach",
  /** Toggle embedded Chrome DevTools for the preview (device toolbar / responsive). */
  previewNativeToggleDevTools: "preview:nativeToggleDevTools",
  /** Main → renderer: embedded preview DevTools visibility (e.g. user closed DevTools from Chrome UI). */
  previewEmbeddedDevtoolsState: "preview:embeddedDevtoolsState",  
  /** Navigate the preview `BrowserView` forward one step in history. */  
  previewNavigationUrl: "preview:navigationUrl",
  /** Navigate the preview BrowserView back one step in history. */
  previewNativeGoBack: "preview:nativeGoBack",
  /** Navigate the preview BrowserView forward one step in history. */
  previewNativeGoForward: "preview:nativeGoForward",
  /** Main → renderer: current URL + back/forward availability after any navigation. */
  previewNavigationStateChanged: "preview:navigationStateChanged",
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
  /** Absolute skill-directory roots from renderer (Settings → Agents); used to allow `files:search` outside worktrees. */
  workspaceSetAgentSkillSearchRoots: "workspace:setAgentSkillSearchRoots",
  /** macOS often captures ⌘, for the app menu; main sends this so the renderer can open settings. */
  uiOpenWorkspaceSettings: "ui:openWorkspaceSettings",
  /** Running app semver from Electron `app.getVersion()`. */
  appGetVersion: "app:getVersion",
  /** Absolute user home directory (`os.homedir()`), for expanding `~/` paths when the worktree path does not imply a home prefix. */
  appGetUserHomeDir: "app:getUserHomeDir",
  /** GitHub-style release tag for this build (from bundled `package.json` semver when available). */
  appGetReleaseTag: "app:getReleaseTag",
  /** Packaged app only: GitHub latest release vs bundled app semver (same source as release tag). */
  appGetUpdateAvailability: "app:getUpdateAvailability",
  /** Open a validated https URL in the system browser (GitHub only). */
  appOpenExternalUrl: "app:openExternalUrl",
  /** Main → renderer: hook-derived run state for a thread (replaces PTY heuristics). */
  threadRunStateChanged: "thread:runStateChanged"
} as const;
