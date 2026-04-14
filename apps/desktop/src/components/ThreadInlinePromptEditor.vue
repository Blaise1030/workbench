<script setup lang="ts">
import type { ThreadAgent, ThreadCreateWithAgentPayload } from "@shared/domain";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { BookMarked, MessageSquarePlus, Paperclip, X } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import AgentIcon from "@/components/ui/AgentIcon.vue";
import Button from "@/components/ui/Button.vue";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isImageFile, pathFromFile, type LocalFileAttachment } from "@/lib/localFileAttachment";
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

const AGENT_OPTIONS: { agent: ThreadAgent; label: string }[] = [
  { agent: "claude", label: "Claude Code" },
  { agent: "cursor", label: "Cursor Agent" },
  { agent: "codex", label: "Codex CLI" },
  { agent: "gemini", label: "Gemini CLI" }
];

type Attachment = LocalFileAttachment;

const props = withDefaults(
  defineProps<{
    worktreeId: string;
    worktreePath: string | null;
    defaultAgent?: ThreadAgent;
  }>(),
  { defaultAgent: undefined }
);

const emit = defineEmits<{
  submit: [payload: ThreadCreateWithAgentPayload];
  cancel: [];
}>();

const selectedAgent = ref<ThreadAgent>(props.defaultAgent ?? readPreferredThreadAgent());

const selectedAgentLabel = computed(
  () => AGENT_OPTIONS.find((o) => o.agent === selectedAgent.value)?.label ?? selectedAgent.value
);

const threadPromptEditor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      bulletList: { HTMLAttributes: { class: "list-disc pl-4" } },
      orderedList: { HTMLAttributes: { class: "list-decimal pl-4" } }
    }),
    Placeholder.configure({ placeholder: THREAD_CREATE_PROMPT_PLACEHOLDER }),
    ThreadImageBadge,
    createThreadCreatePromptExtensions({ getWorktreePath: () => props.worktreePath })
  ],
  content: "<p></p>",
  immediatelyRender: false,
  editorProps: {
    attributes: {
      class:
        "tiptap thread-create-prompt-editor min-h-[10rem] overflow-y-auto px-4 py-4 text-[15px] leading-relaxed text-foreground outline-none focus:outline-none [&_.ProseMirror]:min-h-[10rem] [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1",
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
        emit("cancel");
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
            imageNodes.push({ type: "threadImageBadge", attrs: { path: pathFromFile(file), name: file.name } });
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

function attachmentEmoji(name: string, isImage: boolean): string {
  if (isImage) return "\u{1F5BC}\uFE0F";
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot + 1) : "";
  const map: Record<string, string> = {
    pdf: "\u{1F4D5}",
    md: "\u{1F4DD}",
    txt: "\u{1F4C4}",
    json: "\u{1F4CB}",
    csv: "\u{1F4CA}",
    ts: "\u{1F4D8}",
    tsx: "\u{1F4D8}",
    js: "\u{1F4D9}",
    jsx: "\u{1F4D9}",
    vue: "\u{1F49A}",
    py: "\u{1F40D}",
    rs: "\u{1F980}",
    go: "\u{1F439}",
    rb: "\u{1F48E}",
    sh: "\u{1F5A5}\uFE0F"
  };
  return map[ext] ?? "\u{1F4C4}";
}

function clearAttachments(): void {
  skillAttachments.value = [];
  fileAttachments.value = [];
}

function removeSkillAttachment(id: string): void {
  skillAttachments.value = skillAttachments.value.filter((a) => a.id !== id);
}

function removeFileAttachment(id: string): void {
  fileAttachments.value = fileAttachments.value.filter((a) => a.id !== id);
}

function addFilesFromList(files: FileList | File[]): void {
  const editor = threadPromptEditor.value;
  for (const file of Array.from(files)) {
    const path = pathFromFile(file);
    const name = file.name;
    const isImage = isImageFile(file);
    if (isImage && editor) {
      editor.chain().focus("end").insertContent([{ type: "threadImageBadge", attrs: { path, name } }]).run();
    } else {
      fileAttachments.value.push({ id: crypto.randomUUID(), path, name, isImage });
    }
  }
}

function onFileInputChange(e: Event): void {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) addFilesFromList(input.files);
  input.value = "";
}

function onInlineEditorDragOver(e: DragEvent): void {
  if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
}

