# Local WebLLM (commit suggestions + thread titles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a WebGPU-first `@mlc-ai/web-llm` integration in `apps/desktop` that (1) suggests commit messages from **staged** unified diff via IPC, and (2) **asynchronously** refines the **thread title after the first user send** without blocking PTY bootstrap, with optional later move to a **Dedicated Worker** for UI smoothness.

**Architecture:** Main process adds `DiffService.stagedUnifiedDiff` and a new IPC invoke returning bounded text + `truncated` flag. Renderer owns a **singleton MLCEngine** behind a **serial request queue** (commit suggestions vs thread title never interleave corruptingly). Prompt builders and output parsers are **pure TypeScript** with Vitest. **Dynamic import** of `@mlc-ai/web-llm` so the main Vite chunk stays within `scripts/bundle-budget.json`. Thread titles use an **epoch / AbortController** so manual renames before the model returns do not get overwritten.

**Tech Stack:** Electron 39, Vue 3, Vite 6, TypeScript, `@mlc-ai/web-llm`, `simple-git`, Vitest, existing `truncateUnifiedDiff` from `src/shared/diffTruncate.ts`.

**Spec:** `docs/superpowers/specs/2026-04-14-local-commit-webllm-design.md`

**Working directory:** Run `pnpm` / `vitest` / `typecheck` from `apps/desktop`. Run `git add` / `git commit` from the **repository root** using paths prefixed with `apps/desktop/` (and `pnpm-lock.yaml` at root when the dependency changes).

---

## File map

| File | Responsibility |
| --- | --- |
| `src/shared/ipc.ts` | Add exported `StagedUnifiedDiffResult` type |
| `electron/ipcChannels.ts` | Add `diffStagedUnified: "diff:stagedUnified"` |
| `electron/preload.ts` | Add `IPC_CHANNELS` string + `stagedUnifiedDiff` on `workspaceApi` |
| `electron/mainApp.ts` | `ipcMain.handle` for staged unified diff |
| `electron/services/diffService.ts` | `stagedUnifiedDiff(cwd)` using `git diff --cached` + `truncateUnifiedDiff` |
| `src/env.d.ts` | `stagedUnifiedDiff?: (cwd: string) => Promise<StagedUnifiedDiffResult>` |
| `src/features/localLlm/constants.ts` | `DEFAULT_MLC_MODEL_ID`, max prompt/title lengths, candidate count |
| `src/features/localLlm/commitPrompt.ts` | `buildCommitSuggestionPrompt(diff: string, truncated: boolean): string` |
| `src/features/localLlm/threadTitlePrompt.ts` | `buildThreadTitlePrompt(userMessage: string, agentLabel: string): string` |
| `src/features/localLlm/parseModelText.ts` | `parseCommitCandidates(raw: string): string[]`, `parseThreadTitle(raw: string): string` |
| `src/features/localLlm/webgpuSupport.ts` | `export async function isWebGpuUsable(): Promise<boolean>` |
| `src/features/localLlm/engine.ts` | Lazy `CreateMLCEngine`, serial queue, `generateCommitCandidates`, `generateThreadTitle` |
| `src/features/localLlm/__tests__/commitPrompt.test.ts` | Prompt shape + truncation notice |
| `src/features/localLlm/__tests__/parseModelText.test.ts` | Parsers |
| `src/features/localLlm/__tests__/webgpuSupport.test.ts` | Mock `navigator.gpu` |
| `src/composables/useLocalLlm.ts` | Thin reactive wrapper: load state, errors, `suggestCommits`, `enqueueThreadTitle` |
| `src/components/SourceControlPanel.vue` | Suggest button, truncation note, candidate list emit or v-model |
| `src/layouts/WorkspaceLayout.vue` | Wire staged diff IPC, suggest handler, thread title epoch + async rename |
| `vite.config.ts` (or `vite.config.*`) | Ensure code-split chunk for `@mlc-ai/web-llm`; adjust if build warns |

---

## Constraints

