import { computed, ref, watch, type Ref } from "vue";
import {
  isSkillLikePath,
  parseMentionAtCursor,
  type ThreadMentionItem
} from "@/composables/useThreadCreateMentions";

function getApi() {
  return typeof window !== "undefined" ? window.workspaceApi ?? null : null;
}

/** Slash tokens inserted into the prompt (agents often treat these as commands). */
export type ThreadSlashCommand = {
  id: string;
  label: string;
  insert: string;
  description: string;
  keywords?: string;
};

export const THREAD_CREATE_SLASH_COMMANDS: ThreadSlashCommand[] = [
  {
    id: "review",
    label: "review",
    insert: "/review",
    description: "Request a code review",
    keywords: "inspect check"
  },
  {
    id: "plan",
    label: "plan",
    insert: "/plan",
    description: "Plan before implementing",
    keywords: "design outline"
  },
  {
    id: "fix",
    label: "fix",
    insert: "/fix",
    description: "Fix a bug or failing behavior",
    keywords: "bug repair"
  },
  {
    id: "test",
    label: "test",
    insert: "/test",
    description: "Add or update tests",
    keywords: "spec coverage"
  },
  {
    id: "explain",
    label: "explain",
    insert: "/explain",
    description: "Explain code or behavior",
    keywords: "how why"
  },
  {
    id: "refactor",
    label: "refactor",
    insert: "/refactor",
    description: "Refactor for clarity or structure",
    keywords: "cleanup restructure"
  }
];

/**
 * `/command` at line start or after whitespace; query has no spaces or extra `/` (avoids paths).
 * Ignores `@…` so `@mention` does not clash with slash menus.
 */
export function parseSlashCommandAtCursor(
  text: string,
  cursorPos: number
): { active: false } | { active: true; start: number; query: string } {
  const before = text.slice(0, cursorPos);
  const slash = before.lastIndexOf("/");
  if (slash < 0) return { active: false };
  if (slash > 0) {
    const prev = before[slash - 1];
    if (prev !== " " && prev !== "\n" && prev !== "\t") return { active: false };
  }
  const afterSlash = before.slice(slash + 1);
  if (afterSlash.includes("/")) return { active: false };
  if (afterSlash.includes("@")) return { active: false };
  if (/\s/.test(afterSlash)) return { active: false };
  return { active: true, start: slash, query: afterSlash };
}

function filterSlashCommands(query: string): ThreadSlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...THREAD_CREATE_SLASH_COMMANDS];
  return THREAD_CREATE_SLASH_COMMANDS.filter((c) => {
    const hay = `${c.label} ${c.description} ${c.keywords ?? ""}`.toLowerCase();
    return c.label.toLowerCase().startsWith(q) || hay.includes(q);
  });
}

export type PromptCompletionKind = "mention" | "slash";

