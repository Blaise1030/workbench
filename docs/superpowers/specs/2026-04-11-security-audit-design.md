# Security Audit — Workbench Desktop App

**Date:** 2026-04-11  
**Auditor:** Claude (automated static analysis + manual review)  
**Scope:** `apps/desktop/` — Electron main process, IPC handlers, services, adapters  
**Total findings:** 2 critical · 3 high · 3 medium · 5 low/informational

---

## Summary

Workbench is an Electron desktop application that runs AI coding agents (Claude, Gemini, Codex, Cursor) inside integrated PTY terminals, manages git worktrees, and provides a file editor. The attack surface is primarily the IPC boundary between the renderer and the privileged main process.

The most critical finding is a **path traversal in `EditService.applyPatch`** — the only file-write service that skips the `assertPathWithinRoot` guard present in all other file operations. Combined with `sandbox: false`, a compromised renderer could overwrite arbitrary files on the host.

---

## Findings

---

### CRITICAL-1 — Path Traversal in `EditService.applyPatch`

**File:** `apps/desktop/electron/services/editService.ts:12–13`  
**Severity:** Critical

**Description:**  
`EditService.applyPatch` resolves the target path with `path.resolve(input.cwd, input.relativeFilePath)` but applies **no containment check**. Every other file operation in `FileService` goes through `assertPathWithinRoot`, which verifies the resolved path does not escape `cwd` via `..` segments or absolute overrides. `EditService` has no equivalent guard.

```ts
// editService.ts — NO path guard
async applyPatch(input: QuickPatchInput): Promise<void> {
  const target = path.resolve(input.cwd, input.relativeFilePath); // ← unguarded
  await fs.writeFile(target, input.content, "utf8");
}
```

**Attack scenario:**  
A compromised renderer (or any future XSS) calls `window.workspaceApi.applyPatch({ cwd: "/home/user/project", relativeFilePath: "../../../../.ssh/authorized_keys", content: "<attacker-key>" })`. This writes an SSH key to the user's `authorized_keys` file, granting remote login.

**Recommended fix:**  
Apply the same `assertPathWithinRoot` guard used in `FileService`:

```ts
async applyPatch(input: QuickPatchInput): Promise<void> {
  const target = assertPathWithinRoot(input.cwd, input.relativeFilePath);
  await fs.writeFile(target, input.content, "utf8");
}
```

Import `assertPathWithinRoot` from `fileService.ts` or extract it to a shared utility.

---

### CRITICAL-2 — Axios: Unrestricted Cloud Metadata Exfiltration (CVE, dependency)

**Package:** `axios <1.15.0`  
**Severity:** Critical (pnpm audit)

**Description:**  
The installed version of axios (used in the landing page app) is vulnerable to header injection that allows an attacker to exfiltrate cloud instance metadata (AWS IMDSv1, GCP, Azure). If a server-side axios call follows a redirect to `169.254.169.254`, it will include auth headers from the original request.

**Attack scenario:**  
Relevant primarily if axios is used server-side (e.g., in a CI pipeline or SSR context). In a browser-only context, the browser blocks `169.254.x.x` requests. Confirm usage context.

**Recommended fix:**  
Upgrade axios to `>=1.15.0`.

```
pnpm update axios --filter apps-landing-page
```

---

### HIGH-1 — `sandbox: false` with Broad Preload API Surface

**File:** `apps/desktop/electron/mainApp.ts:191–193`  
**Severity:** High

**Description:**  
The `BrowserWindow` is created with `sandbox: false`. While `contextIsolation: true` and `nodeIntegration: false` are correctly set, disabling the sandbox allows the **preload script** to use Node.js built-ins (`path`, `fs` indirectly via IPC, `node:crypto`). If the renderer is ever compromised (e.g., via a future XSS in markdown rendering or a malicious repo file), the preload's 40+ exposed `workspaceApi` methods become directly callable, including destructive ones like `deleteFolder`, `ptyCreate`, `discardAll`, and `applyPatch`.

```ts
webPreferences: {
  preload: preloadPath,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false            // ← allows preload Node.js access
}
```

**Recommended fix:**  
Enable `sandbox: true`. This requires the preload to communicate with the main process via IPC only — which it already does. Verify that the `path` import in `preload.ts` (used only for `resolveRepoRootFromWebkitFile`) can be replaced with pure string operations, then flip the flag:

```ts
webPreferences: {
  preload: preloadPath,
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true             // ← removes Node.js from preload scope
}
```

---

### HIGH-2 — Electron: Renderer Command-Line Switch Injection (CVE, dependency)

**Package:** `electron` (current version)  
**Severity:** High (pnpm audit)

