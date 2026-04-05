import { twMerge } from "tailwind-merge";

export function cn(...inputs: Array<string | undefined | null | false>): string {
  return twMerge(inputs.filter((x): x is string => Boolean(x)));
}
