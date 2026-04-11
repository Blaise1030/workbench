# Workbench bundle validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automated checks and a documented manual protocol so every performance or bundle-size change has a reproducible **before/after** signal (gzip size of the shipped main chunk, optional budget gate, and optional analyzer diff).

**Architecture:** Pure TypeScript helpers under `apps/desktop/src/lib/` find `dist-electron/dist/assets/index-*.js`, measure **raw** bytes and **gzip** bytes via Node `zlib.gzipSync` (stable, scriptable; may differ slightly from Vite’s logged gzip size due to compression defaults). Vitest locks the behavior. A `tsx` CLI compares gzip to a committed JSON budget. Manual runtime validation is a short Electron DevTools checklist (no WebDriver in this plan).

**Tech Stack:** Vue / Vite 6 workbench app, Vitest, Node `fs` + `zlib`, existing `pnpm --filter workbench build` and `pnpm --filter workbench analyze`.

**Worktree:** Implement in a dedicated git worktree (superpowers:using-git-worktrees) so `dist-electron/dist` stays clean and you can compare branches without clobbering local dev output.

---

## File map

| File | Role |
|------|------|
| `apps/desktop/src/lib/bundleMetrics.ts` | `findMainIndexBundlePath`, `readMainBundleMetrics` (raw + gzip via `zlib.gzipSync` on disk bytes). |
| `apps/desktop/src/lib/__tests__/bundleMetrics.test.ts` | Vitest: temp dirs, `index-*.js` naming, gzip length parity with `zlib`. |
| `apps/desktop/scripts/verify-bundle-budget.ts` | CLI (`pnpm exec tsx`): reads `scripts/bundle-budget.json`; resolves `dist-electron/dist/assets` from `process.cwd()` — **must run with cwd = `apps/desktop`** (matches `pnpm --filter workbench run`). |
| `apps/desktop/scripts/bundle-budget.json` | `{ "maxMainJsGzipBytes": N }`; pin `N` in Task 4 as `ceil(measuredGzip * 1.02)`. |
| `apps/desktop/package.json` | DevDependency `tsx`; script `verify:bundle-budget` = `pnpm run build && pnpm exec tsx scripts/verify-bundle-budget.ts`. |
| `docs/superpowers/specs/2026-04-11-workbench-bundle-validation.md` | Manual DevTools checklist; optional archive of `bundle-stats/report.md` after `pnpm --filter workbench analyze`. |

---

### Task 1: Failing tests for `bundleMetrics`

**Files:**
- Create: `apps/desktop/src/lib/bundleMetrics.ts`
- Create: `apps/desktop/src/lib/__tests__/bundleMetrics.test.ts`

- [ ] **Step 1: Create stub `bundleMetrics.ts` (exports throw)**

```typescript
// apps/desktop/src/lib/bundleMetrics.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

export function findMainIndexBundlePath(distAssetsDir: string): string | null {
  void distAssetsDir;
  return null;
}

export function readMainBundleMetrics(distAssetsDir: string): {
  filePath: string;
  rawBytes: number;
  gzipBytes: number;
} {
  void distAssetsDir;
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Write failing test file**

```typescript
// apps/desktop/src/lib/__tests__/bundleMetrics.test.ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { findMainIndexBundlePath, readMainBundleMetrics } from "../bundleMetrics";

describe("findMainIndexBundlePath", () => {
  it("returns null when no index-*.js exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "bm-"));
    writeFileSync(join(dir, "other.js"), "x");
    expect(findMainIndexBundlePath(dir)).toBeNull();
  });

  it("returns path to index-<hash>.js when present", () => {
    const dir = mkdtempSync(join(tmpdir(), "bm-"));
    const name = "index-ABC123.js";
    writeFileSync(join(dir, name), "console.log(1)");
    expect(findMainIndexBundlePath(dir)).toBe(join(dir, name));
  });

  it("ignores index.js without hash segment", () => {
    const dir = mkdtempSync(join(tmpdir(), "bm-"));
    writeFileSync(join(dir, "index.js"), "x");
    expect(findMainIndexBundlePath(dir)).toBeNull();
  });
});

