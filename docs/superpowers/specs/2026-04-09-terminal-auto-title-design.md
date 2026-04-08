# Terminal-Summarized Thread Title (One-Time) — Design Spec

## Summary

When a thread still has a **generic** title (created without a meaningful first-line prompt title), the app may run a **lightweight** summarizer over a **trimmed** excerpt of integrated-terminal output and **rename the thread once**. After that single automatic rename, the thread title is never updated by this pipeline again. Manual renames are always respected; this feature does not run repeatedly or overwrite user-chosen titles.

## Relationship to Existing Behavior

- Thread titles today are set at creation via `resolveNewThreadTitle` in `WorkspaceLayout.vue`: explicit `threadTitle`, else first line of prompt, else `defaultTitleForAgent(agent)` (agent label, optionally with a timestamp when multiple same-agent threads exist).
- `ThreadSession` already tracks `titleCapturedAt` and related session metadata; terminal resume work focused on **prompt-derived** titles. This spec adds an optional **terminal-output-derived** title **only** when the creation-time title was generic.

## Key Decisions

| Decision | Choice |
|----------|--------|
| How many auto-renames | **One** per thread, ever |
| When eligible | Title at creation was **generic** (see below) |
| After the one rename | Never auto-rename again for that thread |
| Input to summarizer | Trimmed terminal text: ANSI stripped, max length cap, optional simple redaction rules |
| Summarizer implementation | Pluggable: small local model **or** short cloud completion; product decision on privacy vs quality |
| User visibility | Optional: brief non-blocking indicator when title was auto-set (implementation detail) |

## Definition of “Generic” Title

A thread qualifies for the one-time terminal title **only if** at creation the resolved title was the **default agent title** path—i.e. `resolveNewThreadTitle` would return `defaultTitleForAgent(agent)` because there was no explicit `threadTitle` and no usable first line of prompt (empty or attachment-only flows that fall through to default).

**Does not qualify:** User-visible first line from the prompt, attachment-derived titles from `deriveThreadTitle()`, or any explicit `threadTitle` from the create dialog.

Implementation note: persist an eligibility flag at thread creation (or recompute a stable predicate from stored fields) so runtime checks stay correct after snapshot reload.

## Trigger

Run the summarizer **once**, when **all** are true:

1. Thread is still eligible (one-time flag not yet consumed).
2. Enough terminal signal exists to produce a useful title (e.g. first command **completed** with non-trivial output, or scrollback exceeds a minimum character threshold—exact threshold TBD during implementation).
3. Integrated terminal is bound to that thread (existing PTY/thread association).

Avoid firing on every keystroke: prefer **command completion** or **short idle** after output (debounce) for the **first** qualifying moment only.

## Summarization

- **Goal:** Short sidebar-friendly title (roughly one line, length cap consistent with existing title truncation elsewhere).
- **Lightweight:** Small parameter count or single short API call; fixed max tokens out.
- **Input shaping:** Last *N* lines or *K* characters of scrollback; strip ANSI; optionally collapse repeated lines.

## Privacy and Safety

- Terminal output may contain paths, tokens, or secrets. **Minimum:** length limits; **recommended:** optional patterns (env-style `KEY=`), high-entropy strings, or user-toggle “never send terminal to cloud.”
- If using a **hosted** model, document data flow in settings and default to **off** or **local-only** where product policy requires.

## Data Model

- **Consumed flag** (e.g. `terminalAutoTitleConsumedAt: string | null` on thread or session row, or reuse `metadataJson`): set when the one-time rename succeeds or when user renames before consume (see below).

**If the user renames before the trigger fires:** Do not apply terminal auto-title (consume eligibility without renaming), so manual titles are never overwritten.

## API / IPC

- Internal service: build excerpt → call summarizer adapter → `renameThread` if title changed and eligibility holds.
- No new public HTTP surface required unless summarizer is server-side.

## Edge Cases

| Case | Behavior |
|------|----------|
| Thread created with a real prompt first line | Not eligible; no terminal rename |
| Empty terminal / only prompt | Do not fire until minimum signal; if session ends with no signal, leave title or leave generic (product choice: prefer leave generic) |
| Summarizer failure | Log; do not retry automatically; optionally leave eligibility for a manual “Suggest title” later (out of scope unless added) |
| Multiple terminals per thread | Use primary/bound terminal or merge excerpts (implementation picks one consistent rule) |

## Testing

- Unit: eligibility at create time; predicate after reload.
- Integration: after simulated PTY output, at most one rename; manual rename first → no auto rename.
- No network in CI for summarizer: mock adapter.

## Non-Goals

- Continuous or periodic re-titling from terminal activity
- Full scrollback sync to cloud
- Replacing prompt-derived titles when the user already supplied a first line

## Open Points (Implementation Phase)

- Exact minimum signal threshold and debounce constants
- Summarizer adapter: local vs cloud and default in app settings
- Whether to show a one-time toast “Title set from terminal activity”