- **Never** `await` local LLM on the code path that sets `pendingAgentBootstrap` in `onInlinePromptSubmit`.
- **Staged diff only** for commits; reuse `MAX_UNIFIED_DIFF_CHARS` behavior via existing `truncateUnifiedDiff`.
- **No cloud** fallback.
- **Default model:** start with **`Llama-3.2-1B-Instruct-q4f16_1-MLC`** (widely listed in WebLLM prebuilt catalogs). If the installed `@mlc-ai/web-llm` version rejects the id, adjust to the closest **1B-class instruct** model id that version documents and record the final id in `constants.ts` only.
- After adding the dependency, run **`pnpm run verify:bundle-budget`** from `apps/desktop`; if gzip exceeds `scripts/bundle-budget.json`, keep WebLLM in a **separate async chunk** (dynamic import from `engine.ts` only) and avoid static imports in `WorkspaceLayout.vue` / `SourceControlPanel.vue`.

---

### Task 1: `StagedUnifiedDiffResult` + IPC + `DiffService.stagedUnifiedDiff`

**Files:**

- Modify: `src/shared/ipc.ts`
- Modify: `electron/ipcChannels.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/mainApp.ts`
- Modify: `electron/services/diffService.ts`
- Modify: `src/env.d.ts`

- [ ] **Step 1: Add the shared IPC result type**

In `src/shared/ipc.ts` (after `RepoScmSnapshot` is a fine location), add:

```ts
/** Bounded `git diff --cached` text for local LLM commit suggestions. */
export interface StagedUnifiedDiffResult {
  unifiedDiff: string;
  /** True when output was shortened by `truncateUnifiedDiff`. */
  truncated: boolean;
}
```

- [ ] **Step 2: Implement `stagedUnifiedDiff` in `DiffService`**

In `electron/services/diffService.ts`, import `truncateUnifiedDiff` (already imported at top of file). Add method:

```ts
async stagedUnifiedDiff(cwd: string): Promise<StagedUnifiedDiffResult> {
  const git = simpleGit(cwd);
  const raw = await git.diff(["--cached", "-U3", "--no-ext-diff"]);
  const unifiedDiff = truncateUnifiedDiff(raw);
  const truncated = unifiedDiff.includes("# Diff truncated (");
  return { unifiedDiff, truncated };
}
```

- [ ] **Step 3: Wire IPC**

1. `electron/ipcChannels.ts` — add `diffStagedUnified: "diff:stagedUnified"` next to other `diff*` keys.
2. `electron/preload.ts` — add `diffStagedUnified: "diff:stagedUnified"` inside `IPC_CHANNELS` object, and on `workspaceApi`:

```ts
stagedUnifiedDiff: (cwd: string) =>
  ipcRenderer.invoke(IPC_CHANNELS.diffStagedUnified, cwd) as Promise<import("../src/shared/ipc.js").StagedUnifiedDiffResult>,
```

(Use the same import style as other typed invokes in this file if you prefer a top-level type import.)

3. `electron/mainApp.ts` — register next to `diffWorkingTree`:

```ts
ipcMain.handle(IPC_CHANNELS.diffStagedUnified, (_, cwd: string) => {
  assertCwdIsRegistered(cwd);
  return diffService.stagedUnifiedDiff(cwd);
});
```

4. `src/env.d.ts` — extend `WorkspaceApi`:

```ts
stagedUnifiedDiff?: (cwd: string) => Promise<import("@shared/ipc").StagedUnifiedDiffResult>;
```

- [ ] **Step 4: Verify preload parity test**

Run:

```bash
cd apps/desktop && pnpm vitest run electron/__tests__/preloadIpcChannelsParity.test.ts
```

