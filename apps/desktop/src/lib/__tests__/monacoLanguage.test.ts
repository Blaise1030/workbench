import { describe, expect, it } from "vitest";
import { monacoLanguageIdFromPath } from "../monacoLanguage";

describe("monacoLanguageIdFromPath", () => {
  it("returns typescript for .ts files", () => {
    expect(monacoLanguageIdFromPath("src/foo.ts")).toBe("typescript");
  });
  it("returns typescript for .tsx files", () => {
    expect(monacoLanguageIdFromPath("src/App.tsx")).toBe("typescript");
  });
  it("returns javascript for .js files", () => {
    expect(monacoLanguageIdFromPath("src/foo.js")).toBe("javascript");
  });
  it("returns html for .vue files", () => {
    expect(monacoLanguageIdFromPath("src/Foo.vue")).toBe("html");
  });
  it("returns json for .json files", () => {
    expect(monacoLanguageIdFromPath("package.json")).toBe("json");
  });
  it("returns markdown for .md files", () => {
    expect(monacoLanguageIdFromPath("README.md")).toBe("markdown");
  });
  it("returns css for .css files", () => {
    expect(monacoLanguageIdFromPath("styles.css")).toBe("css");
  });
  it("returns scss for .scss files", () => {
    expect(monacoLanguageIdFromPath("styles.scss")).toBe("scss");
  });
  it("returns python for .py files", () => {
    expect(monacoLanguageIdFromPath("script.py")).toBe("python");
  });
  it("returns rust for .rs files", () => {
    expect(monacoLanguageIdFromPath("main.rs")).toBe("rust");
  });
  it("returns go for .go files", () => {
    expect(monacoLanguageIdFromPath("main.go")).toBe("go");
  });
  it("returns plaintext for unknown extensions", () => {
    expect(monacoLanguageIdFromPath("Makefile")).toBe("plaintext");
    expect(monacoLanguageIdFromPath("file.xyz")).toBe("plaintext");
  });
});
