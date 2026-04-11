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
