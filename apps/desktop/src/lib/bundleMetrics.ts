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
