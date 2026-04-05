import { useToastStore } from "@/stores/toastStore";

export function useToast(): {
  error: (title: string, description: string) => string;
  dismiss: (id: string) => void;
} {
  const store = useToastStore();
  return {
    error(title: string, description: string): string {
      return store.show({ title, description, variant: "error" });
    },
    dismiss: (id: string): void => store.dismiss(id)
  };
}
