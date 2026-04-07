import { useToastStore } from "@/stores/toastStore";

export function useToast(): {
  error: (title: string, description: string) => string;
  success: (title: string, description: string) => string;
  dismiss: (id: string) => void;
} {
  const store = useToastStore();
  return {
    error(title: string, description: string): string {
      return store.show({ title, description, variant: "error" });
    },
    success(title: string, description: string): string {
      return store.show({ title, description, variant: "success", durationMs: 5_000 });
    },
    dismiss: (id: string): void => store.dismiss(id)
  };
}
