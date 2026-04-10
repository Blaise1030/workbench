<script lang="ts">
import { titleWithShortcut } from "@/keybindings/registry";

export const threadCreateButtonDefaultTitle = titleWithShortcut(
  "New thread",
  "newThreadMenu"
);
</script>

<script setup lang="ts">
import type { ThreadAgent, ThreadCreateWithAgentPayload } from "@shared/domain";
import { BookMarked, MessageSquarePlus, Paperclip, Slash, X } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, ref, toRef, watch } from "vue";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import Button from "@/components/ui/Button.vue";
import { badgeVariants } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger
} from "@/components/ui/select";
import Textarea from "@/components/ui/Textarea.vue";
import { readPreferredThreadAgent } from "@/composables/usePreferredThreadAgent";
import { absolutePathInWorktree, type ThreadMentionItem } from "@/composables/useThreadCreateMentions";
import {
  useThreadCreatePromptCompletions,
  type ThreadSlashCommand
} from "@/composables/useThreadCreatePromptCompletions";

const props = withDefaults(
  defineProps<{
    ariaLabel?: string;
    title?: string;
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    size?: "default" | "sm" | "lg" | "icon" | "xs" | "icon-xs";
    buttonClass?: string;
    /** When set, dialog shows where the new thread will be created (e.g. worktree / context name). */
    destinationContextLabel?: string | null;
    /** No trigger button — open only via `openMenu()` (single shared dialog in the layout). */
    triggerless?: boolean;
    /** Active worktree root (enables @ file / skill mentions from the repo). */
    worktreePath?: string | null;
  }>(),
  {
    ariaLabel: "New thread",
    title: threadCreateButtonDefaultTitle,
    variant: "outline",
    size: "icon-xs",
    buttonClass: "",
    destinationContextLabel: null,
    triggerless: false,
    worktreePath: null
  }
);

const emit = defineEmits<{
  createWithAgent: [payload: ThreadCreateWithAgentPayload];
}>();

const AGENT_OPTIONS: { agent: ThreadAgent; label: string }[] = [
  { agent: "claude", label: "Claude Code" },
  { agent: "cursor", label: "Cursor Agent" },
  { agent: "codex", label: "Codex CLI" },
  { agent: "gemini", label: "Gemini CLI" }
];

type Attachment = {
  id: string;
  path: string;
  name: string;
  isImage: boolean;
};

function attachmentEmoji(name: string, isImage: boolean): string {
  if (isImage) return "🖼️";
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot + 1) : "";
  const map: Record<string, string> = {
    pdf: "📕",
    md: "📝",
    txt: "📄",
    json: "📋",
    ts: "📘",
    tsx: "⚛️",
    vue: "💚",
    js: "📜",
    py: "🐍",
    rs: "🦀",
    go: "🐹",
    yml: "⚙️",
    yaml: "⚙️"
  };
  return map[ext] ?? "📎";
}

const overlayOpen = ref(false);
const promptText = ref("");
const selectedAgent = ref<ThreadAgent>(readPreferredThreadAgent());

const selectedAgentLabel = computed(
  () => AGENT_OPTIONS.find((o) => o.agent === selectedAgent.value)?.label ?? "Choose model"
);

const trimmedDestinationContext = computed(() => {
  const t = props.destinationContextLabel?.trim();
  return t && t.length > 0 ? t : null;
});

const promptInputRef = ref<InstanceType<typeof Textarea> | null>(null);
const worktreePathRef = toRef(props, "worktreePath");
const fileInputRef = ref<HTMLInputElement | null>(null);
const skillAttachments = ref<Attachment[]>([]);
const fileAttachments = ref<Attachment[]>([]);

