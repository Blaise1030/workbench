export type AlertVariant = "default" | "destructive";

export const defaultAlertVariant: AlertVariant = "default";

/**
 * Alert root styles aligned with shadcn/ui Alert (Radix doc).
 * Grid layout supports an optional leading icon (`> svg` as first child).
 */
const alertRootBase =
  "relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current";

const alertVariantClassMap = {
  default: "bg-card text-card-foreground",
  destructive:
    "text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90"
} as const satisfies Record<AlertVariant, string>;

export const alertTitleClass =
  "col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight";

export const alertDescriptionClass =
  "col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed";

export function alertClass({
  variant = defaultAlertVariant,
  className
}: {
  variant?: AlertVariant;
  className?: string;
}): string {
  return [alertRootBase, alertVariantClassMap[variant], className].filter(Boolean).join(" ");
}
