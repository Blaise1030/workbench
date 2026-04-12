import { describe, it, expect } from "vitest";
import { isValidBranchName } from "../services/gitAdapter.js";

describe("isValidBranchName", () => {
  it("accepts a normal branch name", () => {
    expect(isValidBranchName("feat/my-feature")).toBe(true);
  });

  it("accepts a branch with dots and numbers", () => {
    expect(isValidBranchName("release-1.2.3")).toBe(true);
  });

  it("rejects a branch name starting with -", () => {
    expect(isValidBranchName("-f")).toBe(false);
  });

  it("rejects --detach", () => {
    expect(isValidBranchName("--detach")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidBranchName("")).toBe(false);
  });

  it("rejects branch names with spaces", () => {
    expect(isValidBranchName("my branch")).toBe(false);
  });
});