**Description:**  
The installed Electron version is flagged for a vulnerability where a compromised renderer can inject command-line switches via the undocumented `commandLineSwitches` webPreference. This can be used to re-enable disabled features or bypass security policies.

**Recommended fix:**  
Upgrade to the latest stable Electron release. Check the [Electron releases page](https://github.com/electron/electron/releases) for the patched version and update `apps/desktop/package.json`.

---

### HIGH-3 — CLI Flag Injection via Agent Prompt (`ClaudeCodeCliAdapter`, `GeminiCliAdapter`)

**Files:**  
- `apps/desktop/electron/adapters/claudeCodeCliAdapter.ts:7`  
- `apps/desktop/electron/adapters/geminiCliAdapter.ts:12`  
**Severity:** High

**Description:**  
Agent prompts from the renderer are passed directly as positional CLI arguments without sanitization. If a user crafts a prompt beginning with `--`, it will be interpreted as a CLI flag by the agent binary rather than as a prompt string.

```ts
// claudeCodeCliAdapter.ts
args: ["--cwd", input.cwd, input.prompt]  // if prompt = "--dangerously-skip-permissions ..." → flag injection
```

```ts
// geminiCliAdapter.ts
args: [input.prompt]  // same issue
```

Additionally, `input.cwd` in `ClaudeCodeCliAdapter` is user-supplied; passing an unexpected `cwd` path to the agent binary may cause it to operate on unintended directories.

**Attack scenario:**  
A user submits a prompt of `--dangerously-skip-permissions do X`. Claude CLI receives this as a flag, bypassing its own permission prompts.

**Recommended fix:**  
Use `--` end-of-options separator before the prompt argument, and validate `cwd` is within a registered project:

```ts
// claudeCodeCliAdapter.ts
args: ["--cwd", input.cwd, "--", input.prompt]

// geminiCliAdapter.ts
args: ["--", input.prompt]
```

---

### MEDIUM-1 — No `cwd` Validation Across IPC Handlers

**File:** `apps/desktop/electron/mainApp.ts` (all `ipcMain.handle` registrations)  
**Severity:** Medium

**Description:**  
Every IPC handler that performs file or git operations accepts a `cwd` string from the renderer with no check that it corresponds to a registered project or worktree path. TypeScript types are erased at runtime — the main process trusts the renderer's payload completely.

Examples:
- `diffChangedFiles(cwd)` → runs `git status` in any arbitrary directory
- `filesSearch({ cwd, query })` → searches any directory on disk
- `filesRead({ cwd, relativePath })` → reads any file within any `cwd` (containment only within `cwd`)
- `terminalPtyCreate({ sessionId, cwd })` → spawns a shell in any directory

**Attack scenario:**  
Renderer sends `{ cwd: "/etc" }` to `filesSearch` → main process searches `/etc` and returns results. Combined with CRITICAL-1, `cwd: "/"` enables full-disk access.

**Recommended fix:**  
In `registerIpc`, validate that `cwd` is either a path that exists in `workspaceService.getSnapshot().worktrees` or a sub-path thereof before delegating to services:

```ts
function assertCwdIsRegistered(cwd: string, snapshot: WorkspaceSnapshot): void {
  const registered = snapshot.worktrees.some(wt => 
    cwd === wt.path || cwd.startsWith(wt.path + path.sep)
  );
  if (!registered) throw new Error(`Unregistered cwd: ${cwd}`);
}
```

---

### MEDIUM-2 — Git Flag Injection via Branch/Worktree Names (`gitAdapter.ts`)

**File:** `apps/desktop/electron/services/gitAdapter.ts:10,12`  
**Severity:** Medium

**Description:**  
`worktreeAdd` passes user-supplied `branch`, `worktreePath`, and `baseBranch` directly to `git.raw()` without a `--` end-of-options separator. A branch name starting with `-` is treated as a git flag.

```ts
// No -- before branch/path args
await git.raw(["worktree", "add", "-b", branch, worktreePath, baseBranch]);
await git.raw(["worktree", "add", worktreePath, branch]);
```

**Attack scenario:**  
User creates a worktree with branch name `--detach`, changing the git command's behaviour silently.

**Recommended fix:**  
Insert `--` before user-controlled positional arguments:

```ts
await git.raw(["worktree", "add", "-b", "--", branch, worktreePath, baseBranch]);
await git.raw(["worktree", "add", "--", worktreePath, branch]);
```

Also validate that branch names match `/^[a-zA-Z0-9._\-\/]+$/` before accepting them.

---

### MEDIUM-3 — `worktreeRemove` Path Derivation via String Manipulation

**File:** `apps/desktop/electron/services/gitAdapter.ts:17`  
**Severity:** Medium

**Description:**  
The parent path for `worktreeRemove` is derived by stripping the last segment with a regex instead of using `path.dirname`:

```ts
const parent = worktreePath.replace(/\/[^/]+\/?$/, "");
```

This is fragile: a trailing slash or unusual path produces an incorrect parent, potentially running `git worktree remove` in the wrong repository. On edge cases (e.g., `worktreePath = "/"`), this could silently pass an empty string as the git working directory.

**Recommended fix:**

```ts
const parent = path.dirname(path.resolve(worktreePath));
const git = simpleGit(parent);
```

---

### LOW-1 — Dependency Vulnerabilities (10 moderate, 4 low)

**Severity:** Low–Moderate

`pnpm audit` reports 21 total vulnerabilities: 2 critical and 5 high are covered above. The remaining 14 (10 moderate, 4 low) are in transitive dependencies, primarily affecting packages used in the landing page or dev tooling. Run `pnpm audit --fix` for auto-upgradeable packages, then manually review the remainder.

```
pnpm audit 2>&1 | grep -E 'Package|Severity|Vulnerable versions'
```

---

### LOW-2 — `diffService.gitShowBuffer` RevSpec Includes User-Supplied Filename

**File:** `apps/desktop/electron/services/diffService.ts`  
**Severity:** Low

**Description:**  
`gitShowBuffer` constructs a git revspec by interpolating a user-supplied filename: `` `HEAD:${file}` `` and `` `:${file}` ``. Because `git show` operates entirely within the object database, it cannot read files outside the repository. Risk is low but the filename should be validated to contain no `:` characters, which have special meaning in revspecs.

**Recommended fix:**

```ts
if (file.includes(":")) throw new Error(`Invalid file path: ${file}`);
```

---

### LOW-3 — `process.env` Forwarded Wholesale to PTY Sessions

**File:** `apps/desktop/electron/services/ptyService.ts:41`  
**Severity:** Low / Informational

**Description:**  
PTY sessions are spawned with `env: process.env as Record<string, string>`, passing the full Electron process environment to every shell session. This includes any secrets injected into the Electron process at startup (e.g., via a `.env` file or shell profile). This is intentional behaviour for a developer tool but worth documenting: users should not store secrets in their shell environment if they don't want those secrets accessible to the PTY child processes.

**No code change required.** Consider adding a note in the README.

---

### LOW-4 — `shell.openExternal` Allowlist Limited to `github.com`

**File:** `apps/desktop/electron/mainApp.ts:121–128`  
**Severity:** Informational (well-handled)

The `isAllowedAppOpenExternalUrl` function correctly validates that the URL uses `https:` and is on `github.com` before calling `shell.openExternal`. This is a good implementation. No change needed.

---

### LOW-5 — IPC Payload Runtime Type Validation Absent

**File:** `apps/desktop/electron/mainApp.ts` (all handlers)  
**Severity:** Low

**Description:**  
IPC handler signatures use TypeScript types (e.g., `payload: AddProjectInput`), but TypeScript types are erased at runtime. The main process performs no runtime validation of shape, type, or bounds on incoming IPC payloads. A crafted payload with unexpected types (e.g., `null` for a `string` field) could cause unhandled exceptions or unexpected behaviour in services.

**Recommended fix:**  
Add lightweight runtime validation (e.g., using `zod`) at the IPC boundary for at minimum the destructive handlers (`applyPatch`, `deleteFile`, `deleteFolder`, `discardAll`, `discardPaths`).

---

## Prioritised Fix Order

| Priority | ID | Finding | Effort |
|----------|----|---------|--------|
| 1 | CRITICAL-1 | Path traversal in `EditService.applyPatch` | Small (1 line + import) |
| 2 | CRITICAL-2 | Upgrade `axios` | Small (version bump) |
| 3 | HIGH-3 | CLI flag injection via `--` separator | Small (2 lines per adapter) |
| 4 | HIGH-2 | Upgrade `electron` | Medium (test after upgrade) |
| 5 | HIGH-1 | Enable `sandbox: true` | Medium (preload path refactor) |
| 6 | MEDIUM-1 | Validate `cwd` in IPC handlers | Medium (shared guard function) |
| 7 | MEDIUM-2 | Git flag injection via `--` in `worktreeAdd` | Small |
| 8 | MEDIUM-3 | `worktreeRemove` path derivation | Small |
| 9 | LOW-2 | RevSpec `:` validation | Trivial |
| 10 | LOW-5 | Runtime IPC payload validation | Large (zod schema per channel) |