function handleMentionPick(item: ThreadMentionItem, replaceFrom: number, replaceTo: number): void {
  const cwd = props.worktreePath;
  if (!cwd) return;
  const abs = absolutePathInWorktree(cwd, item.relativePath);
  const name = item.relativePath.split("/").pop() ?? item.relativePath;
  const att: Attachment = {
    id: crypto.randomUUID(),
    path: abs,
    name,
    isImage: false
  };
  if (item.kind === "skill") {
    if (!skillAttachments.value.some((a) => a.path === abs)) skillAttachments.value.push(att);
  } else if (!fileAttachments.value.some((a) => a.path === abs)) {
    fileAttachments.value.push(att);
  }
  promptText.value = promptText.value.slice(0, replaceFrom) + promptText.value.slice(replaceTo);
  void nextTick(() => promptInputRef.value?.focus());
}

function handleSlashPick(cmd: ThreadSlashCommand, replaceFrom: number, replaceTo: number): void {
  promptText.value =
    promptText.value.slice(0, replaceFrom) + cmd.insert + promptText.value.slice(replaceTo);
  void nextTick(() => {
    const el = promptInputRef.value?.element;
    const pos = replaceFrom + cmd.insert.length;
    el?.setSelectionRange(pos, pos);
    promptInputRef.value?.focus();
  });
}

const {
  menuKind,
  mentionLoading,
  mentionItems,
  slashItems,
  selectedIndex,
  onPromptInput,
  handlePromptKeydown,
  closeMenu,
  pickSlashAtIndex,
  pickMentionAtIndex
} = useThreadCreatePromptCompletions({
  promptText,
  worktreePath: worktreePathRef,
  getPromptTextarea: () => promptInputRef.value?.element ?? null,
  onPickMention: handleMentionPick,
  onPickSlash: handleSlashPick
});

function clearAttachments(): void {
  skillAttachments.value = [];
  fileAttachments.value = [];
}

function resetOverlay(): void {
  promptText.value = "";
  selectedAgent.value = readPreferredThreadAgent();
  clearAttachments();
}

watch(overlayOpen, (open) => {
  if (!open) {
    resetOverlay();
    closeMenu();
    return;
  }
  void nextTick(() => promptInputRef.value?.focus());
});

function openOverlay(): void {
  resetOverlay();
  overlayOpen.value = true;
}

function pathFromFile(file: File): string {
  const getPath = window.workspaceApi?.getPathForFile;
  if (getPath) {
    try {
      const p = getPath(file);
      if (p && p.length > 0) return p;
    } catch {
      /* invalid / non-local file */
    }
  }
  const legacy = (file as File & { path?: string }).path;
  if (legacy && legacy.length > 0) return legacy;
  return file.name;
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(file.name);
}

function addFilesFromList(files: FileList | File[]): void {
  for (const file of Array.from(files)) {
    const path = pathFromFile(file);
    const name = file.name;
    const isImage = isImageFile(file);
    fileAttachments.value.push({
      id: crypto.randomUUID(),
      path,
      name,
      isImage
    });
  }
}

function onFileInputChange(e: Event): void {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length) return;
  addFilesFromList(input.files);
  input.value = "";
}

function removeSkillAttachment(id: string): void {
  const i = skillAttachments.value.findIndex((a) => a.id === id);
  if (i < 0) return;
  skillAttachments.value.splice(i, 1);
}

function removeFileAttachment(id: string): void {
  const i = fileAttachments.value.findIndex((a) => a.id === id);
  if (i < 0) return;
  fileAttachments.value.splice(i, 1);
}

function isFileDrag(dt: DataTransfer | null): boolean {
  return dt ? [...dt.types].includes("Files") : false;
}

