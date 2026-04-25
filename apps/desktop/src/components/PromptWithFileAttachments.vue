<script setup lang="ts">
import type { Editor } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { Check, Paperclip, X } from "lucide-vue-next";
import type { Ref } from "vue";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {Button} from "@/components/ui/button";;
import { Textarea } from "@/components/ui/textarea";
import { badgeVariants } from "@/components/ui/badge/index";
import {
  createThreadCreatePromptExtensions,
  isThreadCreateSuggestionActive,
  ThreadFileBadge,
  ThreadImageBadge,
  ThreadQueueContextTag
} from "@/lib/threadCreateEditorExtensions";
import { collectDocAttachmentPaths } from "@/lib/threadCreatePromptSerialize";
import { isImageFile, pathFromFile, type LocalFileAttachment } from "@/lib/localFileAttachment";
import { THREAD_PROMPT_BLOCK_SEP, promptDocFlatText } from "@/lib/threadCreateTipTap";
import { cn } from "@/lib/utils";

const props = withDefaults(
  defineProps<{
    placeholder?: string;
    rows?: number;
    /** Textarea min height class */
    textareaClass?: string;
    testIdPrefix?: string;
    /** When true, renders a TipTap editor with @ mentions and / commands instead of a plain textarea */
    tiptap?: boolean;
    /** Worktree absolute path — required for @ file mention resolution in tiptap mode */
    worktreePath?: string | null;
    /** Queue review: inline badge label (e.g. `[Agent 1:7]`) at start of editor */
    contextTagLabel?: string | null;
    /** Queue review: show Remove row in footer beside Done */
    showQueueRemove?: boolean;
    /** Accessible label for the queue Remove control */
    queueRemoveAriaLabel?: string;
    /** TipTap mode: show the internal Done control that toggles to read-only blob */
    showDoneButton?: boolean;
  }>(),
  {
    placeholder: "",
    rows: 3,
    textareaClass: "min-h-[4.5rem]",
    testIdPrefix: "prompt-attachments",
    tiptap: false,
    worktreePath: null,
    contextTagLabel: null,
    showQueueRemove: false,
    queueRemoveAriaLabel: "Remove this queue entry",
    showDoneButton: true
  }
);

const emit = defineEmits<{
  queueRemove: [];
}>();

const prompt = defineModel<string>("prompt", { default: "" });
const attachments = defineModel<LocalFileAttachment[]>("attachments", { default: () => [] });
const skillPaths = defineModel<string[]>("skillPaths", { default: () => [] });

const fileInputRef = ref<HTMLInputElement | null>(null);

/** Push TipTap doc → v-models (flat note + inline file paths). Call on Done and unmount. */
function applyEditorToModels(editor: Editor): void {
  prompt.value = promptDocFlatText(editor.state.doc);
  const { filePaths, skillPaths: inlineSkillPaths } = collectDocAttachmentPaths(editor.state.doc);
  const baseName = (p: string) => p.split("/").pop() ?? p;
  const isImagePath = (p: string) =>
    /\.(png|jpg|jpeg|gif|webp|svg|bmp|tiff|ico)$/i.test(baseName(p));
  const inlineAttachments: LocalFileAttachment[] = filePaths.map((p) => ({
    id: p,
    path: p,
    name: baseName(p),
    isImage: isImagePath(p)
  }));
  const stripNonImages = attachments.value.filter((a) => !a.isImage);
  const seen = new Set<string>();
  attachments.value = [...inlineAttachments, ...stripNonImages].filter((a) => {
    if (seen.has(a.path)) return false;
    seen.add(a.path);
    return true;
  });
  skillPaths.value = [...inlineSkillPaths];
}

