import { toast } from "vue-sonner";

export type ToastVariant = "error" | "success";

type PersistedToastRecord = {
  id: string;
  title: string;
  description: string;
  variant: ToastVariant;
  expiresAt: number | null;
};

const TOAST_STORAGE_KEY = "instrument.toast.items";
const DEFAULT_DURATION_MS = 10_000;
const SUCCESS_DURATION_MS = 5_000;
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
      const variantRaw = String((candidate as { variant?: unknown }).variant ?? "").trim().toLowerCase();
      if (!id || !title || !description) continue;
      if (variantRaw !== "error" && variantRaw !== "success") continue;
      const expiresRaw = (candidate as { expiresAt?: unknown }).expiresAt;
      const expiresAt = typeof expiresRaw === "number" && Number.isFinite(expiresRaw) ? expiresRaw : null;
      if (expiresAt !== null && expiresAt <= now) continue;
      items.push({
        id,
        title,
        description,
        variant: variantRaw,
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

function upsertPersistedItem(item: PersistedToastRecord): void {
  const items = readPersistedItems().filter((existing) => existing.id !== item.id);
  items.push(item);
  writePersistedItems(items);
}

function removePersistedItem(id: string): void {
  const items = readPersistedItems().filter((existing) => existing.id !== id);
  writePersistedItems(items);
}

function trackExpiry(id: string, expiresAt: number | null): void {
  const existing = dismissTimers.get(id);
  if (existing) {
    clearTimeout(existing);
    dismissTimers.delete(id);
  }
  if (expiresAt == null) return;
  const delay = expiresAt - Date.now();
  if (delay <= 0) {
    removePersistedItem(id);
    return;
  }
  dismissTimers.set(
    id,
    setTimeout(() => {
      dismissTimers.delete(id);
      removePersistedItem(id);
    }, delay)
  );
}

function showWithVariant(
  variant: ToastVariant,
  title: string,
  description: string,
  durationMs: number,
  explicitId?: string
): string {
  const id = explicitId ?? crypto.randomUUID();
  if (variant === "success") {
    toast.success(title, { id, description, duration: durationMs });
  } else {
    toast.error(title, { id, description, duration: durationMs });
  }
  const expiresAt = durationMs > 0 ? Date.now() + durationMs : null;
  upsertPersistedItem({ id, title, description, variant, expiresAt });
  trackExpiry(id, expiresAt);
  return id;
}

export function hydratePersistedToasts(): void {
  const items = readPersistedItems();
  writePersistedItems(items);
  for (const item of items) {
    const duration = item.expiresAt == null ? DEFAULT_DURATION_MS : Math.max(item.expiresAt - Date.now(), 1);
    showWithVariant(item.variant, item.title, item.description, duration, item.id);
  }
}

export function useToast(): {
  error: (title: string, description: string) => string;
  success: (title: string, description: string) => string;
  dismiss: (id: string) => void;
} {
  return {
    error(title: string, description: string): string {
      return showWithVariant("error", title, description, DEFAULT_DURATION_MS);
    },
    success(title: string, description: string): string {
      return showWithVariant("success", title, description, SUCCESS_DURATION_MS);
    },
    dismiss(id: string): void {
      toast.dismiss(id);
      const timer = dismissTimers.get(id);
      if (timer) {
        clearTimeout(timer);
        dismissTimers.delete(id);
      }
      removePersistedItem(id);
    }
  };
}
