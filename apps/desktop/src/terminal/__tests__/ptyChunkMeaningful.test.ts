import { describe, expect, it } from "vitest";
import {
  hasMeaningfulPtyOutput,
  isCarriageReturnRedraw,
  stripTerminalControlNoise
} from "../ptyChunkMeaningful";

describe("ptyChunkMeaningful", () => {
  it("treats CSI-only chunks as empty", () => {
    expect(hasMeaningfulPtyOutput("\x1b[2J\x1b[H")).toBe(false);
    expect(stripTerminalControlNoise("\x1b[2J\x1b[H")).toBe("");
  });

  it("keeps visible text after stripping escapes", () => {
    expect(hasMeaningfulPtyOutput("\x1b[32mok\x1b[0m")).toBe(true);
  });

  it("treats carriage-return redraws as non-meaningful activity", () => {
    expect(isCarriageReturnRedraw("Loading...\r")).toBe(true);
    expect(hasMeaningfulPtyOutput("Loading...\r")).toBe(false);
    expect(hasMeaningfulPtyOutput("\x1b[32mLoading...\x1b[0m\r")).toBe(false);
  });

  it("does not suppress normal newline-terminated output", () => {
    expect(isCarriageReturnRedraw("Loading...\r\n")).toBe(false);
    expect(hasMeaningfulPtyOutput("Loading...\r\n")).toBe(true);
  });
});
