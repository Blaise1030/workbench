import { computed, ref, watch, type Ref } from "vue";
import type { ThreadAgent } from "@shared/domain";
import {
  expandUserSkillRoot,
  readStoredAgentSkillRoots
} from "@/composables/useAgentSkillRoots";
import {
  absolutePathInWorktree,
  isSkillLikePath,
  parseMentionAtCursor,
  type ThreadMentionItem
} from "@/composables/useThreadCreateMentions";

function getApi() {
  return typeof window !== "undefined" ? window.workspaceApi ?? null : null;
}

export type ThreadSlashSkill = {
  id: string;
  label: string;
  insert: string;
  description: string;
  source: "repo" | "user";
};

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Name of the directory under each agent config folder where skill packages live
 * (e.g. `~/.claude/skills/<skill-folder>/SKILL.md`).
 */
export const AGENT_SKILLS_DIRECTORY_NAME = "skills";

/**
 * Display label: parent folder of `SKILL.md` / `skill.md` when present, else the last path segment.
 */
export function skillDisplayLabelFromRelativePath(relativePath: string): string {
  const parts = normalizeSlashes(relativePath)
    .split("/")
    .filter(Boolean);
  if (parts.length === 0) return relativePath.trim() || relativePath;
  const last = parts[parts.length - 1]!;
  if (/^skill\.md$/i.test(last) && parts.length >= 2) {
    return parts[parts.length - 2]!;
  }
  return last;
}

function guessHomeDirFromWorktreePath(cwd: string): string | null {
  const n = normalizeSlashes(cwd);
  const mPosix = n.match(/^\/(Users|home)\/[^/]+/);
  if (mPosix) return mPosix[0];
  const mWindows = n.match(/^[A-Za-z]:\/Users\/[^/]+/);
  if (mWindows) return mWindows[0];
  return null;
}

async function resolveHomeDirForSkillSearch(worktreePath: string): Promise<string | null> {
  const fromWorktree = guessHomeDirFromWorktreePath(worktreePath);
  if (fromWorktree) return fromWorktree;
  const api = getApi();
  if (!api?.getUserHomeDir) return null;
  try {
    const h = await api.getUserHomeDir();
    return typeof h === "string" && h.trim() ? h.trim() : null;
  } catch {
    return null;
  }
}

const THREAD_AGENTS: ThreadAgent[] = ["claude", "cursor", "codex", "gemini"];

/** Absolute search roots from Settings → Agents (skill directories), deduped. */
function userSkillRootsFromSettings(cwd: string, home: string | null): string[] {
  const stored = readStoredAgentSkillRoots();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const agent of THREAD_AGENTS) {
    const expanded = expandUserSkillRoot(stored[agent], home);
    if (!expanded || seen.has(expanded)) continue;
    seen.add(expanded);
    out.push(expanded);
  }
  return out;
}

function withHomeTilde(pathValue: string, home: string | null): string {
  if (!home) return pathValue;
  const full = normalizeSlashes(pathValue);
  const h = normalizeSlashes(home);
  return full === h || full.startsWith(`${h}/`) ? `~${full.slice(h.length)}` : pathValue;
}

export async function searchSlashSkills(
  worktreePath: string,
  query: string
): Promise<ThreadSlashSkill[]> {
  const api = getApi();
  if (!api) return [];

  const out = new Map<string, ThreadSlashSkill>();
  const home = await resolveHomeDirForSkillSearch(worktreePath);

  const repoPaths = await api.searchFiles(worktreePath, query).catch(() => [] as string[]);
  for (const relativePath of repoPaths) {
    if (!isSkillLikePath(relativePath)) continue;
    const abs = absolutePathInWorktree(worktreePath, relativePath);
    const display = skillDisplayLabelFromRelativePath(relativePath);
    out.set(abs, {
      id: abs,
      label: display,
      insert: relativePath,
      description: relativePath,
      source: "repo"
    });
  }

  const roots = userSkillRootsFromSettings(worktreePath, home);
  const searches = await Promise.all(
    roots.map(async (root) => ({
      root,
      paths: await api.searchFiles(root, query).catch(() => [] as string[])
    }))
  );

  for (const result of searches) {
    for (const relativePath of result.paths) {
      if (!isSkillLikePath(relativePath)) continue;
      const abs = absolutePathInWorktree(result.root, relativePath);
      if (out.has(abs)) continue;
      const display = skillDisplayLabelFromRelativePath(relativePath);
      out.set(abs, {
        id: abs,
        label: display,
        insert: withHomeTilde(`${result.root}/${relativePath}`, home),
        description: withHomeTilde(`${result.root}/${relativePath}`, home),
        source: "user"
      });
    }
  }

  return [...out.values()]
    .sort((a, b) => {
      if (a.source !== b.source) return a.source === "repo" ? -1 : 1;
      return a.label.localeCompare(b.label);
    })
    .slice(0, 80);
}

