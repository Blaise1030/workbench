import { ref, watch, type Ref } from "vue";

function getApi() {
  return typeof window !== "undefined" ? window.workspaceApi ?? null : null;
}

/** Heuristic: skill markdown or paths under common agent skill dirs */
export function isSkillLikePath(relativePath: string): boolean {
  const p = relativePath.replace(/\\/g, "/").toLowerCase();
  if (p.endsWith("skill.md")) return true;
  if (p.endsWith("/skill.md")) return true;
  if (p.includes("/skills/")) return true;
  if (p.includes(".claude/skills")) return true;
  if (p.includes(".cursor/skills")) return true;
  if (p.includes(".agents/skills")) return true;
  return false;
}

export type ThreadMentionItem = {
  relativePath: string;
  kind: "skill" | "file";
};

/** Join a worktree root and a relative path into an absolute path (browser-safe, no node:path). */
export function absolutePathInWorktree(cwd: string, relativePath: string): string {
  const base = cwd.replace(/[/\\]+$/, "");
  const rel = relativePath.replace(/^[/\\]+/, "");
  return `${base}/${rel}`;
}

/**
 * Parses whether the cursor is immediately after `@` with an optional query (no whitespace in query).
 */
export function parseMentionAtCursor(
  text: string,
  cursorPos: number
): { active: false } | { active: true; start: number; query: string } {
  const before = text.slice(0, cursorPos);
  const at = before.lastIndexOf("@");
  if (at < 0) return { active: false };
  const afterAt = before.slice(at + 1);
  if (/\s/.test(afterAt)) return { active: false };
  return { active: true, start: at, query: afterAt };
}

export function useThreadCreateMentions(options: {
  promptText: Ref<string>;
  worktreePath: Ref<string | null | undefined>;
  getPromptTextarea: () => HTMLTextAreaElement | null;
  onPick: (item: ThreadMentionItem, replaceFrom: number, replaceTo: number) => void;
}): {
  mentionActive: Ref<boolean>;
  mentionQuery: Ref<string>;
  mentionLoading: Ref<boolean>;
  mentionItems: Ref<ThreadMentionItem[]>;
  mentionSelectedIndex: Ref<number>;
  onPromptInput: () => void;
  handlePromptKeydown: (e: KeyboardEvent) => boolean;
  closeMention: () => void;
  pickMentionAtIndex: (index: number) => void;
} {
  const mentionActive = ref(false);
  const mentionQuery = ref("");
  const mentionLoading = ref(false);
  const mentionItems = ref<ThreadMentionItem[]>([]);
  const mentionSelectedIndex = ref(0);

  let fetchSeq = 0;

  async function fetchMentionItems(query: string): Promise<void> {
    const cwd = options.worktreePath.value;
    const api = getApi();
    if (!api || !cwd) {
      mentionItems.value = [];
      mentionLoading.value = false;
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
      mentionSelectedIndex.value = 0;
    } finally {
      if (seq === fetchSeq) mentionLoading.value = false;
    }
  }

  function syncMentionFromPrompt(): void {
    const el = options.getPromptTextarea();
    const cursor = el?.selectionStart ?? options.promptText.value.length;
    const parsed = parseMentionAtCursor(options.promptText.value, cursor);
    if (!parsed.active) {
      mentionActive.value = false;
      return;
    }
    mentionActive.value = true;
    mentionQuery.value = parsed.query;
    void fetchMentionItems(parsed.query);
  }

  function pickCurrent(): void {
    const item = mentionItems.value[mentionSelectedIndex.value];
    if (!item) return;
    const el = options.getPromptTextarea();
    const cursor = el?.selectionStart ?? options.promptText.value.length;
    const parsed = parseMentionAtCursor(options.promptText.value, cursor);
    if (!parsed.active) return;
    options.onPick(item, parsed.start, cursor);
    mentionActive.value = false;
  }

  function pickMentionAtIndex(index: number): void {
    const item = mentionItems.value[index];
    if (!item) return;
    mentionSelectedIndex.value = index;
    const el = options.getPromptTextarea();
    const cursor = el?.selectionStart ?? options.promptText.value.length;
    const parsed = parseMentionAtCursor(options.promptText.value, cursor);
    if (!parsed.active) return;
    options.onPick(item, parsed.start, cursor);
    mentionActive.value = false;
  }

  function onPromptInput(): void {
    syncMentionFromPrompt();
  }

  /** Returns true if the event was handled (caller should not run other handlers). */
  function handlePromptKeydown(e: KeyboardEvent): boolean {
    if (!mentionActive.value) return false;

    if (e.key === "Escape") {
      e.preventDefault();
      mentionActive.value = false;
      return true;
    }

    const len = mentionItems.value.length;

    /** While the @ popup is open, Enter must not submit the thread dialog. */
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (len > 0) pickCurrent();
      return true;
    }
    if (e.key === "Tab") {
      if (len > 0) {
        e.preventDefault();
        pickCurrent();
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
      mentionSelectedIndex.value = Math.min(mentionSelectedIndex.value + 1, len - 1);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      mentionSelectedIndex.value = Math.max(mentionSelectedIndex.value - 1, 0);
      return true;
    }

    return false;
  }

  function closeMention(): void {
    mentionActive.value = false;
  }

  watch(
    () => options.worktreePath.value,
    () => {
      closeMention();
    }
  );

  return {
    mentionActive,
    mentionQuery,
    mentionLoading,
    mentionItems,
    mentionSelectedIndex,
    onPromptInput,
    handlePromptKeydown,
    closeMention,
    pickMentionAtIndex
  };
}
