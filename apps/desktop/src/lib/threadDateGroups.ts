import type { Thread } from "@shared/domain";

export type RelativeDateBucket = "today" | "yesterday" | "pastWeek" | "older";

export interface ThreadDateSubgroup {
  label: string;
  threads: Thread[];
}

function startOfLocalCalendarDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole local calendar days between `day` (typically "today") and `instant`, non-negative when `instant` is on or before `day`. */
function wholeLocalDaysBefore(day: Date, instant: Date): number {
  const a = startOfLocalCalendarDay(day).getTime();
  const b = startOfLocalCalendarDay(instant).getTime();
  return Math.round((a - b) / 86_400_000);
}

export function threadRelativeDateBucket(createdAtIso: string, now: Date = new Date()): RelativeDateBucket {
  const created = new Date(createdAtIso);
  const diff = wholeLocalDaysBefore(now, created);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 7) return "pastWeek";
  return "older";
}

export function labelForRelativeDateBucket(bucket: RelativeDateBucket): string {
  switch (bucket) {
    case "today":
      return "Today";
    case "yesterday":
      return "Yesterday";
    case "pastWeek":
      return "Past week";
    case "older":
      return "Older";
  }
}

/** Assumes `threads` are already ordered (e.g. newest first). Emits one subgroup per contiguous bucket. */
export function groupThreadsByRelativeDate(
  threads: Thread[],
  now: Date = new Date()
): ThreadDateSubgroup[] {
  const out: ThreadDateSubgroup[] = [];
  for (const thread of threads) {
    const bucket = threadRelativeDateBucket(thread.createdAt, now);
    const label = labelForRelativeDateBucket(bucket);
    const prev = out[out.length - 1];
    if (prev?.label === label) {
      prev.threads.push(thread);
    } else {
      out.push({ label, threads: [thread] });
    }
  }
  return out;
}
