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
