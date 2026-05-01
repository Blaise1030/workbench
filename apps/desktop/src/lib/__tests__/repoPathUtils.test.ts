import { describe, expect, it } from "vitest";
import {
  displayNameFromRepoPath,
  normalizeRepoPathForCompare,
} from "../repoPathUtils";

describe("normalizeRepoPathForCompare", () => {
  it("trims outer whitespace", () => {
    expect(normalizeRepoPathForCompare("  /tmp/repo  ")).toBe("/tmp/repo");
  });

  it("removes trailing forward slashes", () => {
    expect(normalizeRepoPathForCompare("/tmp/repo/")).toBe("/tmp/repo");
    expect(normalizeRepoPathForCompare("/tmp/repo///")).toBe("/tmp/repo");
  });

  it("removes trailing backslashes", () => {
    expect(normalizeRepoPathForCompare("C:\\dev\\app\\")).toBe("C:\\dev\\app");
    expect(normalizeRepoPathForCompare("C:\\dev\\app\\\\")).toBe("C:\\dev\\app");
  });

  it("does not strip interior path segments", () => {
    expect(normalizeRepoPathForCompare("/foo/bar/baz")).toBe("/foo/bar/baz");
    expect(normalizeRepoPathForCompare("C:\\foo\\bar\\baz")).toBe(
      "C:\\foo\\bar\\baz",
    );
  });
});

describe("displayNameFromRepoPath", () => {
  it("returns last segment for Unix-style absolute paths", () => {
    expect(displayNameFromRepoPath("/Users/dev/my-app")).toBe("my-app");
    expect(displayNameFromRepoPath("/var/www/html")).toBe("html");
  });

  it("returns last segment for Windows-style paths", () => {
    expect(displayNameFromRepoPath("C:\\dev\\app")).toBe("app");
  });

  it("normalizes trailing separators before taking basename", () => {
    expect(displayNameFromRepoPath("/path/to/project/")).toBe("project");
  });
});
