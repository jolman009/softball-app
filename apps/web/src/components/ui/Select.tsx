/**
 * Select — canonical <select> dropdown for the softball-app design system.
 *
 * Uses a wrapper div to apply a custom chevron icon, since native <select>
 * arrows aren't style-able cross-browser. The native element is kept so that
 * keyboard navigation (arrow keys, type-ahead) works out of the box.
 *
 * STATES
 *   rest      white bg, ink/15 border, ink text
 *   hover     steel tint on the wrapper (cosmetic only; native select handles click)
 *   focus     clay outline via .focus-ring on the native select
 *   disabled  chalk bg, 50% opacity, cursor-not-allowed
 *   error     clay/40 border; pass hasError prop
 *
 * SIZES
 *   sm  py-1.5 text-xs
 *   md  py-2   text-sm  — default
 *   lg  py-3   text-base
 *
 * The select must always have a label. Use FieldWrapper from Input.tsx for the
 * label + helper/error text scaffold.
 */
import { ChevronDown } from "lucide-react";
import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";

export type SelectSize = "sm" | "md" | "lg";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  selectSize?: SelectSize;
  hasError?: boolean;
}

const sizeClasses: Record<SelectSize, string> = {
  sm: "py-1.5 pl-3 pr-8 text-xs",
  md: "py-2 pl-3 pr-8 text-sm",
  lg: "py-3 pl-4 pr-10 text-base",
};

const chevronSizeClass: Record<SelectSize, number> = {
  sm: 12,
  md: 14,
  lg: 16,
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      selectSize = "md",
      hasError = false,
      disabled,
      className = "",
      children,
      ...rest
    },
    ref
  ) => {
    const borderClass = hasError ? "border-clay/40" : "border-ink/15";
    const bgClass = disabled ? "bg-chalk" : "bg-white";

    return (
      <span className="relative block">
        <select
          ref={ref}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          className={[
            // appearance-none removes the native arrow; our ChevronDown takes over
            "focus-ring w-full appearance-none rounded border font-semibold text-ink transition",
            sizeClasses[selectSize],
            borderClass,
            bgClass,
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        >
          {children}
        </select>
        {/* Decorative chevron — not interactive */}
        <span
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/45"
          aria-hidden="true"
        >
          <ChevronDown size={chevronSizeClass[selectSize]} />
        </span>
      </span>
    );
  }
);

Select.displayName = "Select";
