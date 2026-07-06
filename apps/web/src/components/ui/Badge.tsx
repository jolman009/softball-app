/**
 * Badge — compact inline status pill for the softball-app design system.
 *
 * Replaces ad-hoc inline badge class strings that are copy-pasted across
 * AdminDashboardPage, AdminBookingsPage, ClientDashboardPage, and
 * ClientUploadsSection.
 *
 * VARIANTS (token → bg / text)
 *   default      chalk bg / ink/65 — neutral / archived / inactive
 *   primary      ink bg / white    — hold, pending, unread counts
 *   positive     field/15 bg / field — confirmed (completed light)
 *   positive-solid field bg / white — confirmed (solid)
 *   warning      amber-100 / amber-800 — hold/pending alt (AdminBookingsPage used this)
 *   destructive  clay bg / white   — no-show, blocked
 *   destructive-light clay/15 / clay — cancelled, warning
 *   info         ink/5 bg / ink/65  — uncategorised
 *
 * SIZE
 *   sm  text-xs px-2   py-0.5
 *   md  text-xs px-2.5 py-1   — default (matches most existing badges)
 */
import type { ReactNode } from "react";

export type BadgeVariant =
  | "default"
  | "primary"
  | "positive"
  | "positive-solid"
  | "warning"
  | "destructive"
  | "destructive-light"
  | "info";

export type BadgeSize = "sm" | "md";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-chalk text-ink/65",
  primary: "bg-ink text-white",
  positive: "bg-field/15 text-field",
  "positive-solid": "bg-field text-white",
  warning: "bg-amber-100 text-amber-800",
  destructive: "bg-clay text-white",
  "destructive-light": "bg-clay/15 text-clay",
  info: "bg-ink/5 text-ink/65",
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-xs",
};

export interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
  className?: string;
}

export function Badge({
  variant = "default",
  size = "md",
  children,
  className = "",
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded font-bold uppercase tracking-wide",
        sizeClasses[size],
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
