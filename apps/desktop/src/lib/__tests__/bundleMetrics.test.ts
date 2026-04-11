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