Expected: **PASS** (preload string for `diff:stagedUnified` exists).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/ipc.ts apps/desktop/electron/ipcChannels.ts apps/desktop/electron/preload.ts apps/desktop/electron/mainApp.ts apps/desktop/electron/services/diffService.ts apps/desktop/src/env.d.ts
git commit -m "feat(scm): IPC for staged unified diff for local LLM"
```

---

### Task 2: Pure prompts + parsers + tests

**Files:**

- Create: `src/features/localLlm/constants.ts`
- Create: `src/features/localLlm/commitPrompt.ts`
- Create: `src/features/localLlm/threadTitlePrompt.ts`
- Create: `src/features/localLlm/parseModelText.ts`
- Create: `src/features/localLlm/__tests__/commitPrompt.test.ts`
- Create: `src/features/localLlm/__tests__/parseModelText.test.ts`

- [ ] **Step 1: Write failing tests**

`parseModelText.test.ts` should assert:

- `parseCommitCandidates` strips ``` fences and returns up to 3 non-empty lines
- `parseThreadTitle` returns first non-empty line, max 60 chars, no newlines

`commitPrompt.test.ts` should assert:

- output contains `Staged diff` section and ends with the diff text
- when `truncated === true`, output contains a warning sentence that mentions truncation

- [ ] **Step 2: Run tests (expect fail)**

```bash
cd apps/desktop && pnpm vitest run src/features/localLlm/__tests__/commitPrompt.test.ts src/features/localLlm/__tests__/parseModelText.test.ts
```

Expected: **FAIL** (missing modules).

- [ ] **Step 3: Implement constants + pure modules**

`constants.ts`:

```ts
export const DEFAULT_MLC_MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC" as const;
export const MAX_THREAD_TITLE_CHARS = 60;
export const MAX_USER_MESSAGE_FOR_TITLE_CHARS = 8000;
export const COMMIT_CANDIDATE_COUNT = 3;
```

`commitPrompt.ts`:

```ts
import { COMMIT_CANDIDATE_COUNT } from "./constants";

export function buildCommitSuggestionPrompt(unifiedDiff: string, truncated: boolean): string {
  const warn = truncated
    ? "\nNote: The diff was truncated for size. Infer only from the visible portion.\n"
    : "";
  return [
    "You suggest git commit messages.",
    "Rules: imperative mood; one subject line per suggestion (max 72 chars); optional scope in conventional style if obvious.",
    `Return exactly ${COMMIT_CANDIDATE_COUNT} subject lines, one per line, no numbering, no code fences, no extra prose.`,
    warn,
    "Staged diff:",
    unifiedDiff
  ].join("\n");
}
```

`threadTitlePrompt.ts`:

```ts
import { MAX_THREAD_TITLE_CHARS, MAX_USER_MESSAGE_FOR_TITLE_CHARS } from "./constants";

export function buildThreadTitlePrompt(userMessage: string, agentLabel: string): string {
  const body = userMessage.length > MAX_USER_MESSAGE_FOR_TITLE_CHARS
    ? userMessage.slice(0, MAX_USER_MESSAGE_FOR_TITLE_CHARS)
    : userMessage;
  return [
    "You name a short UI title for a coding agent thread.",
    `Rules: reply with exactly one line, max ${MAX_THREAD_TITLE_CHARS} characters; no quotes; describe the user's task; agent context: ${agentLabel}.`,
    "User message:",
    body
  ].join("\n");
}
```

`parseModelText.ts`:

```ts
import { COMMIT_CANDIDATE_COUNT, MAX_THREAD_TITLE_CHARS } from "./constants";

export function parseCommitCandidates(raw: string): string[] {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
  }
  const lines = t
    .split("\n")
    .map((l) => l.replace(/^\s*\d+[\).\s]+/, "").trim())
    .filter(Boolean);
  return lines.slice(0, COMMIT_CANDIDATE_COUNT);
}

