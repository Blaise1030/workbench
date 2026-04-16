import { afterEach, describe, expect, it } from "vitest";
import {
  loadPreviewPanelDevtoolsOpen,
  loadPreviewPanelUrl,
  savePreviewPanelDevtoolsOpen,
  savePreviewPanelUrl
} from "../usePreviewPanelUrlPersistence";

describe("usePreviewPanelUrlPersistence", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("returns empty when worktree id is missing", () => {
    expect(loadPreviewPanelUrl(null)).toBe("");
    expect(loadPreviewPanelUrl(undefined)).toBe("");
  });

  it("round-trips URL per worktree", () => {
    savePreviewPanelUrl("wt-a", "http://localhost:4000");
    savePreviewPanelUrl("wt-b", "http://localhost:5000");
    expect(loadPreviewPanelUrl("wt-a")).toBe("http://localhost:4000");
    expect(loadPreviewPanelUrl("wt-b")).toBe("http://localhost:5000");
  });

  it("removes storage when saving empty string", () => {
    savePreviewPanelUrl("wt-a", "http://localhost:1");
    savePreviewPanelUrl("wt-a", "  ");
    expect(loadPreviewPanelUrl("wt-a")).toBe("");
    expect(localStorage.getItem("instrument.previewPanelUrl.wt-a")).toBeNull();
  });

  it("round-trips devtools-open state per worktree", () => {
    savePreviewPanelDevtoolsOpen("wt-a", true);
    savePreviewPanelDevtoolsOpen("wt-b", false);
    expect(loadPreviewPanelDevtoolsOpen("wt-a")).toBe(true);
    expect(loadPreviewPanelDevtoolsOpen("wt-b")).toBe(false);
  });

  it("defaults devtools-open to false when missing worktree id", () => {
    expect(loadPreviewPanelDevtoolsOpen(null)).toBe(false);
    expect(loadPreviewPanelDevtoolsOpen(undefined)).toBe(false);
  });
});
