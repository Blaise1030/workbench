"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.looksLikeUnifiedDiff = looksLikeUnifiedDiff;
exports.pathsFromUnifiedDiff = pathsFromUnifiedDiff;
exports.pathsFromUnifiedDiffSet = pathsFromUnifiedDiffSet;
function looksLikeUnifiedDiff(text) {
    const t = text.trim();
    if (!t)
        return false;
    return t.includes("diff --git ") || /^---\s+/m.test(t);
}
/**
 * Paths from `diff --git a/... b/<path>` lines (best-effort; matches normal git output).
 * Order preserved; duplicates collapsed.
 * Scans without `split("\n")` so multi‑MB diffs do not allocate one string per line.
 */
function pathsFromUnifiedDiff(unified) {
    const seen = new Set();
    const out = [];
    let start = 0;
    const len = unified.length;
    while (start < len) {
        const nl = unified.indexOf("\n", start);
        const lineEnd = nl === -1 ? len : nl;
        if (lineEnd - start >= 12 && unified.startsWith("diff --git ", start)) {
            const line = unified.slice(start, lineEnd);
            const i = line.lastIndexOf(" b/");
            if (i >= 0) {
                let p = line.slice(i + 3);
                if (p.startsWith('"')) {
                    const end = p.lastIndexOf('"');
                    if (end > 0)
                        p = p.slice(1, end);
                }
                if (!seen.has(p)) {
                    seen.add(p);
                    out.push(p);
                }
            }
        }
        if (nl === -1)
            break;
        start = nl + 1;
    }
    return out;
}
function pathsFromUnifiedDiffSet(unified) {
    return new Set(pathsFromUnifiedDiff(unified));
}
