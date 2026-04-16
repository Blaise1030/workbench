import { describe, expect, it } from "vitest";
import {
  isValidPersistedResumeId,
  isValidResumeSessionId,
  RESUME_SESSION_ID_LENGTH
} from "../resumeSessionId";

describe("isValidResumeSessionId", () => {
  it("accepts a canonical UUID (example from product)", () => {
    expect(isValidResumeSessionId("cb1438da-39bb-4f7f-8108-510fe91963e1")).toBe(true);
  });

  it("accepts uppercase hex", () => {
    expect(isValidResumeSessionId("CB1438DA-39BB-4F7F-8108-510FE91963E1")).toBe(true);
  });

  it("trims whitespace before checking", () => {
    expect(isValidResumeSessionId("  cb1438da-39bb-4f7f-8108-510fe91963e1  ")).toBe(true);
  });

  it("rejects wrong length", () => {
    expect(isValidResumeSessionId("cb1438da-39bb-4f7f-8108-510fe91963e")).toBe(false);
    expect(RESUME_SESSION_ID_LENGTH).toBe(36);
  });

  it("rejects non-UUID tokens", () => {
    expect(isValidResumeSessionId("session-abc-123")).toBe(false);
    expect(isValidResumeSessionId("550e8400e29b41d4a716446655440000")).toBe(false);
  });

  it("rejects empty or garbage", () => {
    expect(isValidResumeSessionId("")).toBe(false);
    expect(isValidResumeSessionId("not-a-uuid-at-all-here-ok")).toBe(false);
  });
});

describe("isValidPersistedResumeId", () => {
  it("accepts UUIDs", () => {
    expect(isValidPersistedResumeId("cb1438da-39bb-4f7f-8108-510fe91963e1")).toBe(true);
  });

  it("accepts opaque hook/CLI tokens (Cursor SessionStart, etc.)", () => {
    expect(isValidPersistedResumeId("sid-cursor")).toBe(true);
    expect(isValidPersistedResumeId("session-abc-123")).toBe(true);
  });

  it("rejects shell-unsafe or garbage tokens", () => {
    expect(isValidPersistedResumeId("bad;id")).toBe(false);
    expect(isValidPersistedResumeId("a/b")).toBe(false);
    expect(isValidPersistedResumeId("$(x)")).toBe(false);
    expect(isValidPersistedResumeId("ab")).toBe(false);
  });
});
