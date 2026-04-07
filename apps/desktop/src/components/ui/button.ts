export type ButtonVariant =
  | "default"
  | "primary"
  | "outline"
  | "secondary"
  | "ghost"
  | "destructive"
  | "link";

export type ButtonSize =
  | "default"
  | "md"
  | "xs"
  | "sm"
  | "lg"
  | "icon"
  | "icon-xs"
  | "icon-sm"
  | "icon-lg";

export const defaultButtonVariant: ButtonVariant = "default";
export const defaultButtonSize: ButtonSize = "default";

/**
 * Base button styles. Do not use `border-transparent` here: it often sorts after
 * `border-border` in compiled CSS and hides outline-variant borders. Add
 * `border-transparent` per variant that should not show an edge.
 */
export const buttonBaseClass =
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

const buttonVariantClassMapCore = {
  default:
    "border-transparent bg-primary text-primary-foreground [a]:hover:bg-primary/80",
  outline:
    "border-border shadow-xs bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
  secondary:
    "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
  ghost:
    "border-transparent hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
  destructive:
    "border-transparent bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
  link: "border-transparent text-primary underline-offset-4 hover:underline"
} as const;

export type ButtonVariantCore = keyof typeof buttonVariantClassMapCore;

export const buttonVariantClassMap: Record<ButtonVariantCore, string> = buttonVariantClassMapCore;

const buttonSizeClassMapCore = {
  default:
    "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
  xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
  sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
  lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
  icon: "size-8",
  "icon-xs":
    "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-2",
  "icon-sm":
    "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
  "icon-lg": "size-9"
} as const;

export type ButtonSizeCore = keyof typeof buttonSizeClassMapCore;

export const buttonSizeClassMap: Record<ButtonSizeCore, string> = buttonSizeClassMapCore;

function resolveVariant(variant: ButtonVariant): ButtonVariantCore {
  return variant === "primary" ? "default" : variant;
}

function resolveSize(size: ButtonSize): ButtonSizeCore {
  return size === "md" ? "default" : size;
}

export function buttonClass({
  variant = defaultButtonVariant,
  size = defaultButtonSize,
  className
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  const v = resolveVariant(variant);
  const s = resolveSize(size);
  return [buttonBaseClass, buttonVariantClassMap[v], buttonSizeClassMap[s], className].filter(Boolean).join(" ");
}
