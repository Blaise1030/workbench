import Mention from "@tiptap/extension-mention";
import { mergeAttributes, Node } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { PluginKey } from "@tiptap/pm/state";
import { findSuggestionMatch as defaultFindSuggestionMatch } from "@tiptap/suggestion";
import type { SuggestionMatch } from "@tiptap/suggestion";
import { VueRenderer } from "@tiptap/vue-3";
import ThreadCreateSuggestionList from "@/components/threadCreate/ThreadCreateSuggestionList.vue";
import { absolutePathInWorktree, isSkillLikePath, parseMentionAtCursor } from "@/composables/useThreadCreateMentions";
import {
  parseSlashCommandAtCursor,
  searchSlashSkills
} from "@/composables/useThreadCreatePromptCompletions";
import { promptDocFlatText, promptFlatOffsetAtDocPos } from "@/lib/threadCreateTipTap";

export const threadAtSuggestionKey = new PluginKey("threadAtSuggestion");
export const threadSlashSuggestionKey = new PluginKey("threadSlashSuggestion");

/**
 * Default TipTap suggestion matching uses `$position.nodeBefore`, which is often null when the
 * cursor sits at the end of the current text node (normal while typing). Fall back to scanning
 * the parent textblock up to the cursor so `@` / `/` triggers still resolve.
 */
function findSuggestionMatchInTextblock(
  char: string,
  $position: ResolvedPos
): SuggestionMatch | null {
  const parent = $position.parent;
  if (!parent?.isTextblock) return null;
  const blockStart = $position.start();
  const relEnd = $position.parentOffset;
  const full = parent.textContent;
  const beforeCursor = full.slice(0, relEnd);
  const triggerIdx = beforeCursor.lastIndexOf(char);
  if (triggerIdx < 0) return null;

  if (char === "/") {
    if (triggerIdx > 0) {
      const prev = beforeCursor[triggerIdx - 1];
      if (prev !== " " && prev !== "\n" && prev !== "\t") return null;
    }
    const afterSlash = beforeCursor.slice(triggerIdx + 1);
    if (afterSlash.includes("/") || afterSlash.includes("@") || /\s/.test(afterSlash)) return null;
  } else if (char === "@") {
    const afterAt = beforeCursor.slice(triggerIdx + 1);
    if (/\s/.test(afterAt)) return null;
  }

  const from = blockStart + triggerIdx;
  const to = blockStart + relEnd;
  if (!(from < $position.pos && to >= $position.pos)) return null;
  return {
    range: { from, to },
    query: beforeCursor.slice(triggerIdx + char.length),
    text: beforeCursor.slice(triggerIdx)
  };
}

function findThreadSuggestionMatch(
  config: Parameters<typeof defaultFindSuggestionMatch>[0]
): SuggestionMatch | null {
  return defaultFindSuggestionMatch(config) ?? findSuggestionMatchInTextblock(config.char, config.$position);
}

function getWorkspaceApi(): NonNullable<typeof window.workspaceApi> | null {
  return typeof window !== "undefined" && window.workspaceApi ? window.workspaceApi : null;
}

export function isThreadCreateSuggestionActive(view: EditorView): boolean {
  const a = threadAtSuggestionKey.getState(view.state) as { active?: boolean } | undefined;
  const b = threadSlashSuggestionKey.getState(view.state) as { active?: boolean } | undefined;
  return Boolean(a?.active || b?.active);
}

