<script setup lang="ts">
import type { ThreadAgent, ThreadCreateWithAgentPayload } from "@shared/domain";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { BookMarked, MessageSquarePlus, Paperclip, X } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, ref, unref, watch } from "vue";
import { useKeybindingsStore } from "@/stores/keybindingsStore";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import Button from "@/components/ui/Button.vue";
import { badgeVariants } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { isImageFile, pathFromFile, type LocalFileAttachment } from "@/lib/localFileAttachment";
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
import { readPreferredThreadAgent } from "@/composables/usePreferredThreadAgent";
import {
  createThreadCreatePromptExtensions,
  isThreadCreateSuggestionActive,
  ThreadImageBadge
} from "@/lib/threadCreateEditorExtensions";
import { collectDocAttachmentPaths } from "@/lib/threadCreatePromptSerialize";

const THREAD_CREATE_PROMPT_PLACEHOLDER =
  "What do you want to build? Use @ for files or / for commands…";

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
    title: undefined,
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

const keybindings = useKeybindingsStore();
const resolvedTitle = computed(() => props.title ?? keybindings.titleWithShortcut("New thread", "newThreadMenu"));

const AGENT_OPTIONS: { agent: ThreadAgent; label: string }[] = [
  { agent: "claude", label: "Claude Code" },
  { agent: "cursor", label: "Cursor Agent" },
  { agent: "codex", label: "Codex CLI" },
  { agent: "gemini", label: "Gemini CLI" }
];

type Attachment = LocalFileAttachment;

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
const selectedAgent = ref<ThreadAgent>(readPreferredThreadAgent());

const selectedAgentLabel = computed(
  () => AGENT_OPTIONS.find((o) => o.agent === selectedAgent.value)?.label ?? "Choose model"
);

const trimmedDestinationContext = computed(() => {
  const t = props.destinationContextLabel?.trim();
  return t && t.length > 0 ? t : null;
});

const threadPromptEditor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      bulletList: { HTMLAttributes: { class: "list-disc pl-4" } },
      orderedList: { HTMLAttributes: { class: "list-decimal pl-4" } }
    }),
    Placeholder.configure({
      placeholder: THREAD_CREATE_PROMPT_PLACEHOLDER
    }),
    ThreadImageBadge,
    createThreadCreatePromptExtensions({
      getWorktreePath: () => props.worktreePath
    })
  ],
  content: "<p></p>",
  immediatelyRender: false,
  editorProps: {
    attributes: {
      class:
        "tiptap thread-create-prompt-editor min-h-[12rem] max-h-[min(40vh,22rem)] overflow-y-auto px-4 py-4 text-[15px] leading-relaxed text-foreground outline-none focus:outline-none [&_.ProseMirror]:min-h-[12rem] [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1",
      role: "textbox",
      "aria-multiline": "true",
      "aria-label": "Thread goal or prompt",
      "aria-placeholder": THREAD_CREATE_PROMPT_PLACEHOLDER,
      tabindex: "0"
    },
    handleKeyDown(view, event) {
      if (isThreadCreateSuggestionActive(view)) {
        if (event.key === "Enter" && !event.shiftKey) return false;
        if (event.key === "Escape") return false;
      }
      if (event.key === "Escape") {
        overlayOpen.value = false;
        return true;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit();
        return true;
      }
      return false;
    },
    handleDOMEvents: {
      drop(view, event) {
        const dt = event.dataTransfer;
        if (!dt?.files?.length) return false;
        const target = event.target as HTMLElement | null;
        if (!target?.closest?.(".ProseMirror")) return false;
        event.preventDefault();
        event.stopPropagation();
        const editor = threadPromptEditor.value;
        if (!editor) return true;
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (coords == null) return true;
        const pos = coords.pos;
        const imageNodes: { type: string; attrs: { path: string; name: string } }[] = [];
        for (const file of Array.from(dt.files)) {
          if (isImageFile(file)) {
            imageNodes.push({
              type: "threadImageBadge",
              attrs: { path: pathFromFile(file), name: file.name }
            });
          } else {
            addFilesFromList([file]);
          }
        }
        if (imageNodes.length > 0) {
          editor.chain().focus().insertContentAt(pos, imageNodes).run();
        }
        return true;
      }
    }
  }
});

