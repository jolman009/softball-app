/**
 * Alert — inline feedback banner for the softball-app design system.
 *
 * Replaces the 20+ repetitions of hand-coded banner patterns across all pages,
 * such as:
 *   <p className="rounded border border-clay/20 bg-clay/5 px-4 py-3 text-sm font-semibold text-clay">
 *   <p className="rounded border border-field/20 bg-field/5 px-4 py-2 text-sm font-semibold text-field">
 *   <p className="rounded border border-dashed border-ink/20 bg-chalk px-4 py-5 text-sm font-semibold text-ink/62">
 *
 * VARIANTS
 *   error    clay border + bg tint + clay text — validation / API errors
 *   success  field border + bg tint + field text — confirmations / notices
 *   info     dashed ink/20 border + chalk bg + ink/62 text — empty states, loading
 *
 * SIZE (controls vertical padding — horizontal is always px-4)
 *   sm  py-2
 *   md  py-3  — default
 *   lg  py-5  — empty-state placeholders
 *
 * The component renders a <p> by default. Pass `role="alert"` on error/success
 * banners that appear in response to user actions so screen readers announce them.
 */
import type { HTMLAttributes, ReactNode } from "react";

export type AlertVariant = "error" | "success" | "info";
export type AlertSize = "sm" | "md" | "lg";

const variantClasses: Record<AlertVariant, string> = {
  error: "border border-clay/20 bg-clay/5 text-clay",
  success: "border border-field/20 bg-field/5 text-field",
  // dashed border for empty/loading states — visually softer, clearly non-interactive
  info: "border border-dashed border-ink/20 bg-chalk text-ink/62",
};

const sizeClasses: Record<AlertSize, string> = {
  sm: "py-2",
  md: "py-3",
  lg: "py-5",
};

export interface AlertProps extends HTMLAttributes<HTMLParagraphElement> {
  variant?: AlertVariant;
  size?: AlertSize;
  children: ReactNode;
}

export function Alert({
  variant = "info",
  size = "md",
  children,
  className = "",
  ...rest
}: AlertProps) {
  return (
    <p
      className={[
        "rounded px-4 text-sm font-semibold",
        sizeClasses[size],
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </p>
  );
}
