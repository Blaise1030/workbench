# Local WebLLM (commit suggestions + thread titles) — Design

**Date:** 2026-04-14  
**Status:** Draft (pending user review)  
**Revision:** 2026-04-14-b — Locked thread-title behavior and worker threading intent.

## Problem

Writing a good commit message from a staged diff is repetitive, and external tools add friction. Thread titles today are derived from a **first-line heuristic** or a dated agent placeholder, which is often a poor match for what the user is actually doing. A **small, local** WebGPU model inside the desktop app can improve **commit messages** (from staged diff) and **thread titles** (from the user’s prompt) without sending code or prompts to the cloud.

## Goals

- Run a **WebGPU-first** Web LLM in the **Instrument desktop** renderer (no cloud inference in v1).
- **Single curated model** and **shared engine lifecycle** serving two features: (1) commit suggestions, (2) thread title refinement.
- **Commit path:** Input is **`git diff --cached`** only, with **strict size limits** and visible truncation when the diff is large. Output is **several short candidate messages** the user can **one-click apply** into the commit field; the user always commits manually.
- **Thread title path:** After the **first user send** on a new thread, keep the **existing immediate title** (current `resolveNewThreadTitle` / placeholder behavior) as the **first paint**, then **replace** with a model-generated short title **when inference completes**. The model must **never** be awaited on the path that starts the PTY bootstrap.
- **Threading / UI:** Prefer running inference in a **Dedicated Web Worker** (separate JS thread from the Vue UI thread) when WebLLM + WebGPU + Electron allow it, so token generation does not jank scrolling or typing. If worker offload is not viable in v1, generation may run on the main renderer thread with **strict token caps** for the title task until worker support is verified.
- Clear UI states for the commit feature: idle, model loading, generating, results, explicit failure modes (empty stage, WebGPU unavailable, inference error).
- Performance-oriented defaults for commits: debounce on rapid stage changes, optional cache keyed by staged content hash.

## Non-goals (v1)

- Unstaged diff, arbitrary hunk selection, or parity with diff-review selection scope for commits.
- **Automatic thread rename on every subsequent user message** — only the **first send** triggers model title refinement unless explicitly expanded later.
- Cloud APIs, remote runners, or “phone home” for inference.
- User-facing model picker or arbitrary weight downloads beyond a single curated default model.
- Auto-commit or committing without user confirmation.
- Guaranteed perfect Conventional Commits or perfect titles without user edit.

## Recommended approach

Use **WebLLM** (or an equivalent WebGPU pipeline) in the **Electron renderer**, with a **single small instruct model** (quantized, roughly sub-2B class—exact checkpoint chosen at implementation time based on WebLLM catalog, license, and measured cold/warm latency on Apple Silicon).

**Commit prompt:** system instructions enforcing repository commit style (imperative mood, length limits, optional Conventional Commits if that matches the repo), plus bounded staged diff text. **Post-process:** parse model output into a fixed number of candidate strings (strip code fences, split on newlines) before showing in UI.

**Thread title prompt:** system instructions: output **exactly one** short title (max length enforced in prompt and by truncation), **no quotes**, describe the user’s task in a few words, imperative or noun-phrase style consistent with sidebar space. Input: the **first user message** text (bounded length); optionally a one-line agent label if cheap. **Post-process:** strip fences and newlines; hard-truncate to sidebar-safe length before `renameThread`.

**Git access:** reuse existing desktop patterns for invoking git from the main process; the renderer receives **only the bounded diff string** (and minimal metadata such as branch name if needed and cheap).

**Concurrency:** One logical **generation queue** or mutex so commit and thread requests do not corrupt shared engine state; title jobs should be **cheap and short** and may preempt or wait behind an in-flight commit generation depending on implementation (document choice in plan).

## User experience

### Commit messages

