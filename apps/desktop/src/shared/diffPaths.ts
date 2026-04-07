export function looksLikeUnifiedDiff(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return t.includes("diff --git ") || /^---\s+/m.test(t);
}

/**
 * Paths from `diff --git a/... b/<path>` lines (best-effort; matches normal git output).
 * Order preserved; duplicates collapsed.
 * Scans without `split("\n")` so multi‑MB diffs do not allocate one string per line.
 */
export function pathsFromUnifiedDiff(unified: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
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
          if (end > 0) p = p.slice(1, end);
        }
        if (!seen.has(p)) {
          seen.add(p);
          out.push(p);
        }
      }
    }
    if (nl === -1) break;
    start = nl + 1;
  }
  return out;
}

export function pathsFromUnifiedDiffSet(unified: string): Set<string> {
  return new Set(pathsFromUnifiedDiff(unified));
}