// TipTap editor — only instantiated when tiptap=true (prop is static after mount)
const tiptapEditor: Ref<Editor | null | undefined> = props.tiptap
  ? useEditor({
      extensions: [
        StarterKit.configure({ heading: false, codeBlock: false }),
        Placeholder.configure({
          placeholder:
            props.placeholder ||
            "Optional note for the agent — use @ for files, / for skills, paperclip for attachments"
        }),
        ThreadQueueContextTag,
        ThreadImageBadge,
        ThreadFileBadge,
        createThreadCreatePromptExtensions({ getWorktreePath: () => props.worktreePath })
      ],
      content: "<p></p>",
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class:
            "tiptap min-h-[7rem] max-h-[12rem] overflow-y-auto px-2.5 py-1.5 text-[13px] leading-snug text-foreground outline-none focus:outline-none [&_p]:my-0.5 [&_p:first-child]:mb-0",
          role: "textbox",
          "aria-multiline": "true",
          "aria-placeholder":
            props.placeholder ||
            "Optional note for the agent — use @ for files, / for skills, paperclip for attachments"
        },
        handleKeyDown(view, event) {
          if (isThreadCreateSuggestionActive(view)) {
            if (event.key === "Enter" && !event.shiftKey) return false;
            if (event.key === "Escape") return false;
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
            const editor = tiptapEditor.value;
            if (!editor) return true;
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (coords == null) return true;
            const pos = coords.pos;
            const doc = editor.state.doc;
            const seen = new Set<string>();
            const inserts: { type: string; attrs: { path: string; name: string } }[] = [];
            for (const file of Array.from(dt.files)) {
              const path = pathFromFile(file);
              if (seen.has(path) || docHasAttachmentPath(doc, path)) continue;
              seen.add(path);
              if (isImageFile(file)) {
                inserts.push({ type: "threadImageBadge", attrs: { path, name: file.name } });
              } else {
                inserts.push({ type: "threadFileBadge", attrs: { path, name: file.name } });
              }
            }
            if (inserts.length > 0) {
              editor.chain().focus().insertContentAt(pos, inserts).run();
            }
            return true;
          }
        }
      }
    })
  : ref(null);

onMounted(() => {
  if (!props.tiptap) return;
  // `immediatelyRender: false` defers mounting the ProseMirror view; focus after it exists.
  void nextTick(() => {
    void nextTick(() => {
      tiptapEditor.value?.chain().focus("end").run();
    });
  });
});

onBeforeUnmount(() => {
  const ed = tiptapEditor.value;
  if (props.tiptap && ed && !ed.isDestroyed) {
    applyEditorToModels(ed);
  }
});

/** Whether the TipTap editor is in edit mode (vs read-only blob). Starts true. */
const isEditing = ref(true);

const isDocEmpty = computed(() => tiptapEditor.value?.isEmpty ?? true);

watch(isEditing, (v) => {
  tiptapEditor.value?.setEditable(v);
});

function flatTextToDocJson(text: string, contextTag: string | null) {
  const tag = contextTag?.trim() || null;
  const lines = text.split(THREAD_PROMPT_BLOCK_SEP);
  const content: Record<string, unknown>[] = [];
  if (tag) {
    content.push({
      type: "paragraph",
      content: [{ type: "threadQueueContextTag", attrs: { label: tag } }]
    });
  }
  for (const line of lines) {
    content.push({
      type: "paragraph",
      content: line.length > 0 ? [{ type: "text", text: line }] : []
    });
  }
  return { type: "doc", content };
}

function firstContextTagLabelInDoc(doc: Parameters<typeof promptDocFlatText>[0]): string | null {
  let found: string | null = null;
  doc.descendants((node) => {
    if (node.type.name === "threadQueueContextTag") {
      found = String(node.attrs.label ?? "");
      return false;
    }
  });
  return found;
}

function findFirstQueueContextTagDocPos(doc: Parameters<typeof promptDocFlatText>[0]): number | null {
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (node.type.name === "threadQueueContextTag") {
      found = pos;
      return false;
    }
  });
  return found;
}

/** Hydrate TipTap from v-model when the prompt or context tag changes externally. */
watch(
  () => [props.tiptap, prompt.value, tiptapEditor.value, props.contextTagLabel] as const,
  () => {
    if (!props.tiptap) return;
    const editor = tiptapEditor.value;
    if (!editor) return;
    const desired = prompt.value ?? "";
    const desiredTag = props.contextTagLabel?.trim() ?? "";
    const current = promptDocFlatText(editor.state.doc);
    const currentTag = firstContextTagLabelInDoc(editor.state.doc) ?? "";
    if (current === desired && currentTag === desiredTag) return;

    // When only the queue badge label changes (e.g. paste line span updated), patch the tag
    // in-place so @ file badges and other atoms are not wiped by setContent.
    if (current === desired && currentTag !== desiredTag) {
      const tagPos = findFirstQueueContextTagDocPos(editor.state.doc);
      if (tagPos !== null) {
        const tr = editor.state.tr.setNodeMarkup(tagPos, undefined, { label: desiredTag });
        editor.view.dispatch(tr);
        return;
      }
    }

    editor.commands.setContent(flatTextToDocJson(desired, desiredTag || null), false);
  },
  { flush: "post", immediate: true }
);

function onQueueRemoveClick(): void {
  emit("queueRemove");
}

function docHasAttachmentPath(doc: Parameters<typeof promptDocFlatText>[0], path: string): boolean {
  let found = false;
  doc.descendants((node) => {
    if (node.type.name === "threadFileBadge" || node.type.name === "threadImageBadge") {
      if (String(node.attrs.path ?? "") === path) found = true;
    }
  });
  return found;
}