const fileInputRef = ref<HTMLInputElement | null>(null);
const skillAttachments = ref<Attachment[]>([]);
const fileAttachments = ref<Attachment[]>([]);

function clearAttachments(): void {
  skillAttachments.value = [];
  fileAttachments.value = [];
}

function resetOverlay(): void {
  unref(threadPromptEditor)?.commands.setContent("<p></p>", false);
  selectedAgent.value = readPreferredThreadAgent();
  clearAttachments();
}

watch(overlayOpen, (open) => {
  if (!open) {
    resetOverlay();
    return;
  }
  void nextTick(() => {
    threadPromptEditor.value?.commands.focus("end");
  });
});

function openOverlay(): void {
  resetOverlay();
  overlayOpen.value = true;
}

function addFilesFromList(files: FileList | File[]): void {
  const editor = threadPromptEditor.value;
  for (const file of Array.from(files)) {
    const path = pathFromFile(file);
    const name = file.name;
    const isImage = isImageFile(file);
    if (isImage) {
      if (editor) {
        editor
          .chain()
          .focus("end")
          .insertContent([{ type: "threadImageBadge", attrs: { path, name } }])
          .run();
      } else {
        fileAttachments.value.push({
          id: crypto.randomUUID(),
          path,
          name,
          isImage
        });
      }
      continue;
    }
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
  const target = e.target as HTMLElement | null;
  if (target?.closest?.(".ProseMirror")) return;
  e.preventDefault();
  e.stopPropagation();
  const dt = e.dataTransfer;
  if (!dt?.files?.length) return;
  addFilesFromList(dt.files);
}

function buildFullPrompt(): string {
  const ed = threadPromptEditor.value;
  if (!ed) return "";
  const body = ed.getText({ blockSeparator: "\n" }).trimEnd();
  const fromDoc = collectDocAttachmentPaths(ed.state.doc);
  const skillPaths = new Set<string>([
    ...fromDoc.skillPaths,
    ...skillAttachments.value.map((a) => a.path)
  ]);
  const filePaths = new Set<string>([
    ...fromDoc.filePaths,
    ...fileAttachments.value.map((a) => a.path)
  ]);
  const parts: string[] = [];
  if (skillPaths.size > 0) {
    parts.push(`[Attached skills]\n${[...skillPaths].join("\n")}`);
  }
  if (filePaths.size > 0) {
    parts.push(`[Attached files]\n${[...filePaths].join("\n")}`);
  }
  if (parts.length === 0) return body;
  const attachmentBlock = `\n\n${parts.join("\n\n")}`;
  const trimmedBody = body.trim();
  return trimmedBody.length > 0 ? trimmedBody + attachmentBlock : attachmentBlock.trim();
}

function deriveThreadTitle(): string | undefined {
  const flat = threadPromptEditor.value?.getText({ blockSeparator: "\n" }) ?? "";
  const first = flat.trim().split(/\n/)[0]?.trim() ?? "";
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

onBeforeUnmount(() => {
  clearAttachments();
});

defineExpose({ openMenu: openOverlay, threadPromptEditor });
</script>

<template>
  <Dialog v-model:open="overlayOpen">
    <DialogTrigger v-if="!triggerless" as-child>
      <Button
        type="button"
        :size="size"
        :variant="variant"
        :aria-label="ariaLabel"
        :title="resolvedTitle"
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
          <div
            data-testid="thread-create-prompt-input"
            class="thread-create-prompt-host min-h-[12rem] w-full rounded-none border-0 bg-transparent shadow-none"
            role="presentation"
          >
            <editor-content
              v-if="threadPromptEditor"
              :editor="threadPromptEditor"
              class="min-h-[inherit] w-full rounded-none border-0 bg-transparent"
            />
          </div>

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

<style scoped>
/* TipTap Placeholder extension (v3): empty paragraphs get .is-empty + data-placeholder via decoration */
.thread-create-prompt-host :deep(.ProseMirror p.is-empty::before) {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
  user-select: none;
  color: var(--muted-foreground);
}
</style>
