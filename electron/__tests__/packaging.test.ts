import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("electron-builder packaging metadata", () => {
  it("uses a productName that does not end with punctuation", () => {
    const configPath = path.resolve(process.cwd(), "electron-builder.yml");
    const config = fs.readFileSync(configPath, "utf8");
    const productNameLine = config
      .split(/\r?\n/)
      .find((line) => line.trimStart().startsWith("productName:"));

    expect(productNameLine).toBeDefined();
    expect(productNameLine).toMatch(/^productName:\s+\S.*[A-Za-z0-9"]\s*$/);
  });
});