/**
 * `/skill` at line start or after whitespace; query has no spaces or extra `/` (avoids paths).
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

export type PromptCompletionKind = "mention" | "slash";

export function useThreadCreatePromptCompletions(options: {
  worktreePath: Ref<string | null | undefined>;
  /** Plain prompt text (same shape as slash / @ parsers). */
  getPlainText: () => string;
  /** Cursor offset in `getPlainText()`. */
  getCursor: () => number;
  onPickMention: (item: ThreadMentionItem, replaceFrom: number, replaceTo: number) => void;
  onPickSlash: (command: ThreadSlashSkill, replaceFrom: number, replaceTo: number) => void;
}): {
  menuOpen: Ref<boolean>;
  menuKind: Ref<PromptCompletionKind | null>;
  mentionQuery: Ref<string>;
  mentionLoading: Ref<boolean>;
  mentionItems: Ref<ThreadMentionItem[]>;
  slashItems: Ref<ThreadSlashSkill[]>;
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
  const slashItems = ref<ThreadSlashSkill[]>([]);
  const selectedIndex = ref(0);

  const menuOpen = computed(() => menuKind.value !== null);

  let fetchMentionSeq = 0;
  let fetchSlashSeq = 0;

  async function fetchMentionItems(query: string): Promise<void> {
    const cwd = options.worktreePath.value;
    const api = getApi();
    if (!api || !cwd) {
      mentionItems.value = [];
      mentionLoading.value = false;
      return;
    }
    const seq = ++fetchMentionSeq;
    mentionLoading.value = true;
    try {
      const paths = await api.searchFiles(cwd, query);
      if (seq !== fetchMentionSeq) return;
      const mapped: ThreadMentionItem[] = paths
        .slice(0, 200)
        .filter((relativePath) => !isSkillLikePath(relativePath))
        .map((relativePath) => ({
          relativePath,
          kind: "file"
        }));
      mapped.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
      mentionItems.value = mapped.slice(0, 80);
      selectedIndex.value = 0;
    } finally {
      if (seq === fetchMentionSeq) mentionLoading.value = false;
    }
  }

  async function fetchSlashItems(query: string): Promise<void> {
    const cwd = options.worktreePath.value;
    if (!cwd) {
      slashItems.value = [];
      return;
    }
    const seq = ++fetchSlashSeq;
    const items = await searchSlashSkills(cwd, query);
    if (seq !== fetchSlashSeq) return;
    slashItems.value = items;
    selectedIndex.value = 0;
  }

  function syncFromPrompt(): void {
    const text = options.getPlainText();
    const cursor = Math.min(options.getCursor(), text.length);
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
      void fetchSlashItems(parsed.query);
      mentionItems.value = [];
      mentionLoading.value = false;
    }
  }

  function pickMention(): void {
    const item = mentionItems.value[selectedIndex.value];
    if (!item) return;
    const text = options.getPlainText();
    const cursor = Math.min(options.getCursor(), text.length);
    const parsed = parseMentionAtCursor(text, cursor);
    if (!parsed.active) return;
    options.onPickMention(item, parsed.start, cursor);
    menuKind.value = null;
  }

  function pickSlash(): void {
    const item = slashItems.value[selectedIndex.value];
    if (!item) return;
    const text = options.getPlainText();
    const cursor = Math.min(options.getCursor(), text.length);
    const parsed = parseSlashCommandAtCursor(text, cursor);
    if (!parsed.active) return;
    options.onPickSlash(item, parsed.start, cursor);
    menuKind.value = null;
  }

  function pickMentionAtIndex(index: number): void {
    const item = mentionItems.value[index];
    if (!item) return;
    selectedIndex.value = index;
    const text = options.getPlainText();
    const cursor = Math.min(options.getCursor(), text.length);
    const parsed = parseMentionAtCursor(text, cursor);
    if (!parsed.active) return;
    options.onPickMention(item, parsed.start, cursor);
    menuKind.value = null;
  }

  function pickSlashAtIndex(index: number): void {
    const item = slashItems.value[index];
    if (!item) return;
    selectedIndex.value = index;
    const text = options.getPlainText();
    const cursor = Math.min(options.getCursor(), text.length);
    const parsed = parseSlashCommandAtCursor(text, cursor);
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
