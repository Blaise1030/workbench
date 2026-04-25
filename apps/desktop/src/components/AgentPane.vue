<script setup lang="ts">
import { computed } from "vue";
import {Button} from "@/components/ui/button";;
import { Textarea } from "@/components/ui/textarea";
import TerminalPane from "@/components/TerminalPane.vue";
import type { PendingAgentBootstrap } from "@shared/pendingAgentBootstrap";

const props = defineProps<{
  threadId: string;
  worktreeId: string;
  cwd: string;
  draft: string;
  pendingAgentBootstrap?: PendingAgentBootstrap | null;
}>();

const emit = defineEmits<{
  updateDraft: [value: string];
  sendDraft: [];
  discardDraft: [];
  bootstrapConsumed: [];
}>();

const draftModel = computed({
  get: () => props.draft,
  set: (value: string) => {
    emit("updateDraft", value);
  }
});
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden text-card-foreground">
    <header class="border-b border-border px-3 py-2">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold">Agent</h2>
        <div class="flex items-center gap-2">
          <Button data-testid="agent-send-draft" type="button" size="sm" @click="emit('sendDraft')">
            Send
          </Button>
          <Button
            data-testid="agent-discard-draft"
            type="button"
            variant="outline"
            size="sm"
            @click="emit('discardDraft')"
          >
            Discard
          </Button>
        </div>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
      <label class="flex min-h-0 flex-1 flex-col gap-2 text-xs">
        <span class="font-medium text-muted-foreground">Draft</span>
        <Textarea
          v-model="draftModel"
          class="min-h-28 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          spellcheck="false"
        />
      </label>

      <div class="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
        <TerminalPane
          pty-kind="agent"
          :worktree-id="worktreeId"
          :thread-id="threadId"
          :cwd="cwd"
          :pending-agent-bootstrap="pendingAgentBootstrap"
          @bootstrap-consumed="emit('bootstrapConsumed')"
        />
      </div>
    </div>
  </section>
</template>