function placeSuggestionMenu(el: HTMLElement, clientRect: (() => DOMRect | null) | undefined): void {
  const rect = clientRect?.();
  if (!rect) return;
  el.style.position = "fixed";
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.bottom + 6}px`;
  el.style.zIndex = "200";
  el.style.minWidth = `${Math.max(200, rect.width)}px`;
}

function createSuggestionRender(variant: "slash" | "at", getLoading?: () => boolean) {
  let component: VueRenderer | null = null;
  let selectedIndex = 0;
  let lastItems: unknown[] = [];
  let pickItem: ((item: unknown) => void) | null = null;
  let lastClientRect: (() => DOMRect | null) | undefined;

  return {
    onStart(props: {
      items: unknown[];
      command: (item: unknown) => void;
      clientRect?: (() => DOMRect | null) | null;
      editor: Parameters<typeof VueRenderer>[1] extends { editor: infer E } ? E : never;
    }) {
      selectedIndex = 0;
      lastItems = props.items;
      pickItem = props.command;
      lastClientRect = props.clientRect ?? undefined;
      component = new VueRenderer(ThreadCreateSuggestionList, {
        editor: props.editor,
        props: {
          variant,
          items: props.items,
          selectedIndex: 0,
          loading: getLoading?.() ?? false,
          onPick: (idx: number) => {
            const item = lastItems[idx];
            if (item) pickItem?.(item);
          }
        }
      });
      const el = component.element;
      if (el) document.body.appendChild(el);
      if (component.element) placeSuggestionMenu(component.element as HTMLElement, lastClientRect);
    },
    onUpdate(props: {
      items: unknown[];
      command: (item: unknown) => void;
      clientRect?: (() => DOMRect | null) | null;
      editor: Parameters<typeof VueRenderer>[1] extends { editor: infer E } ? E : never;
    }) {
      lastItems = props.items;
      pickItem = props.command;
      lastClientRect = props.clientRect ?? undefined;
      selectedIndex = Math.min(selectedIndex, Math.max(0, props.items.length - 1));
      component?.updateProps({
        variant,
        items: props.items,
        selectedIndex,
        loading: getLoading?.() ?? false,
        onPick: (idx: number) => {
          const item = lastItems[idx];
          if (item) pickItem?.(item);
        }
      });
      if (component?.element) placeSuggestionMenu(component.element as HTMLElement, lastClientRect);
    },
    onExit() {
      component?.destroy();
      component = null;
      lastItems = [];
      pickItem = null;
    },
    onKeyDown({ event }: { event: KeyboardEvent }) {
      if (lastItems.length === 0) return false;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, lastItems.length - 1);
        component?.updateProps({ selectedIndex });
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        component?.updateProps({ selectedIndex });
        return true;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const item = lastItems[selectedIndex];
        if (item) pickItem?.(item);
        return true;
      }
      return false;
    }
  };
}

export const ThreadImageBadge = Node.create({
  name: "threadImageBadge",
  group: "inline",
  inline: true,
  atom: true,
  draggable: false,
  addAttributes() {
    return {
      path: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-path") ?? "",
        renderHTML: (attrs) => (attrs.path ? { "data-path": attrs.path } : {})
      },
      name: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-name") ?? "",
        renderHTML: (attrs) => (attrs.name ? { "data-name": attrs.name } : {})
      }
    };
  },
  parseHTML() {
    return [{ tag: "span[data-thread-image-badge]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    // Use node.attrs: merged HTMLAttributes only carry DOM keys (e.g. data-name), not `name`.
    const displayName = String(node.attrs.name ?? "");
    return [
      "span",
      mergeAttributes(
        {
          "data-thread-image-badge": "1",
          class:
            "thread-image-badge inline-flex max-w-[14rem] items-center gap-1 rounded-full border border-border/60 bg-muted/80 px-2 py-0.5 align-middle text-[11px] text-foreground"
        },
        HTMLAttributes
      ),
      ["span", { "aria-hidden": "true", class: "text-[13px] leading-none" }, "🖼️"],
      ["span", { class: "min-w-0 truncate font-mono font-medium" }, displayName]
    ];
  },
  renderText({ node }) {
    return `🖼️ ${node.attrs.name || ""}`;
  }
});

/** Non-image file attached via paperclip / drag — inline path chip (same attachment pipeline as image badges). */
export const ThreadFileBadge = Node.create({
  name: "threadFileBadge",
  group: "inline",
  inline: true,
  atom: true,
  draggable: false,
  addAttributes() {
    return {
      path: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-path") ?? "",
        renderHTML: (attrs) => (attrs.path ? { "data-path": attrs.path } : {})
      },
      name: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-name") ?? "",
        renderHTML: (attrs) => (attrs.name ? { "data-name": attrs.name } : {})
      }
    };
  },
  parseHTML() {
    return [{ tag: "span[data-thread-file-badge]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const path = String(node.attrs.path ?? "");
    const display = path.length > 56 ? `${path.slice(0, 28)}…${path.slice(-24)}` : path;
    return [
      "span",
      mergeAttributes(
        {
          "data-thread-file-badge": "1",
          class:
            "thread-file-badge inline-flex max-w-[min(20rem,92vw)] items-center gap-1 rounded-full border border-border/60 bg-muted/75 px-2 py-0.5 align-middle text-[11px] text-foreground"
        },
        HTMLAttributes
      ),
      ["span", { "aria-hidden": "true", class: "text-[13px] leading-none" }, "📎"],
      ["span", { class: "min-w-0 truncate font-mono font-medium", title: path }, display]
    ];
  },
  renderText() {
    return "";
  }
});

/** Queue review: inline context span (e.g. `[Agent 1:7]`). Omitted from flat-text note serialization. */
export const ThreadQueueContextTag = Node.create({
  name: "threadQueueContextTag",
  group: "inline",
  inline: true,
  atom: true,
  draggable: false,
  selectable: true,
  addAttributes() {
    return {
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") ?? "",
        renderHTML: (attrs) => (attrs.label ? { "data-label": attrs.label } : {})
      }
    };
  },
  parseHTML() {
    return [{ tag: "span[data-thread-queue-context-tag]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const label = String(node.attrs.label ?? "");
    return [
      "span",
      mergeAttributes(
        {
          "data-thread-queue-context-tag": "1",
          class:
            "thread-queue-context-tag inline-flex max-w-[20rem] shrink-0 items-center rounded-md border border-border/50 bg-muted/50 px-1.5 py-px align-middle font-mono text-[11px] font-medium tabular-nums text-foreground/90"
        },
        HTMLAttributes
      ),
      label
    ];
  },
  renderText() {
    return "";
  }
});

export const ThreadMention = Mention.extend({
  name: "threadMention",
  addAttributes() {
    return {
      ...this.parent?.(),
      itemKind: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-item-kind"),
        renderHTML: (attrs) => (attrs.itemKind ? { "data-item-kind": attrs.itemKind } : {})
      },
      sourceTrigger: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-source-trigger"),
        renderHTML: (attrs) => (attrs.sourceTrigger ? { "data-source-trigger": attrs.sourceTrigger } : {})
      }
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const kind = String(node.attrs.itemKind ?? "");
    const sourceTrigger = String(node.attrs.sourceTrigger ?? "");
    const label = String(node.attrs.label ?? "");
    if (sourceTrigger === "slash") {
      return [
        "span",
        mergeAttributes(
          {
            class:
              "thread-mention-slash inline-flex max-w-[18rem] items-center gap-0.5 rounded-md border border-primary/35 bg-primary/10 px-1.5 py-0.5 align-middle font-mono text-[11px] font-medium text-foreground",
            "data-item-kind": kind,
            "data-source-trigger": "slash"
          },
          HTMLAttributes
        ),
        ["span", { "aria-hidden": "true", class: "text-muted-foreground" }, "/"],
        ["span", { class: "min-w-0 truncate" }, label]
      ];
    }
    return [
      "span",
      mergeAttributes(
        {
          class:
            "thread-mention inline-flex max-w-[18rem] items-center gap-0.5 rounded-md border border-border/60 bg-muted/60 px-1.5 py-0.5 align-middle font-mono text-[11px] text-foreground"
        },
        HTMLAttributes
      ),
      label
    ];
  }
});

export type ThreadCreateExtensionOptions = {
  getWorktreePath: () => string | null | undefined;
};

export function createThreadCreatePromptExtensions(options: ThreadCreateExtensionOptions) {
  // Shared loading flag: set synchronously at the start of each fetch, cleared in finally.
  // The renderer reads it when TipTap calls onStart/onUpdate (after the await resolves or if cwd is missing).
  let atMentionLoading = false;

  return ThreadMention.configure({
    HTMLAttributes: {
      class:
        "thread-mention inline-flex max-w-[18rem] items-center gap-0.5 rounded-md border border-border/60 bg-muted/60 px-1.5 py-0.5 align-middle font-mono text-[11px] text-foreground"
    },
    suggestions: [
      {
        char: "/",
        pluginKey: threadSlashSuggestionKey,
        allowedPrefixes: null,
        findSuggestionMatch: findThreadSuggestionMatch,
        allow: ({ state, range }) => {
          const text = promptDocFlatText(state.doc);
          const cursor = promptFlatOffsetAtDocPos(state.doc, range.to);
          return parseSlashCommandAtCursor(text, cursor).active;
        },
        items: ({ query }) =>
          searchSlashSkills(options.getWorktreePath() ?? "", query).then((skills) =>
            skills.map((skill) => ({
              id: skill.id,
              label: skill.label,
              description: skill.description,
              itemKind: "skill" as const,
              sourceTrigger: "slash" as const
            }))
          ),
        render: () => createSuggestionRender("slash")
      },
      {
        char: "@",
        pluginKey: threadAtSuggestionKey,
        allowedPrefixes: null,
        findSuggestionMatch: findThreadSuggestionMatch,
        allow: ({ state, range }) => {
          const text = promptDocFlatText(state.doc);
          const cursor = promptFlatOffsetAtDocPos(state.doc, range.to);
          return parseMentionAtCursor(text, cursor).active;
        },
        items: async ({ query }) => {
          const cwd = options.getWorktreePath();
          const api = getWorkspaceApi();
          if (!api || !cwd) return [];
          atMentionLoading = true;
          try {
            const paths = await api.searchFiles(cwd, query);
            return paths
              .filter((relativePath) => !isSkillLikePath(relativePath))
              .slice(0, 80)
              .map((relativePath) => {
                const abs = absolutePathInWorktree(cwd, relativePath);
                return {
                  id: abs,
                  label: relativePath,
                  itemKind: "file" as const,
                  sourceTrigger: "at" as const
                };
              });
          } catch {
            return [];
          } finally {
            atMentionLoading = false;
          }
        },
        render: () => createSuggestionRender("at", () => atMentionLoading)
      }
    ]
  });
}