export function parseThreadTitle(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
  }
  const line = t.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const one = line.replace(/^["']|["']$/g, "");
  return one.length > MAX_THREAD_TITLE_CHARS ? one.slice(0, MAX_THREAD_TITLE_CHARS) : one;
}
```

- [ ] **Step 4: Run tests (expect pass)**

```bash
cd apps/desktop && pnpm vitest run src/features/localLlm/__tests__/commitPrompt.test.ts src/features/localLlm/__tests__/parseModelText.test.ts
```

Expected: **PASS**.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/localLlm/constants.ts apps/desktop/src/features/localLlm/commitPrompt.ts apps/desktop/src/features/localLlm/threadTitlePrompt.ts apps/desktop/src/features/localLlm/parseModelText.ts apps/desktop/src/features/localLlm/__tests__/commitPrompt.test.ts apps/desktop/src/features/localLlm/__tests__/parseModelText.test.ts
git commit -m "feat(local-llm): add prompts and output parsers with tests"
```

---

### Task 3: WebGPU probe + lazy engine + serial queue

**Files:**

- Create: `src/features/localLlm/webgpuSupport.ts`
- Create: `src/features/localLlm/engine.ts`
- Create: `src/features/localLlm/__tests__/webgpuSupport.test.ts`
- Modify: `apps/desktop/package.json` (dependency)

- [ ] **Step 1: Add dependency**

```bash
cd apps/desktop && pnpm add @mlc-ai/web-llm
```

- [ ] **Step 2: Write failing WebGPU test**

`webgpuSupport.test.ts` uses `vi.stubGlobal` to assert `isWebGpuUsable()` is false when `navigator.gpu` is undefined and true when a fake `requestAdapter` resolves.

- [ ] **Step 3: Implement `webgpuSupport.ts`**

```ts
export async function isWebGpuUsable(): Promise<boolean> {
  try {
    const gpu = navigator.gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Implement `engine.ts` (main-thread v1)**

Use **dynamic import** inside `ensureEngine()` so Vite emits a separate chunk:

```ts
const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
```

**Queue contract:** hold an in-memory FIFO of jobs `{ kind: "commit" | "title"; ...payload }` each wrapped in a `Promise` executor pair. Pseudocode for enqueue (implement fully with correct TypeScript discriminated unions):

```ts
type Job =
  | { kind: "commit"; diff: StagedUnifiedDiffResult }
  | { kind: "title"; userMessage: string; agentLabel: string };

const jobs: Array<{ job: Job; resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
let draining = false;

function enqueueCommit(diff: StagedUnifiedDiffResult): Promise<string[]> {
  return new Promise((resolve, reject) => {
    jobs.push({ job: { kind: "commit", diff }, resolve, reject });
    void drain();
  });
}

function enqueueTitle(userMessage: string, agentLabel: string): Promise<string> {
  return new Promise((resolve, reject) => {
    jobs.push({ job: { kind: "title", userMessage, agentLabel }, resolve, reject });
    void drain();
  });
}

async function drain(): Promise<void> {
  if (draining) return;
  const item = jobs.shift();
  if (!item) return;
  draining = true;
  try {
    const eng = await ensureEngine();
    if (item.job.kind === "commit") {
      const prompt = buildCommitSuggestionPrompt(item.job.diff.unifiedDiff, item.job.diff.truncated);
      const out = await eng.chat.completions.create({
        messages: [
          { role: "system", content: "You output concise git subject lines only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 200
      });
      const text = out.choices[0]?.message?.content?.trim() ?? "";
      const cands = parseCommitCandidates(text);
      if (cands.length === 0) throw new Error("Empty commit suggestions");
      item.resolve(cands);
    } else {
      const prompt = buildThreadTitlePrompt(item.job.userMessage, item.job.agentLabel);
      const out = await eng.chat.completions.create({
        messages: [
          { role: "system", content: "You output a single short thread title." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 64
      });
      const text = out.choices[0]?.message?.content?.trim() ?? "";
      const title = parseThreadTitle(text);
      if (!title) throw new Error("Empty thread title");
      item.resolve(title);
    }
  } catch (e) {
    item.reject(e);
  } finally {
    draining = false;
    void drain();
  }
}

export function generateCommitCandidates(diff: StagedUnifiedDiffResult): Promise<string[]> {
  return enqueueCommit(diff);
}

export function generateThreadTitle(userMessage: string, agentLabel: string): Promise<string> {
  return enqueueTitle(userMessage, agentLabel);
}
```

Align `eng.chat.completions.create` with the **actual** `@mlc-ai/web-llm` API surface for the installed version (method names differ slightly across majors — adjust imports once after `pnpm add`).

Export `generateCommitCandidates` and `generateThreadTitle` only; add `__resetEngineForTests()` guarded by `import.meta.vitest` if unit tests need a clean singleton.

- [ ] **Step 5: Run typecheck and unit tests**

```bash
cd apps/desktop && pnpm run typecheck
cd apps/desktop && pnpm vitest run src/features/localLlm/__tests__/webgpuSupport.test.ts
```

Expected: **PASS** for tests; typecheck clean once engine typings align with installed `@mlc-ai/web-llm`.

- [ ] **Step 6: Bundle budget**

```bash
cd apps/desktop && pnpm run verify:bundle-budget
```

If this **fails**, split any **static** import of `@mlc-ai/web-llm` out of the app entry so only `engine.ts` dynamically imports it, then re-run until gzip is under budget.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/package.json pnpm-lock.yaml apps/desktop/src/features/localLlm/webgpuSupport.ts apps/desktop/src/features/localLlm/engine.ts apps/desktop/src/features/localLlm/__tests__/webgpuSupport.test.ts
git commit -m "feat(local-llm): lazy WebLLM engine with WebGPU gate and queue"
```

---

### Task 4: `useLocalLlm` composable + Source Control UI

**Files:**

- Create: `src/composables/useLocalLlm.ts`
- Modify: `src/components/SourceControlPanel.vue`
- Modify: `src/layouts/WorkspaceLayout.vue` (commit suggest wiring only in this task)

- [ ] **Step 1: Composable**

`useLocalLlm.ts` exposes:

- `webGpuOk: Ref<boolean | null>` (null = not yet probed)
- `probeWebGpu(): Promise<void>` sets `webGpuOk`
- `commitSuggestState: Ref<"idle" | "loading" | "ready" | "generating" | "error">`
- `commitSuggestError: Ref<string | null>`
- `commitCandidates: Ref<string[]>`
- `async function suggestFromStaged(cwd: string | null)` — if `!cwd` or `!getApi()?.stagedUnifiedDiff` return; call IPC, then `generateCommitCandidates`

- [ ] **Step 2: `SourceControlPanel.vue`**

Add props: `suggestCommitAvailable`, `suggestCommitDisabledReason`, `suggestCommitBusy`, `suggestCommitGpuOk`.

Add emit: `applyCommitCandidate: [message: string]` or bind candidates from parent — **prefer parent owning candidates** so all LLM state stays in `WorkspaceLayout` + composable.

UI: small **Suggest** button above or beside the commit textarea (match existing `Button` `size="xs"` styling in the footer). When `suggestCommitGpuOk === false`, show disabled button + `title` explaining WebGPU. When `truncated` from last fetch, show muted one-line note under textarea.

- [ ] **Step 3: `WorkspaceLayout.vue`**

Instantiate composable once, pass props into `SourceControlPanel`, handle `suggest` click: `await suggestFromStaged(scmCwd)`, map errors to toast.

- [ ] **Step 4: Component test (light)**

Extend `src/components/__tests__/` coverage if there is an existing `SourceControlPanel` test file; if not, add a focused test that mounting with `suggestCommitAvailable=false` does not show the button, and `true` shows it.

- [ ] **Step 5: Run tests + typecheck**

```bash
cd apps/desktop && pnpm run typecheck
cd apps/desktop && pnpm vitest run
```

Expected: **PASS** (full suite).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/composables/useLocalLlm.ts apps/desktop/src/components/SourceControlPanel.vue apps/desktop/src/layouts/WorkspaceLayout.vue apps/desktop/src/components/__tests__/
git commit -m "feat(scm): suggest commit messages via local WebLLM"
```

---

### Task 5: Thread title async refinement + rename safety

**Files:**

- Modify: `src/layouts/WorkspaceLayout.vue` (only the thread-create / rename flow)

- [ ] **Step 1: Add per-thread title epoch map**

In `<script setup>` of `WorkspaceLayout.vue`, add:

```ts
const threadTitleEpoch = new Map<string, number>();

function bumpThreadTitleEpoch(threadId: string): void {
  threadTitleEpoch.set(threadId, (threadTitleEpoch.get(threadId) ?? 0) + 1);
}
```

- [ ] **Step 2: On manual rename, bump epoch**

At the start of `handleRenameThread`, call `bumpThreadTitleEpoch(threadId)` **before** awaiting `api.renameThread` so any in-flight model job sees a stale epoch.

- [ ] **Step 3: Fire async title after first inline submit**

In `onInlinePromptSubmit`, **after** computing `title` from `resolveNewThreadTitle`, performing `renameThread` for the placeholder, and assigning `pendingAgentBootstrap`, capture:

```ts
const epoch = threadTitleEpoch.get(threadId) ?? 0;
const heuristicTitle = title;
void (async () => {
  try {
    if (!(await isWebGpuUsable())) return;
    const modelTitle = await generateThreadTitle(prompt, THREAD_AGENT_LABELS[agent]);
    if ((threadTitleEpoch.get(threadId) ?? 0) !== epoch) return;
    const t = workspace.threads.find((x) => x.id === threadId);
    if (!t || t.title.trim() !== heuristicTitle.trim()) return;
    await getApi()?.renameThread({ threadId, title: modelTitle });
    await refreshSnapshot();
  } catch {
    /* keep heuristic title */
  }
})();
```

Import `THREAD_AGENT_LABELS` or duplicate a minimal label string to avoid circular imports if needed.

- [ ] **Step 4: Extend `WorkspaceLayout` test**

In `src/layouts/__tests__/WorkspaceLayout.test.ts`, add a test with mocked `generateThreadTitle` (vi.mock on `src/features/localLlm/engine.ts`) proving `renameThread` is called twice when epoch unchanged (use fake timers / flushPromises as appropriate).

- [ ] **Step 5: Run targeted tests**

```bash
cd apps/desktop && pnpm vitest run src/layouts/__tests__/WorkspaceLayout.test.ts
```

Expected: **PASS**.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/layouts/WorkspaceLayout.vue apps/desktop/src/layouts/__tests__/WorkspaceLayout.test.ts
git commit -m "feat(agents): async WebLLM thread title after first send"
```

---

### Task 6 (optional follow-up): Dedicated Worker offload

**Files:**

- Create: `src/features/localLlm/webllmWorker.ts` (or `.worker.ts` per Vite convention)
- Modify: `src/features/localLlm/engine.ts`

Only start this task after **manual** confirmation that main-thread generation causes noticeable UI jank with the chosen model.

- [ ] Move `CreateMLCEngine` into the worker using `@mlc-ai/web-llm` worker APIs (`CreateWebWorkerMLCEngine` / documented pattern for the pinned package version).
- [ ] Renderer `engine.ts` becomes a thin RPC client posting `{ kind, payload }` messages.
- [ ] Add Vitest / integration smoke: worker boots in dev build (may be manual QA only).

---

## Plan self-review

| Spec requirement | Task coverage |
| --- | --- |
| Staged-only diff + bounds | Task 1 |
| WebGPU-first, no cloud | Tasks 2–3 |
| Commit UI states + truncation note | Task 4 |
| Async thread title, no PTY blocking | Task 5 |
| Manual rename cancels stale model title | Task 5 epoch + title equality check |
| Shared engine + queue | Task 3 |
| Worker preference (non-blocking v1) | Task 6 optional |
| Tests per spec | Tasks 2, 4–5 |

**Placeholder scan:** None intentional; model id is explicit with a single documented adjustment rule if the catalog drifts.

---

## Execution handoff

**Plan complete and saved to** `docs/superpowers/plans/2026-04-14-local-webllm-commit-and-thread-titles.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration (**superpowers:subagent-driven-development**).

2. **Inline Execution** — Same session, batch tasks with checkpoints (**superpowers:executing-plans**).

**Which approach do you want?**
