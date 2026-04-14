# Local commit message suggestions (WebGPU WebLLM) — Design

**Date:** 2026-04-14  
**Status:** Draft (pending user review)

## Problem

Writing a good commit message from a staged diff is repetitive, and external tools add friction. A **small, local** model that reads **staged changes only** and proposes messages inside the desktop app reduces context switching while keeping code private on the machine.

## Goals

- Run a **WebGPU-first** in-process Web LLM in the **Instrument desktop** renderer (no cloud inference in v1).
- Input is **`git diff --cached`** only, with **strict size limits** and visible truncation when the diff is large.
- Output is **several short candidate messages** the user can **one-click apply** into the existing commit message field; the user always commits manually.
- Clear UI states: idle, model loading (first use), generating, results, and explicit failure modes (empty stage, WebGPU unavailable, inference error).
- Performance-oriented defaults: debounce regeneration on rapid stage changes, optional cache keyed by staged content hash to skip redundant runs.

## Non-goals (v1)

- Unstaged diff, arbitrary hunk selection, or parity with diff-review selection scope.
- Cloud APIs, remote runners, or “phone home” for inference.
- User-facing model picker or arbitrary weight downloads beyond a single curated default model.
- Auto-commit or committing without user confirmation.
- Guaranteed perfect Conventional Commits without user editing.

## Recommended approach

Use **WebLLM** (or an equivalent WebGPU pipeline) in the **Electron renderer**, with a **single small instruct model** (quantized, roughly sub-2B class—exact checkpoint chosen at implementation time based on WebLLM catalog, license, and measured cold/warm latency on Apple Silicon).

**Prompt shape:** system instructions enforcing repository commit style (imperative mood, length limits, optional Conventional Commits if that matches the repo), plus bounded staged diff text. **Post-process:** parse model output into a fixed number of candidate strings (strip code fences, split on newlines) before showing in UI.

**Git access:** reuse existing desktop patterns for invoking git from the main process or trusted bridge; the renderer receives **only the bounded diff string** (and minimal metadata such as branch name if needed and cheap).

## User experience

1. User stages files as usual.
2. In the **commit compose** surface, user clicks **Suggest commit message** (disabled when there is no staged diff).
3. First time: user sees **model loading** progress; subsequent sessions may warm faster if weights are cached under app user data.
4. User sees **N candidates** (target: three one-line subjects; optional body lines only if product style allows—default lean toward single-line subjects for speed and clarity).
5. User clicks a candidate to **fill the message field**, edits, and commits.

**Truncation:** If the staged diff exceeds the cap, show an inline note that the diff was truncated for performance so suggestions may omit tail files.

## Architecture

### Boundaries

- **Renderer:** WebLLM engine lifecycle, generation requests, UI state machine, prompt assembly from bounded diff string.
- **Main / existing git IPC:** Produce `git diff --cached` text; enforce or cooperate on **max bytes/lines** before sending to renderer to protect memory and IPC size.
- **Shared utilities:** Prompt builder and truncation helpers should be unit-tested; align mentally with `diffTruncate` / diff discipline used elsewhere in the app.

### WebGPU

- **Feature detect** WebGPU before offering the action or show a dedicated “not available” state with short guidance (Electron build, OS, or GPU limitations).
- No silent downgrade to cloud in v1.

### Caching

- Optional **content-hash cache**: if staged diff hash matches the last successful generation input, reuse last candidates until the stage changes.

## Error handling

| Condition            | Behavior                                                |
| -------------------- | ------------------------------------------------------- |
| No staged changes    | Control disabled; tooltip or helper text explains why  |
| WebGPU unavailable   | Blocking message; do not start WebLLM                  |
| Model load failure   | Inline error + retry                                   |
| Inference timeout    | Cancel + retry; preserve last good candidates if any    |
| Empty model output   | Treat as error with retry                              |

## Testing

- **Unit:** prompt builder (fixed diff → stable prompt prefix, respects max length).
- **Unit:** candidate parser (handles markdown fences, extra prose).
- **Component / integration:** state transitions for empty stage, success path (mocked engine), WebGPU missing (mocked).
- **Manual QA:** cold first load, warm second load, very large staged diff (truncation notice), WebGPU-off machine or flag.

## Open decisions (implementation time)

- Exact default model id and quantization from the WebLLM catalog after a short benchmark on target Electron + macOS hardware.
- Precise placement in the commit UI relative to existing layout components (follow current design system).

## Self-review (2026-04-14)

- No unresolved placeholders; open decisions are explicitly scoped to implementation.
- Architecture matches goals: staged-only, local WebGPU, bounded IPC.
- Scope is single-feature; sidecar and cloud are out of v1.
