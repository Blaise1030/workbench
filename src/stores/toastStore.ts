import { defineStore } from "pinia";

export type ToastVariant = "error" | "success";

export function normalizeToastVariant(value: unknown): ToastVariant {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  return s === "success" ? "success" : "error";
}

export type ToastRecord = {
  id: string;
  title: string;
  description: string;
  variant: ToastVariant;
};

const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

const DEFAULT_DURATION_MS = 10_000;

export const useToastStore = defineStore("toast", {
  state: () => ({
    items: [] as ToastRecord[]
  }),
  actions: {
    show(options: {
      title: string;
      description: string;
      variant?: ToastVariant;
      durationMs?: number;
    }): string {
      const id = crypto.randomUUID();
      const variant = normalizeToastVariant(options.variant);
      const duration = options.durationMs ?? DEFAULT_DURATION_MS;
      this.items.push({ id, title: options.title, description: options.description, variant });
      if (duration > 0) {
        dismissTimers.set(
          id,
          setTimeout(() => {
            this.dismiss(id);
          }, duration)
        );
      }
      return id;
    },
    dismiss(id: string): void {
      const t = dismissTimers.get(id);
      if (t) {
        clearTimeout(t);
        dismissTimers.delete(id);
      }
      this.items = this.items.filter((x) => x.id !== id);
    }
  }
});
