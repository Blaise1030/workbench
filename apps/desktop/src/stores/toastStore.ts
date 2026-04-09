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

type PersistedToastRecord = ToastRecord & {
  expiresAt: number | null;
};

const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

const DEFAULT_DURATION_MS = 10_000;
const TOAST_STORAGE_KEY = "instrument.toast.items";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readPersistedItems(): PersistedToastRecord[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(TOAST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const items: PersistedToastRecord[] = [];
    for (const candidate of parsed) {
      if (!candidate || typeof candidate !== "object") continue;
      const id = String((candidate as { id?: unknown }).id ?? "").trim();
      const title = String((candidate as { title?: unknown }).title ?? "").trim();
      const description = String((candidate as { description?: unknown }).description ?? "").trim();
      if (!id || !title || !description) continue;
      const expiresRaw = (candidate as { expiresAt?: unknown }).expiresAt;
      const expiresAt = typeof expiresRaw === "number" && Number.isFinite(expiresRaw) ? expiresRaw : null;
      if (expiresAt !== null && expiresAt <= now) continue;
      items.push({
        id,
        title,
        description,
        variant: normalizeToastVariant((candidate as { variant?: unknown }).variant),
        expiresAt
      });
    }
    return items;
  } catch {
    return [];
  }
}

function writePersistedItems(items: PersistedToastRecord[]): void {
  if (!canUseStorage()) return;
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(TOAST_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(TOAST_STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota / private mode */
  }
}

export const useToastStore = defineStore("toast", {
  state: () => ({
    items: readPersistedItems() as PersistedToastRecord[]
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
      const expiresAt = duration > 0 ? Date.now() + duration : null;
      this.items.push({ id, title: options.title, description: options.description, variant, expiresAt });
      writePersistedItems(this.items);
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
      writePersistedItems(this.items);
    },
    hydratePersisted(): void {
      const now = Date.now();
      for (const [id, timer] of dismissTimers.entries()) {
        if (!this.items.some((item) => item.id === id)) {
          clearTimeout(timer);
          dismissTimers.delete(id);
        }
      }
      this.items.forEach((item) => {
        if (item.expiresAt == null) return;
        const existing = dismissTimers.get(item.id);
        if (existing) {
          clearTimeout(existing);
          dismissTimers.delete(item.id);
        }
        const remainingMs = item.expiresAt - now;
        if (remainingMs <= 0) return;
        dismissTimers.set(
          item.id,
          setTimeout(() => {
            this.dismiss(item.id);
          }, remainingMs)
        );
      });
      writePersistedItems(this.items);
    }
  }
});
