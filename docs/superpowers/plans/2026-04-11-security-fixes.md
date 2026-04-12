# Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all critical, high, and medium security fixes identified in the 2026-04-11 security audit, in priority order.

**Architecture:** Fixes are applied directly to the Electron main process services (`editService.ts`, `gitAdapter.ts`, `mainApp.ts`) and adapters (`claudeCodeCliAdapter.ts`, `geminiCliAdapter.ts`). One shared path-guard utility is extracted. The `sandbox: true` fix requires rewriting a Node.js-dependent function in `preload.ts` using pure string operations first.

**Tech Stack:** TypeScript, Electron 35, Node.js built-ins (`path`, `fs/promises`), `simple-git`, `node-pty`, `vitest` for tests.

---

## File Map

| File | Change |
|------|--------|
| `apps/desktop/electron/services/editService.ts` | Add `assertPathWithinRoot` guard to `applyPatch` |
| `apps/desktop/electron/services/fileService.ts` | Extract `assertPathWithinRoot` to shared utility (or re-export) |
| `apps/desktop/electron/utils/pathGuard.ts` | **Create** — shared `assertPathWithinRoot` utility |
| `apps/desktop/electron/services/gitAdapter.ts` | Fix `--` placement in `worktreeAdd`; fix `worktreeRemove` path derivation; add branch name validation |
| `apps/desktop/electron/adapters/claudeCodeCliAdapter.ts` | Add `--` before prompt arg |
| `apps/desktop/electron/adapters/geminiCliAdapter.ts` | Add `--` before prompt arg |
| `apps/desktop/electron/mainApp.ts` | Add `cwd` validation helper; apply to all relevant IPC handlers; flip `sandbox: false` → `true` |
| `apps/desktop/electron/preload.ts` | Rewrite `resolveRepoRootFromWebkitFile` without Node.js `path` import |
| `apps/desktop/electron/__tests__/pathGuard.test.ts` | **Create** — tests for `assertPathWithinRoot` |
| `apps/desktop/electron/__tests__/gitAdapter.test.ts` | **Create** — tests for branch name validation and `--` placement |
| `apps/desktop/package.json` | Bump `axios` version (landing page dep) |

---

## Task 1: Extract `assertPathWithinRoot` to a shared utility

`fileService.ts` already has a correct implementation. Extract it so `editService.ts` can use it without a circular import.

**Files:**
- Create: `apps/desktop/electron/utils/pathGuard.ts`
- Create: `apps/desktop/electron/__tests__/pathGuard.test.ts`
- Modify: `apps/desktop/electron/services/fileService.ts` (import from shared utility)

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/electron/__tests__/pathGuard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { assertPathWithinRoot } from "../utils/pathGuard.js";