describe("readMainBundleMetrics", () => {
  it("matches zlib gzip length for file contents", () => {
    const dir = mkdtempSync(join(tmpdir(), "bm-"));
    const body = "export const x = () => 'hello';".repeat(400);
    const name = "index-TEST.js";
    writeFileSync(join(dir, name), body);
    const m = readMainBundleMetrics(dir);
    expect(m.filePath).toBe(join(dir, name));
    expect(m.rawBytes).toBe(Buffer.byteLength(body, "utf8"));
    expect(m.gzipBytes).toBe(gzipSync(Buffer.from(body, "utf8")).length);
  });

  it("throws when no main bundle", () => {
    const dir = mkdtempSync(join(tmpdir(), "bm-"));
    expect(() => readMainBundleMetrics(dir)).toThrow(/No index-/);
  });
});
```

- [ ] **Step 3: Run Vitest (expect failures)**

```bash
cd /Users/blaisetiong/Developer/instrument && pnpm --filter workbench exec vitest run src/lib/__tests__/bundleMetrics.test.ts
```

Expected: **FAIL** — `findMainIndexBundlePath` returns `null` where a path is expected; `readMainBundleMetrics` throws `"not implemented"` on the gzip test.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/lib/bundleMetrics.ts apps/desktop/src/lib/__tests__/bundleMetrics.test.ts
git commit -m "test: add bundle metrics harness (failing)"
```

---

### Task 2: Implement `bundleMetrics`

**Files:**
- Modify: `apps/desktop/src/lib/bundleMetrics.ts`

- [ ] **Step 1: Replace file contents**

```typescript
// apps/desktop/src/lib/bundleMetrics.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const INDEX_CHUNK = /^index-.+\.js$/;

export function findMainIndexBundlePath(distAssetsDir: string): string | null {
  const names = readdirSync(distAssetsDir);
  const hit = names.find((n) => INDEX_CHUNK.test(n));
  return hit ? join(distAssetsDir, hit) : null;
}

export function readMainBundleMetrics(distAssetsDir: string): {
  filePath: string;
  rawBytes: number;
  gzipBytes: number;
} {
  const filePath = findMainIndexBundlePath(distAssetsDir);
  if (!filePath) {
    throw new Error(`No index-*.js in ${distAssetsDir}; run pnpm --filter workbench build first`);
  }
  const buf = readFileSync(filePath);
  return {
    filePath,
    rawBytes: buf.length,
    gzipBytes: gzipSync(buf).length
  };
}
```

- [ ] **Step 2: Run Vitest (expect pass)**

```bash
cd /Users/blaisetiong/Developer/instrument && pnpm --filter workbench exec vitest run src/lib/__tests__/bundleMetrics.test.ts
```

Expected: **PASS** (3 tests in `findMainIndexBundlePath` + 2 in `readMainBundleMetrics`).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/lib/bundleMetrics.ts
git commit -m "feat: bundle metrics helper for main Vite chunk"
```

---

### Task 3: CLI verifier + `tsx`

**Files:**
- Modify: `apps/desktop/package.json`
- Create: `apps/desktop/scripts/verify-bundle-budget.ts`
- Create: `apps/desktop/scripts/bundle-budget.json` (placeholder; Task 4 sets number)

- [ ] **Step 1: Add devDependency**

From repo root:

```bash
pnpm add -D tsx --filter workbench
```

- [ ] **Step 2: Create `bundle-budget.json` (temporary ceiling)**

Use `999999999` until Task 4 pins real value:

```json
{
  "maxMainJsGzipBytes": 999999999
}
```

- [ ] **Step 3: Create `scripts/verify-bundle-budget.ts`**

```typescript
// apps/desktop/scripts/verify-bundle-budget.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readMainBundleMetrics } from "../src/lib/bundleMetrics";

const root = process.cwd();
const budgetPath = join(root, "scripts", "bundle-budget.json");
const distAssets = join(root, "dist-electron", "dist", "assets");

const { maxMainJsGzipBytes } = JSON.parse(readFileSync(budgetPath, "utf8")) as {
  maxMainJsGzipBytes: number;
};

const m = readMainBundleMetrics(distAssets);
console.log(
  `Main chunk: ${m.filePath}\n  raw: ${m.rawBytes} B\n  gzip: ${m.gzipBytes} B\n  budget max gzip: ${maxMainJsGzipBytes} B`
);

