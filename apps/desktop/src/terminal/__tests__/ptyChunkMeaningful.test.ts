import { describe, expect, it } from "vitest";
import { hasMeaningfulPtyOutput, stripTerminalControlNoise } from "../ptyChunkMeaningful";

describe("ptyChunkMeaningful", () => {
  it("treats CSI-only chunks as empty", () => {
    expect(hasMeaningfulPtyOutput("\x1b[2J\x1b[H")).toBe(false);
    expect(stripTerminalControlNoise("\x1b[2J\x1b[H")).toBe("");
  });

  it("keeps visible text after stripping escapes", () => {
    expect(hasMeaningfulPtyOutput("\x1b[32mok\x1b[0m")).toBe(true);
  });
});