describe("assertPathWithinRoot", () => {
  it("returns resolved path for a normal relative path", () => {
    const result = assertPathWithinRoot("/project", "src/index.ts");
    expect(result).toBe(path.resolve("/project", "src/index.ts"));
  });

  it("returns resolved path for a nested relative path", () => {
    const result = assertPathWithinRoot("/project", "a/b/c.ts");
    expect(result).toBe("/project/a/b/c.ts");
  });

  it("throws for a path that escapes root via ..", () => {
    expect(() => assertPathWithinRoot("/project", "../../etc/passwd")).toThrow(
      "Path escapes root"
    );
  });

  it("throws for an absolute path that is outside root", () => {
    expect(() => assertPathWithinRoot("/project", "/etc/passwd")).toThrow(
      "Path escapes root"
    );
  });

  it("allows a path that is the root itself (empty relative)", () => {
    const result = assertPathWithinRoot("/project", ".");
    expect(result).toBe("/project");
  });

  it("throws for a path using .. that looks relative but escapes", () => {
    expect(() => assertPathWithinRoot("/project", "src/../../etc/hosts")).toThrow(
      "Path escapes root"
    );
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm test 2>&1 | grep -A 3 "pathGuard"
```

Expected: `Cannot find module '../utils/pathGuard.js'`

- [ ] **Step 3: Create the shared utility**

Create `apps/desktop/electron/utils/pathGuard.ts`:

```ts
import path from "node:path";

/**
 * Resolves `relativePath` against `root` and asserts the result stays within `root`.
 * Throws if the resolved path escapes via `..` traversal or is an absolute path outside root.
 *
 * @returns The resolved absolute path, guaranteed to be within root.
 */
export function assertPathWithinRoot(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  const relativeToRoot = path.relative(resolvedRoot, resolvedPath);

  if (
    relativeToRoot === "" ||
    (!relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot))
  ) {
    return resolvedPath;
  }

  throw new Error(
    `Path escapes root: "${relativePath}" resolves outside "${resolvedRoot}"`
  );
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm test 2>&1 | grep -A 3 "pathGuard"
```

Expected: `6 passed`

- [ ] **Step 5: Update `fileService.ts` to import from the shared utility**

Open `apps/desktop/electron/services/fileService.ts`. Find the existing `assertPathWithinRoot` function (around line 124) and replace it with an import:

```ts
// Remove the local assertPathWithinRoot function definition and add this import at the top:
import { assertPathWithinRoot } from "../utils/pathGuard.js";
```

Remove the lines:
```ts
function assertPathWithinRoot(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  const relativeToRoot = path.relative(resolvedRoot, resolvedPath);

  if (
    relativeToRoot === "" ||
    (!relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot))
  ) {
    return resolvedPath;
  }
  // ... (the throw line)
}
```

- [ ] **Step 6: Run all tests to confirm no regression**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm test 2>&1 | tail -10
```

Expected: all existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/electron/utils/pathGuard.ts \
        apps/desktop/electron/__tests__/pathGuard.test.ts \
        apps/desktop/electron/services/fileService.ts
git commit -m "refactor: extract assertPathWithinRoot to shared utility"
```

---

## Task 2: Fix CRITICAL-1 — Path traversal in `EditService.applyPatch`

**Files:**
- Modify: `apps/desktop/electron/services/editService.ts`
- Modify: `apps/desktop/electron/__tests__/pathGuard.test.ts` (add integration coverage)

- [ ] **Step 1: Add path-traversal test for EditService**

Append to `apps/desktop/electron/__tests__/pathGuard.test.ts`:

```ts
import { EditService } from "../services/editService.js";
import * as fs from "node:fs/promises";
import * as os from "node:os";

describe("EditService.applyPatch path guard", () => {
  it("rejects a relativeFilePath that escapes cwd", async () => {
    const service = new EditService();
    await expect(
      service.applyPatch({
        cwd: "/tmp/project",
        relativeFilePath: "../../etc/passwd",
        content: "evil"
      })
    ).rejects.toThrow("Path escapes root");
  });

  it("writes a file at a legitimate relative path", async () => {
    const dir = await fs.mkdtemp(os.tmpdir() + "/edit-test-");
    const service = new EditService();
    await service.applyPatch({ cwd: dir, relativeFilePath: "out.txt", content: "hello" });
    const result = await fs.readFile(dir + "/out.txt", "utf8");
    expect(result).toBe("hello");
    await fs.rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run to confirm the traversal test fails (guard not yet added)**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm test 2>&1 | grep -A 5 "EditService.applyPatch"
```

Expected: `rejects a relativeFilePath` test FAILS (no error thrown yet).

- [ ] **Step 3: Add the guard to `editService.ts`**

Open `apps/desktop/electron/services/editService.ts`. Replace the file content with:

```ts
import fs from "node:fs/promises";
import { assertPathWithinRoot } from "../utils/pathGuard.js";

export interface QuickPatchInput {
  cwd: string;
  relativeFilePath: string;
  content: string;
}

export class EditService {
  async applyPatch(input: QuickPatchInput): Promise<void> {
    const target = assertPathWithinRoot(input.cwd, input.relativeFilePath);
    await fs.writeFile(target, input.content, "utf8");
  }
}
```

- [ ] **Step 4: Run tests to confirm both pass**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm test 2>&1 | grep -A 5 "EditService.applyPatch"
```

Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/services/editService.ts \
        apps/desktop/electron/__tests__/pathGuard.test.ts
git commit -m "fix(security): add path traversal guard to EditService.applyPatch (CRITICAL-1)"
```

---

## Task 3: Fix HIGH-3 — CLI flag injection via prompt in agent adapters

**Files:**
- Modify: `apps/desktop/electron/adapters/claudeCodeCliAdapter.ts`
- Modify: `apps/desktop/electron/adapters/geminiCliAdapter.ts`

No new test files needed — the adapter `command()` methods are pure functions, easily unit-tested inline.

- [ ] **Step 1: Write failing tests**

Create `apps/desktop/electron/__tests__/adapters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ClaudeCodeCliAdapter } from "../adapters/claudeCodeCliAdapter.js";
import { GeminiCliAdapter } from "../adapters/geminiCliAdapter.js";

describe("ClaudeCodeCliAdapter.command", () => {
  it("places -- before the prompt so flag-like prompts are not parsed as flags", () => {
    const adapter = new ClaudeCodeCliAdapter();
    const result = adapter.command({ cwd: "/project", prompt: "--dangerous-flag do evil", threadId: "t1" });
    expect(result.args).toContain("--");
    const dashDashIdx = result.args.indexOf("--");
    const promptIdx = result.args.indexOf("--dangerous-flag do evil");
    expect(promptIdx).toBeGreaterThan(dashDashIdx);
  });

  it("passes cwd via --cwd flag", () => {
    const adapter = new ClaudeCodeCliAdapter();
    const result = adapter.command({ cwd: "/my/project", prompt: "hello", threadId: "t1" });
    expect(result.args).toContain("--cwd");
    expect(result.args[result.args.indexOf("--cwd") + 1]).toBe("/my/project");
  });
});

describe("GeminiCliAdapter.command", () => {
  it("places -- before the prompt", () => {
    const adapter = new GeminiCliAdapter();
    const result = adapter.command({ cwd: "/project", prompt: "--inject", threadId: "t1" });
    expect(result.args).toContain("--");
    const dashDashIdx = result.args.indexOf("--");
    const promptIdx = result.args.indexOf("--inject");
    expect(promptIdx).toBeGreaterThan(dashDashIdx);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm test 2>&1 | grep -A 5 "ClaudeCodeCliAdapter\|GeminiCliAdapter"
```

Expected: tests FAIL — `--` not present before prompt.

- [ ] **Step 3: Fix `claudeCodeCliAdapter.ts`**

Replace content of `apps/desktop/electron/adapters/claudeCodeCliAdapter.ts`:

```ts
import type { AdapterRunState, AgentAdapter, AdapterStartInput } from "./types.js";

export class ClaudeCodeCliAdapter implements AgentAdapter {
  kind = "claude" as const;

  command(input: AdapterStartInput): { file: string; args: string[] } {
    return { file: "claude", args: ["--cwd", input.cwd, "--", input.prompt] };
  }

  detectState(chunk: string): AdapterRunState | null {
    if (/awaiting feedback|waiting for feedback|approval needed/i.test(chunk)) return "needsReview";
    if (/failed|error/i.test(chunk)) return "failed";
    if (/done|completed|finished/i.test(chunk)) return "done";
    return null;
  }
}
```

- [ ] **Step 4: Fix `geminiCliAdapter.ts`**

In `apps/desktop/electron/adapters/geminiCliAdapter.ts`, update only the `command` method:

```ts
command(input: AdapterStartInput): { file: string; args: string[] } {
  return { file: "gemini", args: ["--", input.prompt] };
}
```

- [ ] **Step 5: Run tests to confirm pass**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm test 2>&1 | grep -A 5 "ClaudeCodeCliAdapter\|GeminiCliAdapter"
```

Expected: `3 passed`

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/adapters/claudeCodeCliAdapter.ts \
        apps/desktop/electron/adapters/geminiCliAdapter.ts \
        apps/desktop/electron/__tests__/adapters.test.ts
git commit -m "fix(security): add -- end-of-options separator before prompt in agent adapters (HIGH-3)"
```

---

## Task 4: Fix MEDIUM-2 & MEDIUM-3 — Git flag injection and fragile path derivation

**Files:**
- Modify: `apps/desktop/electron/services/gitAdapter.ts`
- Create: `apps/desktop/electron/__tests__/gitAdapter.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/desktop/electron/__tests__/gitAdapter.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the branch name validator separately since we can't safely call git in unit tests.
// The validator is extracted in Task 4 Step 3 as a named export.
import { isValidBranchName } from "../services/gitAdapter.js";

describe("isValidBranchName", () => {
  it("accepts a normal branch name", () => {
    expect(isValidBranchName("feat/my-feature")).toBe(true);
  });

  it("accepts a branch with dots and numbers", () => {
    expect(isValidBranchName("release-1.2.3")).toBe(true);
  });

  it("rejects a branch name starting with -", () => {
    expect(isValidBranchName("-f")).toBe(false);
  });

  it("rejects a branch name that is --detach", () => {
    expect(isValidBranchName("--detach")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidBranchName("")).toBe(false);
  });

  it("rejects branch names with spaces", () => {
    expect(isValidBranchName("my branch")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm test 2>&1 | grep -A 5 "isValidBranchName"
```

Expected: `Cannot find module` or named export not found.

- [ ] **Step 3: Update `gitAdapter.ts`**

Open `apps/desktop/electron/services/gitAdapter.ts` and replace with:

```ts
import fs from "node:fs";
import path from "node:path";
import { simpleGit } from "simple-git";
import type { GitAdapter } from "./workspaceService.js";

/** Validates that a branch name cannot be interpreted as a git flag. */
export function isValidBranchName(name: string): boolean {
  return /^[a-zA-Z0-9._\-\/]+$/.test(name) && !name.startsWith("-");
}

function assertValidBranch(branch: string): void {
  if (!isValidBranchName(branch)) {
    throw new Error(`Invalid branch name: "${branch}"`);
  }
}

export function createGitAdapter(): GitAdapter {
  return {
    async worktreeAdd(repoPath, worktreePath, branch, baseBranch) {
      assertValidBranch(branch);
      if (baseBranch) assertValidBranch(baseBranch);
      const git = simpleGit(repoPath);
      if (baseBranch) {
        // -- separates flags from positional args; branch comes before -- per git-worktree syntax
        await git.raw(["worktree", "add", "-b", branch, "--", worktreePath, baseBranch]);
      } else {
        await git.raw(["worktree", "add", "--", worktreePath, branch]);
      }
    },

    async worktreeRemove(worktreePath) {
      // Use path.dirname instead of fragile regex
      const parent = path.dirname(path.resolve(worktreePath));
      const git = simpleGit(parent);
      await git.raw(["worktree", "remove", "--force", "--", worktreePath]);
    },

    async worktreeList(repoPath) {
      const git = simpleGit(repoPath);
      const raw = await git.raw(["worktree", "list", "--porcelain"]);
      const entries: Array<{ path: string; branch: string }> = [];
      let currentPath = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("worktree ")) {
          currentPath = line.slice("worktree ".length);
        } else if (line.startsWith("branch refs/heads/")) {
          entries.push({ path: currentPath, branch: line.slice("branch refs/heads/".length) });
        }
      }
      return entries;
    },

    async branchList(repoPath) {
      const git = simpleGit(repoPath);
      const result = await git.branchLocal();
      return result.all;
    },

    async pathExists(fsPath) {
      return fs.existsSync(fsPath);
    }
  };
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm test 2>&1 | grep -A 5 "isValidBranchName"
```

Expected: `6 passed`

- [ ] **Step 5: Run all tests to confirm no regression**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm test 2>&1 | tail -10
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/services/gitAdapter.ts \
        apps/desktop/electron/__tests__/gitAdapter.test.ts
git commit -m "fix(security): fix git flag injection and worktreeRemove path derivation (MEDIUM-2, MEDIUM-3)"
```

---

## Task 5: Fix MEDIUM-1 — Validate `cwd` in IPC handlers

**Files:**
- Modify: `apps/desktop/electron/mainApp.ts`

- [ ] **Step 1: Add the helper function to `mainApp.ts`**

In `apps/desktop/electron/mainApp.ts`, add the following helper after the imports and before `registerIpc`:

```ts
import path from "node:path";
// (path is likely already imported — add only if not present)

/**
 * Asserts that `cwd` is a registered worktree path or a sub-path of one.
 * Call this in all IPC handlers that perform file/git operations on user-supplied paths.
 * Exempt: diffIsGitRepository, diffInitGitRepository (used before a project is registered).
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
```

- [ ] **Step 2: Apply the guard to file operation handlers**

In `registerIpc`, add `assertCwdIsRegistered(cwd)` as the first line inside each of the following handlers (find by their `IPC_CHANNELS` key):

- `IPC_CHANNELS.diffChangedFiles` — `(_, cwd: string)`
- `IPC_CHANNELS.diffRepoStatus` — `(_, cwd: string)`
- `IPC_CHANNELS.diffFileDiff` — `(_, payload)` → `assertCwdIsRegistered(payload.cwd)`
- `IPC_CHANNELS.diffFileMergeSides` — `(_, payload)` → `assertCwdIsRegistered(payload.cwd)`
- `IPC_CHANNELS.diffWorkingTree` — `(_, cwd: string)`
- `IPC_CHANNELS.diffStageAll` — `(_, cwd: string)`
- `IPC_CHANNELS.diffUnstageAll` — `(_, cwd: string)`
- `IPC_CHANNELS.diffDiscardAll` — `(_, cwd: string)`
- `IPC_CHANNELS.diffStagePaths` — `(_, payload)` → `assertCwdIsRegistered(payload.cwd)`
- `IPC_CHANNELS.diffUnstagePaths` — `(_, payload)` → `assertCwdIsRegistered(payload.cwd)`
- `IPC_CHANNELS.diffDiscardPaths` — `(_, payload)` → `assertCwdIsRegistered(payload.cwd)`
- `IPC_CHANNELS.diffGitFetch` — `(_, cwd: string)`
- `IPC_CHANNELS.diffGitPush` — `(_, cwd: string)`
- `IPC_CHANNELS.diffGitCommit` — `(_, payload)` → `assertCwdIsRegistered(payload.cwd)`
- `IPC_CHANNELS.diffGitCheckoutBranch` — `(_, payload)` → `assertCwdIsRegistered(payload.cwd)`
- `IPC_CHANNELS.filesList` — `(_, cwd: string)`
- `IPC_CHANNELS.filesSearch` — `(_, payload)` → `assertCwdIsRegistered(payload.cwd)`
- `IPC_CHANNELS.filesSearchContent` — `(_, payload)` → `assertCwdIsRegistered(payload.cwd)`
- `IPC_CHANNELS.filesRead` — `(_, payload)` → `assertCwdIsRegistered(payload.cwd)`
- `IPC_CHANNELS.filesWrite` — `(_, payload)` → `assertCwdIsRegistered(payload.cwd)`
- `IPC_CHANNELS.filesDeleteFile` — `(_, payload)` → `assertCwdIsRegistered(payload.cwd)`
- `IPC_CHANNELS.filesCreateFolder` — `(_, payload)` → `assertCwdIsRegistered(payload.cwd)`
- `IPC_CHANNELS.filesDeleteFolder` — `(_, payload)` → `assertCwdIsRegistered(payload.cwd)`
- `IPC_CHANNELS.editApplyPatch` — `(_, payload)` → `assertCwdIsRegistered(payload.cwd)`
- `IPC_CHANNELS.terminalPtyCreate` — `(_, payload)` → `assertCwdIsRegistered(payload.cwd)`
- `IPC_CHANNELS.runStart` — `(_, payload)` → `assertCwdIsRegistered(payload.cwd)`

Do **NOT** add the guard to:
- `IPC_CHANNELS.diffIsGitRepository`
- `IPC_CHANNELS.diffInitGitRepository`

- [ ] **Step 3: Build to confirm no TypeScript errors**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm typecheck 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm test 2>&1 | tail -10
```

Expected: all passing. (IPC handlers are mocked in renderer tests; this only affects the main process.)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/mainApp.ts
git commit -m "fix(security): validate cwd against registered worktrees in all IPC handlers (MEDIUM-1)"
```

---

## Task 6: Fix HIGH-1 — Enable `sandbox: true` (preload rewrite first)

**Files:**
- Modify: `apps/desktop/electron/preload.ts`
- Modify: `apps/desktop/electron/mainApp.ts`

The `preload.ts` uses Node.js `path` only in `resolveRepoRootFromWebkitFile`. Rewrite it with pure string operations, then flip `sandbox: false` → `sandbox: true`.

- [ ] **Step 1: Rewrite `resolveRepoRootFromWebkitFile` without Node.js `path`**

In `apps/desktop/electron/preload.ts`, remove the `import path from "node:path"` line and replace the `resolveRepoRootFromWebkitFile` function with:

```ts
/** Absolute repo root from the first file in a webkitdirectory pick (Electron only). */
function resolveRepoRootFromWebkitFile(file: File): string {
  const absolute = webUtils.getPathForFile(file);
  const relative = file.webkitRelativePath;
  if (!relative) {
    // No relative path: strip filename from absolute
    const sep = absolute.includes("/") ? "/" : "\\";
    return absolute.slice(0, absolute.lastIndexOf(sep)) || absolute;
  }

  // Normalise both paths to forward slashes for comparison
  const absForward = absolute.replace(/\\/g, "/");
  const relForward = relative.replace(/\\/g, "/");

  if (absForward.endsWith(relForward)) {
    const rootForward = absForward
      .slice(0, absForward.length - relForward.length)
      .replace(/\/+$/, "");
    // Convert back to OS separator
    const sep = absolute.includes("\\") ? "\\" : "/";
    return rootForward.replace(/\//g, sep);
  }

  // Fallback: strip filename
  const sep = absolute.includes("/") ? "/" : "\\";
  return absolute.slice(0, absolute.lastIndexOf(sep)) || absolute;
}
```

- [ ] **Step 2: Build the preload to confirm it compiles without the `path` import**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm build:electron 2>&1 | tail -20
```

Expected: build succeeds, no `path` import errors.

- [ ] **Step 3: Flip `sandbox: false` → `sandbox: true` in `mainApp.ts`**

In `apps/desktop/electron/mainApp.ts`, find:

```ts
      sandbox: false
```

Replace with:

```ts
      sandbox: true
```

- [ ] **Step 4: Build and smoke-test**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm build:electron 2>&1 | tail -10
```

Expected: build succeeds.

Then launch the app manually with `pnpm dev:electron` and verify:
- Folder picker (drag-and-drop / webkitdirectory) still resolves the repo root correctly
- PTY terminals open without errors
- File editor loads and saves files

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/preload.ts \
        apps/desktop/electron/mainApp.ts
git commit -m "fix(security): enable sandbox:true — rewrite preload without Node.js path import (HIGH-1)"
```

---

## Task 7: Fix CRITICAL-2 — Upgrade `axios`

**Files:**
- Modify: `apps/landing-page/package.json` (or whichever workspace uses axios)

- [ ] **Step 1: Find the workspace with axios**

```bash
grep -r '"axios"' /Users/blaisetiong/Developer/instrument/apps --include='package.json'
```

- [ ] **Step 2: Upgrade axios in that workspace**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm update axios --filter <workspace-name>
```

Replace `<workspace-name>` with the filter name found in step 1 (e.g., `apps-landing-page`).

- [ ] **Step 3: Verify the vulnerability is resolved**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm audit 2>&1 | grep -i axios
```

Expected: no axios vulnerabilities listed.

- [ ] **Step 4: Build the landing page to confirm no breaking changes**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm build:landing 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page/package.json pnpm-lock.yaml
git commit -m "fix(security): upgrade axios to >=1.15.0 to resolve metadata exfiltration CVE (CRITICAL-2)"
```

---

## Task 8: Fix LOW-2 — RevSpec colon validation in `diffService.ts`

**Files:**
- Modify: `apps/desktop/electron/services/diffService.ts`

- [ ] **Step 1: Add the guard before revspec construction**

In `apps/desktop/electron/services/diffService.ts`, find the `gitShowBuffer` private method and add a guard at the top:

```ts
private async gitShowBuffer(cwd: string, revSpec: string): Promise<{ text: string; binary: boolean }> {
  // revSpec is caller-constructed (e.g. `HEAD:${file}`). Validate the file portion contains no
  // extra colons, which have special meaning in git revspecs.
  // (This method is only called internally; this is a defence-in-depth check.)
```

Also add a guard in `fileMergeSides` before the calls that interpolate `file` into a revspec:

```ts
async fileMergeSides(cwd: string, file: string, scope: Exclude<FileDiffScope, "combined">): Promise<FileMergeSidesResult> {
  if (file.includes(":")) {
    throw new Error(`Invalid file path for diff: "${file}"`);
  }
  // ... rest of method unchanged
```

- [ ] **Step 2: Build to confirm no TypeScript errors**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron/services/diffService.ts
git commit -m "fix(security): validate file path has no colon before git revspec interpolation (LOW-2)"
```

---

## Task 9: Upgrade Electron (HIGH-2)

This task requires manual verification after the upgrade.

- [ ] **Step 1: Check latest stable Electron version**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm info electron version
```

Note the latest version. Check the [Electron releases](https://github.com/electron/electron/releases) page to confirm it patches the `commandLineSwitches` vulnerability.

- [ ] **Step 2: Upgrade Electron in the desktop workspace**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm update electron --filter workbench
```

- [ ] **Step 3: Rebuild native modules**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm rebuild:natives
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm test 2>&1 | tail -10
```

Expected: all passing.

- [ ] **Step 5: Build and smoke-test the app**

```bash
cd /Users/blaisetiong/Developer/instrument
pnpm build:electron 2>&1 | tail -10
```

Launch with `pnpm dev:electron`. Verify:
- PTY terminals work (node-pty rebuilt correctly)
- SQLite workspace database loads (better-sqlite3 rebuilt correctly)
- App starts without Electron API errors in the console

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/package.json pnpm-lock.yaml
git commit -m "fix(security): upgrade Electron to patch commandLineSwitches renderer injection CVE (HIGH-2)"
```

---

## Completion Checklist

After all tasks are done, verify the full audit is addressed:

```bash
# Re-run audit to check remaining vulnerabilities
cd /Users/blaisetiong/Developer/instrument && pnpm audit 2>&1 | tail -5

# Run full test suite
pnpm test 2>&1 | tail -10

# Type check
pnpm typecheck 2>&1 | tail -5
```

Remaining LOW-5 (runtime IPC payload validation with zod) is intentionally deferred — it is a large scope change with no immediate exploitability given the fixes above.
