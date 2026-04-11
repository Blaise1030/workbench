import { describe, expect, it } from "vitest";
import { formatFolderListingFromFiles } from "../folderListing";

describe("formatFolderListingFromFiles", () => {
  it("lists shallow files under folder", () => {
    const text = formatFolderListingFromFiles(
      "src",
      [
        { relativePath: "src/a.ts", size: 1, modifiedAt: 0 },
        { relativePath: "src/b.ts", size: 1, modifiedAt: 0 },
        { relativePath: "other/x.ts", size: 1, modifiedAt: 0 }
      ],
      { maxDepth: 2, maxEntries: 50 }
    );
    expect(text).toContain("a.ts");
    expect(text).toContain("b.ts");
    expect(text).not.toContain("other");
  });

  it("truncates at maxEntries", () => {
    const files = Array.from({ length: 60 }, (_, i) => ({
      relativePath: `src/f${i}.ts`,
      size: 1,
      modifiedAt: 0
    }));
    const text = formatFolderListingFromFiles("src", files, { maxDepth: 2, maxEntries: 5 });
    expect(text).toContain("… (truncated)");
    const lineCount = text.split("\n").length;
    expect(lineCount).toBeLessThanOrEqual(6);
  });
});