function onInlineEditorDrop(e: DragEvent): void {
  const dt = e.dataTransfer;
  if (!dt?.files?.length) return;
  e.stopPropagation();
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
  if (skillPaths.size > 0) parts.push(`[Attached skills]\n${[...skillPaths].join("\n")}`);
  if (filePaths.size > 0) parts.push(`[Attached files]\n${[...filePaths].join("\n")}`);
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
  const payload: ThreadCreateWithAgentPayload = { agent: selectedAgent.value, prompt };
  if (threadTitle) payload.threadTitle = threadTitle;
  emit("submit", payload);
}

onMounted(() => {
  void nextTick(() => {
    threadPromptEditor.value?.commands.focus("end");
  });
});

onBeforeUnmount(() => {
  clearAttachments();
});

defineExpose({ submit });
</script>

<template>
  <section
    data-testid="inline-prompt-editor"
    class="flex min-h-0 flex-1 flex-col overflow-hidden bg-card text-card-foreground"
    @dragover="onInlineEditorDragOver"
    @drop="onInlineEditorDrop"
  >
    <!-- Tiptap editor — fills remaining vertical space -->
    <div
      class="thread-create-prompt-host min-h-0 flex-1 overflow-y-auto border-0 bg-transparent"
      role="presentation"
    >
      <editor-content
        v-if="threadPromptEditor"
        :editor="threadPromptEditor"
        class="min-h-full w-full border-0 bg-transparent"
      />
    </div>

    <!-- Attachment strips -->
    <div
      v-if="skillAttachments.length || fileAttachments.length"
      class="flex flex-col gap-1 border-t border-border px-3 py-1.5"
    >
      <div v-if="skillAttachments.length" class="flex flex-nowrap gap-1.5 overflow-x-auto [scrollbar-width:thin]">
        <div
          v-for="a in skillAttachments"
          :key="a.id"
          :class="cn(badgeVariants({ variant: 'secondary' }), 'inline-flex h-7 max-w-[16rem] items-center gap-1 pl-2 pr-1')"
        >
          <BookMarked class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span class="min-w-0 truncate font-medium text-foreground">{{ a.name }}</span>
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
      <div v-if="fileAttachments.length" class="flex flex-nowrap gap-1.5 overflow-x-auto [scrollbar-width:thin]">
        <div
          v-for="a in fileAttachments"
          :key="a.id"
          :class="cn(badgeVariants({ variant: 'secondary' }), 'inline-flex h-7 max-w-none shrink-0 items-center gap-1 pl-2 pr-1')"
        >
          <span aria-hidden="true">{{ attachmentEmoji(a.name, a.isImage) }}</span>
          <span class="min-w-0 truncate font-mono text-[11px] font-medium text-foreground">{{ a.isImage ? a.name : a.path }}</span>
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

    <!-- Bottom action bar -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted px-2.5 py-2">
      <div class="flex items-center gap-1">
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
          data-testid="inline-prompt-add-file"
          @click="fileInputRef?.click()"
        >
          <Paperclip class="h-5 w-5" stroke-width="2" />
        </Button>
      </div>

      <div class="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
        <div class="flex min-w-0 flex-col gap-1">
          <label class="sr-only" for="inline-prompt-agent-select">Model</label>
          <Select v-model="selectedAgent">
            <SelectTrigger
              id="inline-prompt-agent-select"
              class="h-9 w-full min-w-[12rem] max-w-[16rem] shrink border-input bg-background text-xs font-medium shadow-xs"
              :aria-label="`Model: ${selectedAgentLabel}`"
              data-testid="inline-prompt-agent-select"
            >
              <span class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                <AgentIcon :agent="selectedAgent" :size="18" class="shrink-0" />
                <span class="truncate text-left">{{ selectedAgentLabel }}</span>
              </span>
            </SelectTrigger>
            <SelectContent>
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
          variant="ghost"
          size="sm"
          class="h-9 rounded-lg text-xs text-muted-foreground"
          aria-label="Cancel"
          data-testid="inline-prompt-cancel"
          @click="emit('cancel')"
        >
          Cancel
        </Button>

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
    </div>
  </section>
</template>

<style scoped>
.thread-create-prompt-host :deep(.ProseMirror p.is-empty::before) {
  content: attr(data-placeholder);
  float: left;
  color: var(--color-muted-foreground);
  pointer-events: none;
  height: 0;
}
</style>