if (m.gzipBytes > maxMainJsGzipBytes) {
  console.error("Bundle gzip budget exceeded.");
  process.exit(1);
}
```

- [ ] **Step 4: Add package script**

In `apps/desktop/package.json` `"scripts"` add:

```json
"verify:bundle-budget": "pnpm run build && pnpm exec tsx scripts/verify-bundle-budget.ts"
```

- [ ] **Step 5: Run verifier (expect pass with loose budget)**

```bash
cd /Users/blaisetiong/Developer/instrument && pnpm --filter workbench run verify:bundle-budget
```

Expected: exit code **0**, console shows gzip line.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/package.json apps/desktop/scripts/verify-bundle-budget.ts apps/desktop/scripts/bundle-budget.json pnpm-lock.yaml
git commit -m "chore: bundle gzip budget verifier"
```

---

### Task 4: Pin real budget from current `build`

**Files:**
- Modify: `apps/desktop/scripts/bundle-budget.json`

- [ ] **Step 1: Capture gzip bytes**

`pnpm --filter workbench` runs lifecycle scripts with **cwd = `apps/desktop`**, same as the verifier.

```bash
cd /Users/blaisetiong/Developer/instrument/apps/desktop && pnpm run build && pnpm exec tsx -e "
import { readMainBundleMetrics } from './src/lib/bundleMetrics.ts';
import { join } from 'node:path';
const d = join(process.cwd(), 'dist-electron/dist/assets');
console.log(readMainBundleMetrics(d).gzipBytes);
"
```

Expected: prints one integer (example shape: `640000`; exact value depends on your tree and Node `zlib`).

- [ ] **Step 2: Set budget to `ceil(measured * 1.02)`** (2% headroom for noise)

If measured `G`, set `maxMainJsGzipBytes` to `Math.ceil(G * 1.02)` in `bundle-budget.json`.

- [ ] **Step 3: Run gate**

```bash
cd /Users/blaisetiong/Developer/instrument && pnpm --filter workbench run verify:bundle-budget
```

Expected: **PASS**.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/scripts/bundle-budget.json
git commit -m "chore: pin initial bundle gzip budget"
```

---

### Task 5: Manual runtime validation spec

**Files:**
- Create: `docs/superpowers/specs/2026-04-11-workbench-bundle-validation.md`

- [ ] **Step 1: Write spec document**

````markdown
# Workbench performance validation (manual)

## When to run

After any change meant to improve **Time to Interactive**, **scroll**, **terminal**, or **memory** — not only bundle size.

## Environment

Same machine, quit other heavy apps, production build (`pnpm --filter workbench build` then run Electron packaged or `pnpm run dev:electron` against production `dist` if that matches your release path).

## DevTools — Performance

1. Open the workbench window → **View → Toggle Developer Tools** (or platform equivalent).
2. **Performance** tab → click **Record**.
3. Execute this script once (same order every time):
   - Wait 3 s idle from load.
   - Open workspace / project (or reload with project already open).
   - Open a medium file in the editor; scroll 5 s.
   - Toggle terminal panel off/on twice; type one command; wait for output.
   - Switch thread / tab twice.
4. Stop recording.
5. Save trace JSON (export) into `docs/superpowers/perf-traces/YYYY-MM-DD-before.json` or `after.json` (create folder if missing).

**Compare:** total wall time for the window, **Scripting** slice, and count of **long tasks** (>50 ms).

## DevTools — Memory

1. **Memory** tab → **Heap snapshot** → **Take snapshot** (label: `before`).
2. Repeat the same UI script as above.
3. Second snapshot (`after`).

**Compare:** constructor counts for `Array`, `system / Context`, and detached DOM nodes if any optimization targeted leaks.

## Analyzer diff (optional)

```bash
pnpm --filter workbench analyze
```

Copy `apps/desktop/bundle-stats/report.md` to a dated filename outside gitignore (e.g. `docs/superpowers/perf-traces/report-2026-04-11-before.md`). Repeat after the change; diff Top 10 tables.
````

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-04-11-workbench-bundle-validation.md
git commit -m "docs: manual perf validation for workbench"
```

---

## Self-review

| Spec item | Task |
|-----------|------|
| Reproducible gzip before/after | Tasks 1–4 |
| Automated gate | Tasks 3–4 |
| Manual runtime | Task 5 |
| Analyzer archive | Task 5 doc |

**Placeholder scan:** None intentional; budget numeric comes from Task 4 measurement.

**Type consistency:** `readMainBundleMetrics` / `bundle-budget.json` field `maxMainJsGzipBytes` used consistently in `verify-bundle-budget.ts`.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-11-workbench-bundle-validation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. **REQUIRED SUB-SKILL:** superpowers:subagent-driven-development

**2. Inline Execution** — Execute tasks in this session using superpowers:executing-plans with checkpoints for review.

**Which approach?**