function onDone(): void {
  const editor = tiptapEditor.value;
  if (editor) applyEditorToModels(editor);
  isEditing.value = false;
}

function onBlobClick(): void {
  isEditing.value = true;
  void nextTick(() => tiptapEditor.value?.commands.focus("end"));
}

/** Only intercept Space/Enter on the blob wrapper; `.prevent` on the template would block TipTap while editing. */
function onBlobWrapperKeydownSpace(e: KeyboardEvent): void {
  if (isEditing.value || isDocEmpty.value) return;
  e.preventDefault();
  onBlobClick();
}

function onBlobWrapperKeydownEnter(e: KeyboardEvent): void {
  if (isEditing.value || isDocEmpty.value) return;
  e.preventDefault();
  onBlobClick();
}

function addFilesFromListTipTap(files: FileList | File[]): void {
  const editor = tiptapEditor.value;
  for (const file of Array.from(files)) {
    const path = pathFromFile(file);
    const name = file.name;
    if (!editor) continue;
    if (isImageFile(file)) {
      if (!docHasAttachmentPath(editor.state.doc, path)) {
        editor.chain().focus("end").insertContent([{ type: "threadImageBadge", attrs: { path, name } }]).run();
      }
    } else if (!docHasAttachmentPath(editor.state.doc, path)) {
      editor.chain().focus("end").insertContent([{ type: "threadFileBadge", attrs: { path, name } }]).run();
    }
  }
}

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
    py: "🐍"
  };
  return map[ext] ?? "📎";
}

function addFilesFromList(files: FileList | File[]): void {
  if (props.tiptap) {
    addFilesFromListTipTap(files);
    return;
  }
  const next: LocalFileAttachment[] = [...attachments.value];
  for (const file of Array.from(files)) {
    const path = pathFromFile(file);
    const name = file.name;
    const isImage = isImageFile(file);
    next.push({
      id: crypto.randomUUID(),
      path,
      name,
      isImage
    });
  }
  attachments.value = next;
}

function onFileInputChange(e: Event): void {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length) return;
  addFilesFromList(input.files);
  input.value = "";
}

function removeAttachment(id: string): void {
  attachments.value = attachments.value.filter((a) => a.id !== id);
}

function isFileDrag(dt: DataTransfer | null): boolean {
  return dt ? [...dt.types].includes("Files") : false;
}

