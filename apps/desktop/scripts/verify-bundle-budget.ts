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
