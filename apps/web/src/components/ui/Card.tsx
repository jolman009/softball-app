/**
 * Card — canonical surface container for the softball-app design system.
 *
 * VARIANTS
 *   default      White background, soft shadow. The standard data surface.
 *   dark         Ink background, white text. Used for sidebar info panels
 *                (e.g. the "Session rate" panel on BookingPage, the role-based
 *                access callout on LoginPage).
 *   outline      White bg, ink/10 border, no shadow. Lower-elevation surface for
 *                summaries and nested content (e.g. booking summary bar).
 *   ghost        Chalk (warm off-white) background, no shadow, no border. Used for
 *                empty states, inline info banners, and secondary content areas.
 *
 * INTERACTION (optional)
 *   When `as="a"` or `as={Link}` + `interactive` are set, the card gains a
 *   hover lift (-translate-y-0.5 + shadow-md) and a focus ring. Use for the
 *   quick-action link cards on AdminDashboardPage.
 *
 * STRUCTURE helpers
 *   <CardHeader>   Title row with optional icon and action slot.
 *   <CardBody>     Standard padded content area.
 *   <CardFooter>   Bottom row, typically for action buttons.
 *
 * PADDING
 *   sm  p-4
 *   md  p-5  — default
 *   lg  p-6
 */
import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";

// ── Variant / size tokens ──────────────────────────────────────────────────

export type CardVariant = "default" | "dark" | "outline" | "ghost";
export type CardPadding = "sm" | "md" | "lg";

const variantClasses: Record<CardVariant, string> = {
  default: "bg-white shadow-soft",
  dark: "bg-ink text-white shadow-soft",
  outline: "bg-white border border-ink/10",
  ghost: "bg-chalk",
};

const paddingClasses: Record<CardPadding, string> = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

// ── Card ──────────────────────────────────────────────────────────────────

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  /** When true, adds hover lift + shadow-md upgrade. Pair with an <a> or Link wrapper. */
  interactive?: boolean;
  children: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = "default",
      padding = "md",
      interactive = false,
      children,
      className = "",
      ...rest
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={[
          "rounded",
          variantClasses[variant],
          paddingClasses[padding],
          interactive
            ? "focus-ring transition hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
            : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

// ── CardHeader ────────────────────────────────────────────────────────────

export interface CardHeaderProps {
  /** Optional icon element placed before the title */
  icon?: ReactNode;
  title: ReactNode;
  /** Optional element placed at the end of the header row (e.g. badge, button) */
  action?: ReactNode;
  /** Small all-caps label above the title (e.g. "Step 1", "Booking") */
  eyebrow?: string;
  eyebrowClass?: string;
  className?: string;
}

export function CardHeader({
  icon,
  title,
  action,
  eyebrow,
  eyebrowClass = "text-ink/65",
  className = "",
}: CardHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span className="shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p
              className={`text-xs font-bold uppercase tracking-[0.16em] ${eyebrowClass}`}
            >
              {eyebrow}
            </p>
          )}
          <div className="mt-0.5 font-black text-xl leading-snug truncate">
            {title}
          </div>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── CardBody ──────────────────────────────────────────────────────────────

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mt-4 ${className}`}>{children}</div>;
}

// ── CardFooter ────────────────────────────────────────────────────────────

export function CardFooter({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mt-5 flex items-center justify-end gap-3 border-t border-ink/10 pt-4 ${className}`}
    >
      {children}
    </div>
  );
}