function onDragOver(e: DragEvent): void {
  if (!isFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
}

function onDrop(e: DragEvent): void {
  if (!isFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  e.stopPropagation();
  const dt = e.dataTransfer;
  if (!dt?.files?.length) return;
  addFilesFromList(dt.files);
}

defineExpose({
  openFilePicker: () => fileInputRef.value?.click(),
  flushToModels: () => {
    const editor = tiptapEditor.value;
    if (editor) applyEditorToModels(editor);
  }
});
</script>

<template>
  <!-- ── Plain textarea mode ───────────────────────────── -->
  <div v-if="!tiptap" @dragover="onDragOver" @drop="onDrop">
    <Textarea
      v-model="prompt"
      :data-testid="`${testIdPrefix}-textarea`"
      :rows="rows"
      :placeholder="placeholder"
      :class="
        cn(
          'w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 font-sans text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          textareaClass
        )
      "
    />

    <div
      v-if="attachments.length"
      class="mt-1.5 flex flex-nowrap gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
      :data-testid="`${testIdPrefix}-files-strip`"
    >
      <div
        v-for="a in attachments"
        :key="a.id"
        :class="
          cn(
            badgeVariants({ variant: 'secondary' }),
            'inline-flex h-6 max-w-none shrink-0 items-center gap-0.5 rounded-full border-border/60 bg-muted/70 py-0 pl-1.5 pr-0.5 text-[11px] shadow-none'
          )
        "
        :title="a.path"
      >
        <span class="shrink-0 text-[12px] leading-none" aria-hidden="true">{{
          attachmentEmoji(a.name, a.isImage)
        }}</span>
        <span class="min-w-0 truncate font-mono text-[10px] font-medium text-foreground">{{
          a.isImage ? a.name : a.path
        }}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          class="size-5 shrink-0 rounded-full text-muted-foreground hover:bg-background/80 hover:text-destructive"
          :aria-label="`Remove attached file ${a.path}`"
          @click="removeAttachment(a.id)"
        >
          <X class="size-2.5" aria-hidden="true" />
        </Button>
      </div>
    </div>

    <div class="mt-1 flex items-center gap-1">
      <input
        ref="fileInputRef"
        type="file"
        class="hidden"
        multiple
        accept="image/*,.pdf,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.vue,.py,.rs,.go,.toml,.yaml,.yml,.c,.cpp,.h,.java,.kt,.swift,.rb,.php,.sh,.zsh,.bash,.env"
        aria-label="Attach files or images"
        :data-testid="`${testIdPrefix}-file-input`"
        @change="onFileInputChange"
      />
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        class="h-7 w-7 shrink-0 rounded-md"
        title="Attach files or images"
        aria-label="Attach files or images"
        :data-testid="`${testIdPrefix}-add-file`"
        @click="fileInputRef?.click()"
      >
        <Paperclip class="size-3.5" stroke-width="2" />
      </Button>
    </div>
  </div>

  <!-- ── TipTap mode ─────────────────────────────────────────────── -->
  <div v-else @dragover="onDragOver" @drop="onDrop">
    <input
      ref="fileInputRef"
      type="file"
      class="hidden"
      multiple
      accept="image/*,.pdf,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.vue,.py,.rs,.go,.toml,.yaml,.yml,.c,.cpp,.h,.java,.kt,.swift,.rb,.php,.sh,.zsh,.bash,.env"
      aria-label="Attach files or images"
      :data-testid="`${testIdPrefix}-file-input`"
      @change="onFileInputChange"
    />

    <div
      :class="
        isEditing
          ? 'flex flex-col overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2'
          : isDocEmpty
            ? 'hidden'
            : 'w-full cursor-text rounded-md border border-input bg-muted/30 px-2 py-1 text-[13px] text-foreground shadow-xs hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
      "
      :role="!isEditing && !isDocEmpty ? 'button' : undefined"
      :tabindex="!isEditing && !isDocEmpty ? 0 : undefined"
      :data-testid="
        isEditing
          ? `${testIdPrefix}-tiptap-placeholder-hint`
          : !isDocEmpty
            ? `${testIdPrefix}-tiptap-blob`
            : undefined
      "
      :aria-label="!isEditing && !isDocEmpty ? 'Click to edit comment' : undefined"
      @click="!isEditing && !isDocEmpty ? onBlobClick() : undefined"
      @keydown.enter="onBlobWrapperKeydownEnter"
      @keydown.space="onBlobWrapperKeydownSpace"
    >
      <EditorContent :editor="tiptapEditor" />
    </div>

    <div
      v-if="isEditing && attachments.length && !tiptap"
      class="mt-1.5 flex flex-nowrap gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
      :data-testid="`${testIdPrefix}-files-strip`"
    >
      <div
        v-for="a in attachments"
        :key="a.id"
        :class="
          cn(
            badgeVariants({ variant: 'secondary' }),
            'inline-flex h-6 max-w-none shrink-0 items-center gap-0.5 rounded-full border-border/60 bg-muted/70 py-0 pl-1.5 pr-0.5 text-[11px] shadow-none'
          )
        "
        :title="a.path"
      >
        <span class="shrink-0 text-[12px] leading-none" aria-hidden="true">{{
          attachmentEmoji(a.name, a.isImage)
        }}</span>
        <span class="min-w-0 truncate font-mono text-[10px] font-medium text-foreground">{{
          a.isImage ? a.name : a.path
        }}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          class="size-5 shrink-0 rounded-full text-muted-foreground hover:bg-background/80 hover:text-destructive"
          :aria-label="`Remove attached file ${a.path}`"
          @click="removeAttachment(a.id)"
        >
          <X class="size-2.5" aria-hidden="true" />
        </Button>
      </div>
    </div>

    <div v-if="isEditing" class="mt-1 flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        class="h-7 w-7 shrink-0 rounded-md"
        title="Attach files or images"
        aria-label="Attach files or images"
        :data-testid="`${testIdPrefix}-add-file`"
        @click="fileInputRef?.click()"
      >
        <Paperclip class="size-3.5" stroke-width="2" />
      </Button>
      <slot name="footer">
        <div class="ms-auto flex items-center gap-1.5">
          <Button
            v-if="showQueueRemove"
            type="button"
            variant="ghost"
            size="sm"
            class="h-7 px-2.5 text-[11px] text-muted-foreground hover:text-destructive"
            :data-testid="`${testIdPrefix}-queue-remove`"
            :aria-label="queueRemoveAriaLabel"
            @click="onQueueRemoveClick"
          >
            Remove
          </Button>
          <Button
            v-if="showDoneButton"
            type="button"
            variant="outline"
            size="sm"
            class="inline-flex h-7 items-center gap-1.5 px-2.5 text-[11px]"
            :data-testid="`${testIdPrefix}-tiptap-done`"
            @click="onDone"
          >
            <Check class="size-3.5 shrink-0" stroke-width="2" aria-hidden="true" />
            <span>Done</span>
          </Button>
        </div>
      </slot>      
    </div>
  </div>
</template>
