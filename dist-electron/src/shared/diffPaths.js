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
 */
function pathsFromUnifiedDiff(unified) {
    const seen = new Set();
    const out = [];
    for (const line of unified.split("\n")) {
        if (!line.startsWith("diff --git "))
            continue;
        const i = line.lastIndexOf(" b/");
        if (i < 0)
            continue;
        let p = line.slice(i + 3);
        if (p.startsWith('"')) {
            const end = p.lastIndexOf('"');
            if (end > 0)
                p = p.slice(1, end);
        }
        if (seen.has(p))
            continue;
        seen.add(p);
        out.push(p);
    }
    return out;
}
function pathsFromUnifiedDiffSet(unified) {
    return new Set(pathsFromUnifiedDiff(unified));
}