1. User stages files as usual.
2. In the **commit compose** surface, user clicks **Suggest commit message** (disabled when there is no staged diff).
3. First time: user sees **model loading** progress; subsequent sessions may warm faster if weights are cached under app user data.
4. User sees **N candidates** (target: three one-line subjects; optional body lines only if product style allows—default lean toward single-line subjects for speed and clarity).
5. User clicks a candidate to **fill the message field**, edits, and commits.

**Truncation:** If the staged diff exceeds the cap, show an inline note that the diff was truncated for performance so suggestions may omit tail files.

### Thread titles (Agents tab)

1. User submits the **first** prompt on a new thread — **same** immediate rename as today runs (placeholder or first-line heuristic), and the **PTY bootstrap is scheduled without waiting** on the model.
2. In parallel, if WebGPU is available and the model is loadable, the app starts **async title generation** (prefer **Dedicated Worker**).
3. When a non-empty valid title returns, call **`renameThread`** once to replace the placeholder. If generation fails or WebGPU is missing, **keep** the heuristic title (no error toast required for title path unless desired as subtle optional feedback).
4. If the user **manually renames** the thread before the model returns, **discard** the pending title update (do not overwrite user intent).

## Architecture

### Boundaries

- **Renderer:** WebLLM engine lifecycle, generation requests, UI state machine for commit UI; thread title orchestration hooks from the same code path that handles first inline prompt submit (`WorkspaceLayout` / composable — exact file in implementation plan).
- **Optional Dedicated Worker:** hosts WebLLM inference entrypoint when supported; main renderer posts `{ kind: 'title' | 'commit', payload }` and receives results via `MessageChannel` / structured cloning. Same IPC and git rules apply; worker never touches Node `fs` or `git` directly.
- **Main / existing git IPC:** Produce `git diff --cached` text; enforce or cooperate on **max bytes/lines** before sending to renderer.
- **Shared utilities:** Two prompt builders (commit, title) + shared post-process helpers; unit-tested; align with `diffTruncate` for commit input.

### WebGPU

- **Feature detect** WebGPU before offering commit suggestion or starting thread title refinement; if unavailable, commit control shows blocked state; thread flow **skips** model and keeps heuristic title.
- No silent downgrade to cloud in v1.

### Caching

- Optional **content-hash cache** for commit suggestions.
- Thread title: optional in-memory **dedupe** by `threadId + hash(firstMessage)` to avoid double-rename if submit is retried.

## Error handling

| Condition                         | Commit path                                              | Thread title path                                      |
| --------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| No staged changes                 | Control disabled                                         | N/A                                                    |
| WebGPU unavailable                | Blocking message; do not start WebLLM                    | Skip model; keep heuristic title                       |
| Model load failure                | Inline error + retry                                     | Keep heuristic title; optional subtle log              |
| Inference timeout / empty output | Cancel + retry; preserve last good candidates if any      | Keep heuristic title                                   |
| User renamed thread before result | N/A                                                      | Discard pending model title                            |

## Testing

- **Unit:** commit prompt builder (fixed diff → stable prefix, respects max length).
- **Unit:** thread title prompt builder + single-line sanitizer.
- **Unit:** candidate parser for commits (markdown fences, extra prose).
- **Component / integration:** commit state machine (empty stage, success with mocked engine, WebGPU missing).
- **Component / integration:** first-send flow: bootstrap fires without awaiting model; mocked late `renameThread` only when placeholder still current.
- **Manual QA:** cold first load, warm second load, large staged diff, WebGPU-off; rapid manual rename before model returns.

## Open decisions (implementation time)

- Exact default model id and quantization from the WebLLM catalog after a short benchmark on target Electron + macOS hardware.
- Precise placement in the commit UI relative to existing layout components (follow current design system).
- Whether v1 ships **worker-based** inference or **main-renderer** with token caps until worker path is validated.

## Self-review (2026-04-14-b)

- Commit goals unchanged: staged-only, local WebGPU, bounded IPC.
- Thread title flow explicitly matches: async after first send, no PTY blocking, worker preference with honest v1 fallback.
- Non-goals exclude per-message renames unless scope expands later.