export function useThreadCreatePromptCompletions(options: {
  promptText: Ref<string>;
  worktreePath: Ref<string | null | undefined>;
  getPromptTextarea: () => HTMLTextAreaElement | null;
  onPickMention: (item: ThreadMentionItem, replaceFrom: number, replaceTo: number) => void;
  onPickSlash: (command: ThreadSlashCommand, replaceFrom: number, replaceTo: number) => void;
}): {
  menuOpen: Ref<boolean>;
  menuKind: Ref<PromptCompletionKind | null>;
  mentionQuery: Ref<string>;
  mentionLoading: Ref<boolean>;
  mentionItems: Ref<ThreadMentionItem[]>;
  slashItems: Ref<ThreadSlashCommand[]>;
  selectedIndex: Ref<number>;
  onPromptInput: () => void;
  handlePromptKeydown: (e: KeyboardEvent) => boolean;
  closeMenu: () => void;
  pickSlashAtIndex: (index: number) => void;
  pickMentionAtIndex: (index: number) => void;
} {
  const menuKind = ref<PromptCompletionKind | null>(null);
  const mentionQuery = ref("");
  const mentionLoading = ref(false);
  const mentionItems = ref<ThreadMentionItem[]>([]);
  const slashItems = ref<ThreadSlashCommand[]>([]);
  const selectedIndex = ref(0);

  const menuOpen = computed(() => menuKind.value !== null);

  let fetchSeq = 0;

  async function fetchMentionItems(query: string): Promise<void> {
    const cwd = options.worktreePath.value;
    const api = getApi();
    if (!api || !cwd) {
      mentionItems.value = [];
      return;
    }
    const seq = ++fetchSeq;
    mentionLoading.value = true;
    try {
      const paths = await api.searchFiles(cwd, query);
      if (seq !== fetchSeq) return;
      const mapped: ThreadMentionItem[] = paths.slice(0, 200).map((relativePath) => ({
        relativePath,
        kind: isSkillLikePath(relativePath) ? "skill" : "file"
      }));
      mapped.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "skill" ? -1 : 1;
        return a.relativePath.localeCompare(b.relativePath);
      });
      mentionItems.value = mapped.slice(0, 80);
      selectedIndex.value = 0;
    } finally {
      if (seq === fetchSeq) mentionLoading.value = false;
    }
  }

  function syncFromPrompt(): void {
    const el = options.getPromptTextarea();
    const cursor = el?.selectionStart ?? options.promptText.value.length;
    const text = options.promptText.value;
    const m = parseMentionAtCursor(text, cursor);
    const s = parseSlashCommandAtCursor(text, cursor);

    let kind: PromptCompletionKind | null = null;

    if (m.active && s.active) {
      kind = m.start >= s.start ? "mention" : "slash";
    } else if (m.active) {
      kind = "mention";
    } else if (s.active) {
      kind = "slash";
    }

    if (!kind) {
      menuKind.value = null;
      return;
    }

    menuKind.value = kind;

    if (kind === "mention") {
      const parsed = parseMentionAtCursor(text, cursor);
      if (!parsed.active) {
        menuKind.value = null;
        return;
      }
      mentionQuery.value = parsed.query;
      void fetchMentionItems(parsed.query);
      slashItems.value = [];
    } else {
      const parsed = parseSlashCommandAtCursor(text, cursor);
      if (!parsed.active) {
        menuKind.value = null;
        return;
      }
      slashItems.value = filterSlashCommands(parsed.query);
      mentionItems.value = [];
      mentionLoading.value = false;
      selectedIndex.value = 0;
    }
  }

  function pickMention(): void {
    const item = mentionItems.value[selectedIndex.value];
    if (!item) return;
    const el = options.getPromptTextarea();
    const cursor = el?.selectionStart ?? options.promptText.value.length;
    const parsed = parseMentionAtCursor(options.promptText.value, cursor);
    if (!parsed.active) return;
    options.onPickMention(item, parsed.start, cursor);
    menuKind.value = null;
  }

  function pickSlash(): void {
    const item = slashItems.value[selectedIndex.value];
    if (!item) return;
    const el = options.getPromptTextarea();
    const cursor = el?.selectionStart ?? options.promptText.value.length;
    const parsed = parseSlashCommandAtCursor(options.promptText.value, cursor);
    if (!parsed.active) return;
    options.onPickSlash(item, parsed.start, cursor);
    menuKind.value = null;
  }

  function pickMentionAtIndex(index: number): void {
    const item = mentionItems.value[index];
    if (!item) return;
    selectedIndex.value = index;
    const el = options.getPromptTextarea();
    const cursor = el?.selectionStart ?? options.promptText.value.length;
    const parsed = parseMentionAtCursor(options.promptText.value, cursor);
    if (!parsed.active) return;
    options.onPickMention(item, parsed.start, cursor);
    menuKind.value = null;
  }

  function pickSlashAtIndex(index: number): void {
    const item = slashItems.value[index];
    if (!item) return;
    selectedIndex.value = index;
    const el = options.getPromptTextarea();
    const cursor = el?.selectionStart ?? options.promptText.value.length;
    const parsed = parseSlashCommandAtCursor(options.promptText.value, cursor);
    if (!parsed.active) return;
    options.onPickSlash(item, parsed.start, cursor);
    menuKind.value = null;
  }

  function onPromptInput(): void {
    syncFromPrompt();
  }

  function handlePromptKeydown(e: KeyboardEvent): boolean {
    if (!menuKind.value) return false;

    if (e.key === "Escape") {
      e.preventDefault();
      menuKind.value = null;
      return true;
    }

    const isMention = menuKind.value === "mention";
    const len = isMention ? mentionItems.value.length : slashItems.value.length;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (len > 0) {
        if (isMention) pickMention();
        else pickSlash();
      }
      return true;
    }

    if (e.key === "Tab") {
      if (len > 0) {
        e.preventDefault();
        if (isMention) pickMention();
        else pickSlash();
        return true;
      }
      return false;
    }

    if (len === 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        return true;
      }
      return false;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex.value = Math.min(selectedIndex.value + 1, len - 1);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
      return true;
    }

    return false;
  }

  function closeMenu(): void {
    menuKind.value = null;
  }

  watch(
    () => options.worktreePath.value,
    () => {
      closeMenu();
    }
  );

  return {
    menuOpen,
    menuKind,
    mentionQuery,
    mentionLoading,
    mentionItems,
    slashItems,
    selectedIndex,
    onPromptInput,
    handlePromptKeydown,
    closeMenu,
    pickSlashAtIndex,
    pickMentionAtIndex
  };
}
