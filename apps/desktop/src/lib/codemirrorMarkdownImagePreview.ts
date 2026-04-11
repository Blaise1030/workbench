import { RangeSetBuilder, StateField, type Extension, type Text } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

const MARKDOWN_IMAGE = /!\[[^\]]*\]\(([^)]+)\)/g;

export type MarkdownImagePreviewOptions = {
  workspaceRoot: string;
  markdownPath: string;
};

class MarkdownImageWidget extends WidgetType {
  constructor(
    readonly href: string,
    private readonly resolveUrl: (href: string) => Promise<string | null>
  ) {
    super();
  }

  eq(other: MarkdownImageWidget): boolean {
    return other instanceof MarkdownImageWidget && this.href === other.href;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-md-image-preview";
    wrap.setAttribute("contenteditable", "false");
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    img.style.display = "block";
    img.style.maxWidth = "min(100%, 32rem)";
    img.style.maxHeight = "240px";
    img.style.objectFit = "contain";
    img.style.marginTop = "6px";
    img.style.borderRadius = "4px";
    img.style.border = "1px solid color-mix(in oklab, var(--border) 75%, transparent)";
    void this.resolveUrl(this.href).then((url) => {
      if (url) img.src = url;
    });
    wrap.appendChild(img);
    return wrap;
  }

  ignoreEvent(): boolean {
    return true;
  }

  get estimatedHeight(): number {
    return 128;
  }
}

function buildDecorations(
  doc: Text,
  resolveUrl: (href: string) => Promise<string | null>
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    MARKDOWN_IMAGE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MARKDOWN_IMAGE.exec(text)) !== null) {
      const rawHref = m[1]?.trim() ?? "";
      if (!rawHref) continue;
      const end = line.from + m.index + m[0].length;
      builder.add(
        end,
        end,
        Decoration.widget({
          widget: new MarkdownImageWidget(rawHref, resolveUrl),
          block: true,
          side: 1
        })
      );
    }
  }
  return builder.finish();
}

/**
 * Renders a small preview under each `![](...)` in Markdown source when running in Electron
 * (uses `workspaceApi.resolveMarkdownImageUrl` for workspace assets as `data:` URLs).
 */
export function markdownImagePreviewExtension(opts: MarkdownImagePreviewOptions): Extension {
  const { workspaceRoot, markdownPath } = opts;

  async function resolveUrl(href: string): Promise<string | null> {
    const api = typeof window !== "undefined" ? window.workspaceApi : undefined;
    if (!api?.resolveMarkdownImageUrl) return null;
    return api.resolveMarkdownImageUrl(workspaceRoot, markdownPath, href);
  }

  const field = StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state.doc, resolveUrl);
    },
    update(decorations, tr) {
      if (!tr.docChanged) return decorations;
      return buildDecorations(tr.state.doc, resolveUrl);
    },
    provide: (f) => EditorView.decorations.from(f)
  });

  return [field];
}
