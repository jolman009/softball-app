/**
 * Button — canonical interactive button primitive for the softball-app design system.
 *
 * VARIANTS
 *   primary    ink background → clay on hover. Use for the single most important action
 *              on a surface (submit, confirm, "Book a session").
 *   secondary  bordered / transparent. Use for secondary or back-nav actions.
 *   positive   field (green) background. Use for affirmative, create-new actions where
 *              the green brand reinforces progress (e.g. "Connect Google", "Find a slot").
 *   destructive clay text + clay border. Use for cancellation / delete actions.
 *   ghost      Text-only with hover tint. Use for low-emphasis actions inside dense UIs.
 *
 * SIZES
 *   sm   px-3  py-1.5 text-xs  — inline action buttons, badge-style rows
 *   md   px-4  py-2   text-sm  — default for most admin forms and compact CTAs
 *   lg   px-5  py-3   text-base — hero / page-level primary actions
 *
 * STATES
 *   loading  shows a spinning icon and sets disabled; pass `loading` prop
 *   disabled native disabled attribute; reduced opacity, cursor-not-allowed
 *
 * All variants inherit focus-ring via the `.focus-ring` global utility defined
 * in index.css, which uses a 2 px clay outline at 2 px offset. This satisfies
 * WCAG 2.1 SC 2.4.7 (Focus Visible) without fighting browser defaults.
 */
import { Loader2 } from "lucide-react";
import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "positive" | "destructive" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Icon placed before the label text */
  iconLeft?: ReactNode;
  /** Icon placed after the label text */
  iconRight?: ReactNode;
  children: ReactNode;
}

// ── Token-to-class maps ────────────────────────────────────────────────────

const variantClasses: Record<ButtonVariant, string> = {
  // ink bg → clay hover; white text; disabled 40% opacity ink bg
  primary:
    "bg-ink text-white hover:bg-clay disabled:bg-ink/40 disabled:cursor-not-allowed",
  // white bg with ink/12 border; ink text; chalk hover tint; disabled 50% opacity
  secondary:
    "border border-ink/12 bg-white text-ink hover:bg-chalk disabled:opacity-50 disabled:cursor-not-allowed",
  // field bg → ink hover; white text; disabled 40% opacity field bg
  positive:
    "bg-field text-white hover:bg-ink disabled:bg-field/40 disabled:cursor-not-allowed",
  // clay border + clay text; clay/10 hover tint; disabled 50% opacity
  destructive:
    "border border-clay/30 text-clay hover:bg-clay/10 disabled:opacity-50 disabled:cursor-not-allowed",
  // text only; ink/70 text; chalk hover tint; disabled 50% opacity
  ghost:
    "text-ink/70 hover:bg-chalk hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1",
  md: "px-4 py-2 text-sm gap-1.5",
  lg: "px-5 py-3 text-base gap-2",
};

// ── Component ─────────────────────────────────────────────────────────────

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      iconLeft,
      iconRight,
      children,
      disabled,
      className = "",
      ...rest
    },
    ref
  ) => {
    const isDisabled = disabled || loading;
    const iconSize = size === "sm" ? 14 : size === "lg" ? 18 : 16;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          // Shared structural classes
          "focus-ring inline-flex items-center justify-center rounded font-bold transition",
          sizeClasses[size],
          variantClasses[variant],
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {loading ? (
          <Loader2 size={iconSize} className="animate-spin" aria-hidden="true" />
        ) : iconLeft ? (
          <span aria-hidden="true">{iconLeft}</span>
        ) : null}
        {children}
        {!loading && iconRight ? (
          <span aria-hidden="true">{iconRight}</span>
        ) : null}
      </button>
    );
  }
);

Button.displayName = "Button";
