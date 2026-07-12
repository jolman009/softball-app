/**
 * Logo — the On Deck brand mark and wordmark.
 *
 * The mark is the on-deck circle: a field-green softball with chalk seams.
 * `LogoMark` renders the SVG mark alone (favicons, tight spaces);
 * `Logo` pairs it with the wordmark for headers and hero surfaces.
 */

type LogoMarkProps = {
  size?: number;
  className?: string;
};

export function LogoMark({ size = 32, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="24" cy="24" r="22" fill="#2f6f4e" />
      {/* Softball seams */}
      <path
        d="M14 5.5 C 22 13, 22 35, 14 42.5"
        stroke="#f6f2e8"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M34 5.5 C 26 13, 26 35, 34 42.5"
        stroke="#f6f2e8"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Stitches */}
      <g stroke="#f6f2e8" strokeWidth="1.6" strokeLinecap="round">
        <path d="M16.8 12.6 L20.2 14.2" />
        <path d="M18.2 24.6 L21.8 23.4" />
        <path d="M16.8 35.4 L20.2 33.8" />
        <path d="M31.2 12.6 L27.8 14.2" />
        <path d="M29.8 24.6 L26.2 23.4" />
        <path d="M31.2 35.4 L27.8 33.8" />
      </g>
    </svg>
  );
}

type LogoProps = {
  /** Wordmark color context: "light" for dark backgrounds, "dark" for light backgrounds. */
  tone?: "dark" | "light";
  markSize?: number;
  className?: string;
};

export function Logo({ tone = "dark", markSize = 30, className }: LogoProps) {
  return (
    <span className={["inline-flex items-center gap-2", className ?? ""].join(" ").trim()}>
      <LogoMark size={markSize} />
      <span
        className={[
          "font-black tracking-tight leading-none",
          tone === "light" ? "text-white" : "text-ink"
        ].join(" ")}
      >
        On&nbsp;Deck
      </span>
    </span>
  );
}