function onThreadCreateDragOver(e: DragEvent): void {
  if (!isFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
}

function onThreadCreateDrop(e: DragEvent): void {
  if (!isFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  e.stopPropagation();
  const dt = e.dataTransfer;
  if (!dt?.files?.length) return;
  addFilesFromList(dt.files);
}

function buildFullPrompt(): string {
  const body = promptText.value;
  const parts: string[] = [];
  if (skillAttachments.value.length > 0) {
    parts.push(
      `[Attached skills]\n${skillAttachments.value.map((a) => a.path).join("\n")}`
    );
  }
  if (fileAttachments.value.length > 0) {
    parts.push(`[Attached files]\n${fileAttachments.value.map((a) => a.path).join("\n")}`);
  }
  if (parts.length === 0) return body;
  const attachmentBlock = `\n\n${parts.join("\n\n")}`;
  const trimmedBody = body.trim();
  return trimmedBody.length > 0 ? trimmedBody + attachmentBlock : attachmentBlock.trim();
}

function deriveThreadTitle(): string | undefined {
  const first = promptText.value.trim().split(/\n/)[0]?.trim() ?? "";
  if (first) return first.length > 120 ? `${first.slice(0, 117)}…` : first;
  if (fileAttachments.value.length) {
    const n = fileAttachments.value[0]!.name;
    return fileAttachments.value.length === 1 ? n : `${n} +${fileAttachments.value.length - 1}`;
  }
  if (skillAttachments.value.length) {
    const n = skillAttachments.value[0]!.name;
    return skillAttachments.value.length === 1 ? n : `${n} +${skillAttachments.value.length - 1}`;
  }
  return undefined;
}

function submit(): void {
  const prompt = buildFullPrompt();
  const threadTitle = deriveThreadTitle();
  const payload: ThreadCreateWithAgentPayload = {
    agent: selectedAgent.value,
    prompt
  };
  if (threadTitle) payload.threadTitle = threadTitle;
  emit("createWithAgent", payload);
  overlayOpen.value = false;
}

function onPromptKeydown(e: KeyboardEvent): void {
  if (handlePromptKeydown(e)) return;
  if (e.key !== "Enter" || e.shiftKey) return;
  e.preventDefault();
  submit();
}

onBeforeUnmount(() => {
  clearAttachments();
});

defineExpose({ openMenu: openOverlay });
</script>

<template>
  <Dialog v-model:open="overlayOpen">
    <DialogTrigger v-if="!triggerless" as-child>
      <Button
        type="button"
        :size="size"
        :variant="variant"
        :aria-label="ariaLabel"
        :title="title"
        :class="buttonClass"
      >
        <slot />
      </Button>
    </DialogTrigger>
    <DialogContent
      data-testid="thread-create-dialog"
      overlay-class="bg-background/50 backdrop-blur-sm duration-150 ease-out dark:bg-black/45"
      class="top-[15vh] max-h-[min(92vh,44rem)] translate-y-0 gap-0 overflow-y-auto border-0 bg-transparent p-3 shadow-none duration-150 ease-out sm:max-w-[min(100%-1rem,26rem)] md:max-w-xl"
      @dragover="onThreadCreateDragOver"
      @drop="onThreadCreateDrop"
    >
      <h1 class="mb-6 text-center text-2xl pt-2">Building something great ? 🛠️</h1>
      <Card
        class="gap-0 overflow-hidden rounded-2xl border border-border bg-card py-0 shadow-none ring-0"
      >        
        <CardContent class="relative p-0">          
          <DialogTitle id="thread-create-overlay-title" class="sr-only">New thread</DialogTitle>
          <DialogDescription class="sr-only">
            Start a thread with a coding agent. Attach files with the paperclip, choose an agent, then press Enter or
            Start thread.
          </DialogDescription>
          <Textarea
            ref="promptInputRef"
            v-model="promptText"
            data-testid="thread-create-prompt-input"
            :rows="4"
            placeholder="I want to build ...."
            aria-label="Thread goal or prompt"
            class="min-h-[8.5rem] resize-none rounded-none border-0 bg-transparent px-4 py-4 text-[15px] leading-relaxed text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
            @input="onPromptInput"
            @click="onPromptInput"
            @keydown="onPromptKeydown"
          />

          <div
            v-if="menuKind === 'slash'"
            data-testid="thread-create-slash-popup"
            class="absolute left-2 right-2 top-full z-[100] mt-0 max-h-52 overflow-y-auto rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-lg"
            role="listbox"
            aria-label="Slash commands"
          >
            <div class="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Commands
            </div>
            <template v-if="slashItems.length === 0">
              <p class="px-3 py-2 text-xs text-muted-foreground">No matching commands.</p>
            </template>
            <template v-else>
              <button
                v-for="(cmd, idx) in slashItems"
                :key="cmd.id"
                type="button"
                role="option"
                class="flex w-full min-w-0 flex-col gap-0.5 px-2 py-1.5 text-left text-xs hover:bg-accent"
                :class="idx === selectedIndex ? 'bg-accent' : ''"
                :aria-selected="idx === selectedIndex"
                @mousedown.prevent="pickSlashAtIndex(idx)"
              >
                <span class="flex min-w-0 items-center gap-2">
                  <Slash class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span class="font-mono text-[11px] font-medium text-foreground">{{ cmd.insert }}</span>
                </span>
                <span class="pl-5 text-[11px] text-muted-foreground">{{ cmd.description }}</span>
              </button>
            </template>
          </div>

          <div
            v-if="menuKind === 'mention' && worktreePath"
            data-testid="thread-create-mention-popup"
            class="absolute left-2 right-2 top-full z-[100] mt-0 max-h-52 overflow-y-auto rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-lg"
            role="listbox"
            aria-label="Repository files and skills"
          >
            <div v-if="mentionLoading" class="px-3 py-2 text-xs text-muted-foreground">
              Searching repository…
            </div>
            <template v-else-if="mentionItems.length === 0">
              <p class="px-3 py-2 text-xs text-muted-foreground">No matching files.</p>
            </template>
            <template v-else>
              <template v-for="(item, idx) in mentionItems" :key="item.relativePath">
                <div
                  v-if="idx === 0 || item.kind !== mentionItems[idx - 1]!.kind"
                  class="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground first:pt-1"
                >
                  {{ item.kind === "skill" ? "Skills" : "Files" }}
                </div>
                <button
                  type="button"
                  role="option"
                  class="flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
                  :class="idx === selectedIndex ? 'bg-accent' : ''"
                  :aria-selected="idx === selectedIndex"
                  @mousedown.prevent="pickMentionAtIndex(idx)"
                >
                  <BookMarked
                    v-if="item.kind === 'skill'"
                    class="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Paperclip
                    v-else
                    class="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span class="min-w-0 flex-1 truncate font-mono text-[11px]">{{ item.relativePath }}</span>
                </button>
              </template>
            </template>
          </div>
          <p
            v-if="menuKind === 'mention' && !worktreePath"
            class="absolute left-2 right-2 top-full z-[100] mt-0 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground"
          >
            Open a workspace to use @ mentions.
          </p>

          <div
            v-if="skillAttachments.length || fileAttachments.length"
            class="space-y-2 border-t border-border px-3 py-2"
          >
            <div v-if="skillAttachments.length" class="space-y-1">
              <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Skills</p>
              <div
                class="flex flex-nowrap gap-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
                data-testid="thread-create-skills-strip"
              >
                <div
                  v-for="a in skillAttachments"
                  :key="a.id"
                  :class="
                    cn(
                      badgeVariants({ variant: 'secondary' }),
                      'inline-flex h-7 max-w-[16rem] shrink-0 items-stretch gap-0.5 rounded-full border-border/60 bg-muted/70 py-0 pr-0.5 pl-1.5 text-xs shadow-none'
                    )
                  "
                  :title="a.path"
                >
                  <span class="flex min-w-0 flex-1 items-center gap-1.5">
                    <BookMarked class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span class="min-w-0 truncate font-medium text-foreground">{{ a.name }}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    class="size-6 shrink-0 rounded-full text-muted-foreground hover:bg-background/80 hover:text-destructive"
                    :aria-label="`Remove skill ${a.name}`"
                    @click="removeSkillAttachment(a.id)"
                  >
                    <X class="size-3" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>
            <div v-if="fileAttachments.length">
              <div
                class="flex flex-nowrap gap-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
                data-testid="thread-create-files-strip"
              >
                <div
                  v-for="a in fileAttachments"
                  :key="a.id"
                  :class="
                    cn(
                      badgeVariants({ variant: 'secondary' }),
                      'inline-flex h-7 max-w-none shrink-0 items-center gap-0.5 rounded-full border-border/60 bg-muted/70 py-0 pl-1.5 pr-0.5 text-xs shadow-none'
                    )
                  "
                  :title="a.path"
                >
                  <span class="flex min-w-0 flex-1 items-center gap-1.5">
                    <span class="shrink-0 text-[13px] leading-none" aria-hidden="true">{{
                      attachmentEmoji(a.name, a.isImage)
                    }}</span>
                    <span class="min-w-0 truncate font-mono text-[11px] font-medium text-foreground">{{
                      a.isImage ? a.name : a.path
                    }}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    class="size-6 shrink-0 rounded-full text-muted-foreground hover:bg-background/80 hover:text-destructive"
                    :aria-label="`Remove attached file ${a.path}`"
                    @click="removeFileAttachment(a.id)"
                  >
                    <X class="size-3" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter
          class="flex-wrap justify-between gap-2 border-t border-border bg-muted px-2.5 py-2 sm:px-3 [.border-t]:pt-2.5"
          data-testid="thread-agent-menu-panel"
        >
          <div class="flex min-w-0 items-center gap-1">
            <input
              ref="fileInputRef"
              type="file"
              class="hidden"
              multiple
              accept="image/*,.pdf,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.vue,.py,.rs,.go,.toml,.yaml,.yml,.c,.cpp,.h,.java,.kt,.swift,.rb,.php,.sh,.zsh,.bash,.env"
              aria-label="Attach files or images"
              @change="onFileInputChange"
            />
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              class="h-9 w-9 shrink-0 rounded-lg"
              title="Attach files or images"
              aria-label="Attach files or images"
              data-testid="thread-create-add-file"
              @click="fileInputRef?.click()"
            >
              <Paperclip class="h-5 w-5" stroke-width="2" />
            </Button>
          </div>

          <div class="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
            <div class="flex min-w-0 flex-col gap-1">
              <label class="sr-only" for="thread-create-model-select">Model</label>
              <Select v-model="selectedAgent">
                <SelectTrigger
                  id="thread-create-model-select"
                  class="h-9 w-full min-w-[12rem] max-w-[16rem] shrink border-input bg-background text-xs font-medium shadow-xs"
                  :aria-label="`Model: ${selectedAgentLabel}`"
                >
                  <span class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                    <AgentIcon :agent="selectedAgent" :size="18" class="shrink-0" />
                    <span class="truncate text-left">{{ selectedAgentLabel }}</span>
                  </span>
                </SelectTrigger>
                <SelectContent class="z-[110]">
                  <SelectGroup>
                    <SelectLabel>Model</SelectLabel>
                    <SelectItem v-for="opt in AGENT_OPTIONS" :key="opt.agent" :value="opt.agent">
                      <AgentIcon :agent="opt.agent" :size="16" class="shrink-0" />
                      {{ opt.label }}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              size="sm"
              class="h-9 gap-1.5 rounded-lg bg-foreground px-3 text-xs font-medium text-background hover:bg-foreground/90"
              aria-label="Start thread"
              title="Start thread"
              @click="submit"
            >
              <MessageSquarePlus class="size-3.5 shrink-0" aria-hidden="true" />
              Start thread
            </Button>
          </div>
        </CardFooter>
        <p
          v-if="trimmedDestinationContext"
          class="border-t border-border bg-muted/40 px-4 py-2.5 text-[11px] leading-snug text-muted-foreground rounded-b-2xl"
          data-testid="thread-create-destination-hint"
        >
          You're adding a thread to
          <span class="font-medium text-foreground">{{ trimmedDestinationContext }}</span>.
        </p>
      </Card>
    </DialogContent>
  </Dialog>
</template>
