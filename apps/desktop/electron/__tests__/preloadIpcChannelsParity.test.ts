import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "../ipcChannels.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("preload IPC channel strings", () => {
  it("match electron/ipcChannels.ts (preload cannot import that module under sandbox)", () => {
    const preloadSrc = readFileSync(join(__dirname, "../preload.ts"), "utf8");
    for (const v of Object.values(IPC_CHANNELS)) {
      expect(preloadSrc).toContain(`"${v}"`);
    }
  });
});
