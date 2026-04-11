import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThreadImageBadge } from "@/lib/threadCreateEditorExtensions";
import { docPosAtFlatOffset, promptDocFlatText, promptFlatOffsetAtDocPos, replaceFlatRange } from "@/lib/threadCreateTipTap";

describe("threadCreateTipTap", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit],
      content: "<p>ab</p><p>c</p>"
    });
  });

  afterEach(() => {
    editor.destroy();
  });

  it("serializes paragraphs with newline block separator", () => {
    expect(promptDocFlatText(editor.state.doc)).toBe("ab\nc");
  });

  it("round-trips flat offset through doc positions", () => {
    const doc = editor.state.doc;
    const flatLen = promptDocFlatText(doc).length;
    for (let o = 0; o <= flatLen; o++) {
      const pos = docPosAtFlatOffset(doc, o);
      expect(promptFlatOffsetAtDocPos(doc, pos)).toBe(o);
    }
  });

  it("replaceFlatRange removes a trailing @segment like mention pick", () => {
    editor.commands.setContent("<p>hi @x</p>");
    const text = promptDocFlatText(editor.state.doc);
    const at = text.indexOf("@");
    expect(at).toBeGreaterThanOrEqual(0);
    replaceFlatRange(editor, at, text.length, "");
    expect(promptDocFlatText(editor.state.doc)).toMatch(/^hi\s*$/);
  });

  it("ThreadImageBadge renderHTML includes the file name in the DOM", () => {
    const ed = new Editor({
      extensions: [StarterKit, ThreadImageBadge],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "threadImageBadge",
                attrs: {
                  path: "/var/folders/x/Screenshot 2026-04-12 at 1.15.55 AM.png",
                  name: "Screenshot 2026-04-12 at 1.15.55 AM.png"
                }
              }
            ]
          }
        ]
      }
    });
    expect(ed.getHTML()).toContain("Screenshot 2026-04-12 at 1.15.55 AM.png");
    ed.destroy();
  });
});
