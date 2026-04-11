<script setup lang="ts">
import { Paperclip, X } from "lucide-vue-next";
import { ref } from "vue";
import Button from "@/components/ui/Button.vue";
import Textarea from "@/components/ui/Textarea.vue";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isImageFile, pathFromFile, type LocalFileAttachment } from "@/lib/localFileAttachment";

const props = withDefaults(
  defineProps<{
    placeholder?: string;
    rows?: number;
    /** Textarea min height class */
    textareaClass?: string;
    testIdPrefix?: string;
  }>(),
  {
    placeholder: "",
    rows: 3,
    textareaClass: "min-h-[4.5rem]",
    testIdPrefix: "prompt-attachments"
  }
);

const prompt = defineModel<string>("prompt", { default: "" });
const attachments = defineModel<LocalFileAttachment[]>("attachments", { default: () => [] });

const fileInputRef = ref<HTMLInputElement | null>(null);

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
  openFilePicker: () => fileInputRef.value?.click()
});
</script>

<template>
  <div @dragover="onDragOver" @drop="onDrop">
    <Textarea
      v-model="prompt"
      :data-testid="`${testIdPrefix}-textarea`"
      :rows="rows"
      :placeholder="placeholder"
      :class="
        cn(
          'w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(212,92%,45%)] focus-visible:ring-offset-0 dark:focus-visible:ring-[hsl(212,92%,58%)]',
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
</template>
