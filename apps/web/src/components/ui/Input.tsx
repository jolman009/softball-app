/**
 * Input — canonical single-line text field for the softball-app design system.
 *
 * ANATOMY
 *   <label>          — handled by the caller, not baked in, so the component
 *                      stays composable (label text lives in a <label> element
 *                      that references this input via htmlFor / id).
 *   [LeadingIcon]    — optional decorative icon pinned inside the left edge
 *   <input>          — the input itself
 *   [TrailingIcon]   — optional decorative icon or action pinned to the right
 *
 *   <FieldWrapper>   — convenience wrapper providing label + helper/error text
 *                      above and below the raw Input. Use this for forms.
 *
 * STATES (all expressed as Tailwind classes, no inline styles)
 *   rest      white bg, ink/15 border, ink text
 *   focus     clay outline via .focus-ring (2 px, 2 px offset)
 *   disabled  chalk bg, 50% opacity, cursor-not-allowed
 *   read-only chalk bg, cursor-default
 *   error     clay/40 border; pair with FieldWrapper's errorText prop
 *
 * SIZES
 *   sm  py-1.5 text-xs  — compact tables / inline forms
 *   md  py-2   text-sm  — default
 *   lg  py-3   text-base — page-level forms (Login, Booking)
 */
import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

export type InputSize = "sm" | "md" | "lg";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: InputSize;
  hasError?: boolean;
  /** Icon rendered inside the left edge (decorative, pointer-events-none). */
  leadingIcon?: ReactNode;
  /** Icon rendered inside the right edge (decorative, pointer-events-none). */
  trailingIcon?: ReactNode;
}

const sizeClasses: Record<InputSize, string> = {
  sm: "py-1.5 px-3 text-xs",
  md: "py-2 px-3 text-sm",
  lg: "py-3 px-4 text-base",
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      inputSize = "md",
      hasError = false,
      leadingIcon,
      trailingIcon,
      disabled,
      readOnly,
      className = "",
      ...rest
    },
    ref
  ) => {
    const borderClass = hasError ? "border-clay/40" : "border-ink/15";
    const bgClass =
      disabled || readOnly ? "bg-chalk cursor-not-allowed" : "bg-white";

    const input = (
      <input
        ref={ref}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={hasError || undefined}
        className={[
          "focus-ring w-full rounded border font-semibold text-ink placeholder:text-ink/38 transition",
          sizeClasses[inputSize],
          borderClass,
          bgClass,
          leadingIcon ? "pl-10" : "",
          trailingIcon ? "pr-10" : "",
          disabled ? "opacity-50" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      />
    );

    if (!leadingIcon && !trailingIcon) return input;

    const iconSizeClass =
      inputSize === "sm" ? "size-3.5" : inputSize === "lg" ? "size-5" : "size-4";

    return (
      <span className="relative block">
        {leadingIcon && (
          <span
            className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/42 ${iconSizeClass}`}
            aria-hidden="true"
          >
            {leadingIcon}
          </span>
        )}
        {input}
        {trailingIcon && (
          <span
            className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink/42 ${iconSizeClass}`}
            aria-hidden="true"
          >
            {trailingIcon}
          </span>
        )}
      </span>
    );
  }
);

Input.displayName = "Input";

// ── Textarea variant ───────────────────────────────────────────────────────

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  inputSize?: InputSize;
  hasError?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      inputSize = "md",
      hasError = false,
      disabled,
      readOnly,
      className = "",
      ...rest
    },
    ref
  ) => {
    const borderClass = hasError ? "border-clay/40" : "border-ink/15";
    const bgClass =
      disabled || readOnly ? "bg-chalk cursor-not-allowed" : "bg-white";
    const padClass =
      inputSize === "sm"
        ? "px-3 py-1.5 text-xs"
        : inputSize === "lg"
        ? "px-4 py-3 text-base"
        : "px-3 py-2 text-sm";

    return (
      <textarea
        ref={ref}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={hasError || undefined}
        className={[
          "focus-ring w-full rounded border font-semibold text-ink placeholder:text-ink/38 transition leading-6 resize-y",
          padClass,
          borderClass,
          bgClass,
          disabled ? "opacity-50" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      />
    );
  }
);

Textarea.displayName = "Textarea";

// ── FieldWrapper ───────────────────────────────────────────────────────────
// Wraps a labeled form field with optional helper text and error message.
// Usage:
//   <FieldWrapper label="Email" htmlFor="email" errorText={errors.email}>
//     <Input id="email" type="email" hasError={!!errors.email} />
//   </FieldWrapper>

export interface FieldWrapperProps {
  label: string;
  htmlFor: string;
  /** Descriptive helper text shown below the field in normal state */
  helperText?: string;
  /** Error message; replaces helperText when present and sets red color */
  errorText?: string;
  children: ReactNode;
  className?: string;
}

export function FieldWrapper({
  label,
  htmlFor,
  helperText,
  errorText,
  children,
  className = "",
}: FieldWrapperProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-bold text-ink"
      >
        {label}
      </label>
      {children}
      {errorText ? (
        <p className="text-xs font-semibold text-clay" role="alert">
          {errorText}
        </p>
      ) : helperText ? (
        <p className="text-xs text-ink/55">{helperText}</p>
      ) : null}
    </div>
  );
}
