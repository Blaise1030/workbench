import { describe, expect, it } from "vitest";
import { decodeBranch, encodeBranch } from "../branchParam";

describe("encodeBranch / decodeBranch", () => {
  it("round-trips a simple branch name", () => {
    expect(decodeBranch(encodeBranch("main"))).toBe("main");
  });

  it("encodes slashes in branch names", () => {
    const encoded = encodeBranch("feature/my-branch");
    expect(encoded).not.toContain("/");
    expect(decodeBranch(encoded)).toBe("feature/my-branch");
  });

  it("encodes spaces and special chars", () => {
    expect(decodeBranch(encodeBranch("fix #123 bug"))).toBe("fix #123 bug");
  });
});
