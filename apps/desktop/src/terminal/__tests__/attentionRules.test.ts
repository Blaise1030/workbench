import { describe, expect, it } from "vitest";
import {
  chunkContainsBell,
  chunkHasNonBellContent,
  type TerminalActivitySensitivity,
  decideTerminalAttentionChunk,
  visibleTerminalSessionId
} from "../attentionRules";

describe("chunkContainsBell", () => {
  it("is true for BEL only", () => {
    expect(chunkContainsBell("\x07")).toBe(true);
  });
  it("is false without BEL", () => {
    expect(chunkContainsBell("hello")).toBe(false);
  });
  it("is true when BEL is embedded", () => {
    expect(chunkContainsBell("a\x07b")).toBe(true);
  });
});

describe("chunkHasNonBellContent", () => {
  const low: TerminalActivitySensitivity = "low";
  it("is false for BEL only", () => {
    expect(chunkHasNonBellContent("\x07", low)).toBe(false);
    expect(chunkHasNonBellContent("\x07\x07", low)).toBe(false);
  });
  it("is true when non-BEL follows BEL", () => {
    expect(chunkHasNonBellContent("\x07a", low)).toBe(true);
  });
  it("is true when non-BELL precedes BEL", () => {
    expect(chunkHasNonBellContent("a\x07", low)).toBe(true);
  });
  it("ignores cursor/reflow noise regardless of sensitivity", () => {
    expect(chunkHasNonBellContent("\x1b[2J\x1b[H\x1b[?25h", "low")).toBe(false);
    expect(chunkHasNonBellContent("\x1b[2J\x1b[H\x1b[?25h", "high")).toBe(false);
  });
  it("requires larger chunks at higher sensitivity", () => {
    expect(chunkHasNonBellContent("ok", "low")).toBe(true);
    expect(chunkHasNonBellContent("ok", "medium")).toBe(false);
    expect(chunkHasNonBellContent("running...", "medium")).toBe(true);
    expect(chunkHasNonBellContent("running...", "high")).toBe(false);
  });
});

describe("visibleTerminalSessionId", () => {
  it("returns null when worktree is missing", () => {
    expect(visibleTerminalSessionId("t1", null)).toBe(null);
    expect(visibleTerminalSessionId("t1", undefined)).toBe(null);
    expect(visibleTerminalSessionId("t1", "")).toBe(null);
  });
  it("returns thread id when activeThreadId is set", () => {
    expect(visibleTerminalSessionId("thread-a", "wt1")).toBe("thread-a");
  });
  it("returns __wt prefix when thread id empty or null", () => {
    expect(visibleTerminalSessionId(null, "wt1")).toBe("__wt:wt1");
    expect(visibleTerminalSessionId("", "wt1")).toBe("__wt:wt1");
  });
});

describe("decideTerminalAttentionChunk", () => {
  const base = {
    sessionId: "s1",
    visibleSessionId: "s1" as string | null,
    bellEnabled: true,
    backgroundEnabled: true,
    backgroundArmed: true,
    activitySensitivity: "low" as TerminalActivitySensitivity
  };

  it("in-view + BEL: no sound (user is already on this tab)", () => {
    const r = decideTerminalAttentionChunk({
      ...base,
      data: "\x07",
      visibleSessionId: "s1"
    });
    expect(r.playSound).toBe(false);
    expect(r.consumedBackgroundOneShot).toBe(false);
  });

  it("not-in-view + BEL only: bell fires, background does not (BEL-only)", () => {
    const r = decideTerminalAttentionChunk({
      ...base,
      data: "\x07",
      visibleSessionId: "other"
    });
    expect(r.playSound).toBe(true);
    expect(r.consumedBackgroundOneShot).toBe(false);
  });

  it("not-in-view + text + armed: background fires and consumes one-shot", () => {
    const r = decideTerminalAttentionChunk({
      ...base,
      data: "out",
      visibleSessionId: "other"
    });
    expect(r.playSound).toBe(true);
    expect(r.consumedBackgroundOneShot).toBe(true);
  });

  it("not-in-view + text + disarmed: no sound", () => {
    const r = decideTerminalAttentionChunk({
      ...base,
      data: "out",
      visibleSessionId: "other",
      backgroundArmed: false
    });
    expect(r.playSound).toBe(false);
    expect(r.consumedBackgroundOneShot).toBe(false);
  });

  it("not-in-view + text+bell + armed: one sound, consumes background one-shot", () => {
    const r = decideTerminalAttentionChunk({
      ...base,
      data: "x\x07",
      visibleSessionId: "other"
    });
    expect(r.playSound).toBe(true);
    expect(r.consumedBackgroundOneShot).toBe(true);
  });

  it("respects disabled bell", () => {
    const r = decideTerminalAttentionChunk({
      ...base,
      data: "\x07",
      visibleSessionId: "other",
      bellEnabled: false
    });
    expect(r.playSound).toBe(false);
  });

  it("respects disabled background", () => {
    const r = decideTerminalAttentionChunk({
      ...base,
      data: "x",
      visibleSessionId: "other",
      backgroundEnabled: false,
      bellEnabled: false
    });
    expect(r.playSound).toBe(false);
  });

  it("does not fire background sound for tiny output on medium/high sensitivity", () => {
    const medium = decideTerminalAttentionChunk({
      ...base,
      data: "ok",
      visibleSessionId: "other",
      activitySensitivity: "medium"
    });
    const high = decideTerminalAttentionChunk({
      ...base,
      data: "running...",
      visibleSessionId: "other",
      activitySensitivity: "high"
    });
    expect(medium.playSound).toBe(false);
    expect(medium.consumedBackgroundOneShot).toBe(false);
    expect(high.playSound).toBe(false);
    expect(high.consumedBackgroundOneShot).toBe(false);
  });
});
