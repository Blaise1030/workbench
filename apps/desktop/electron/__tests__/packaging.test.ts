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

  it("is organized as a pnpm workspace with the desktop app in apps/desktop", () => {
    const workspaceRoot = path.resolve(process.cwd(), "../..");
    const rootPackagePath = path.resolve(workspaceRoot, "package.json");
    const workspaceFilePath = path.resolve(workspaceRoot, "pnpm-workspace.yaml");
    const desktopPackagePath = path.resolve(process.cwd(), "package.json");

    expect(fs.existsSync(workspaceFilePath)).toBe(true);
    expect(fs.existsSync(desktopPackagePath)).toBe(true);

    const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, "utf8")) as {
      packageManager?: string;
      private?: boolean;
      scripts?: Record<string, string>;
    };
    const desktopPackage = JSON.parse(fs.readFileSync(desktopPackagePath, "utf8")) as {
      name?: string;
      scripts?: Record<string, string>;
    };

    expect(rootPackage.private).toBe(true);
    expect(rootPackage.packageManager).toMatch(/^pnpm@/);
    expect(rootPackage.scripts?.dev).toContain("--filter");
    expect(rootPackage.scripts?.build).toContain("--filter");
    expect(rootPackage.scripts?.test).toContain("--filter");

    expect(desktopPackage.name).toBe("workbench");
    expect(desktopPackage.scripts?.dev).toContain("runViteDev.cjs");
    expect(desktopPackage.scripts?.build).toContain("vite build");
  });
});
