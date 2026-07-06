import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // ── Brand palette ──────────────────────────────────────────────────
      // ink   = near-black for text, dark surfaces, primary buttons
      // field = green accent for positive/active states, primary CTA on light
      // chalk = warm off-white page background and surface tint
      // clay  = terracotta accent for destructive, warning, hover-on-dark
      // steel = cool gray used for hover overlays on white surfaces
      colors: {
        ink: "#16191f",
        field: "#2f6f4e",
        chalk: "#f6f2e8",
        clay: "#b5532f",
        steel: "#d5dee5"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      // ── Elevation ──────────────────────────────────────────────────────
      // soft  = card/modal shadow — warm and diffuse
      // card  = alias for soft (semantic name for card surfaces)
      boxShadow: {
        soft: "0 18px 50px rgb(22 25 31 / 0.12)",
        card: "0 18px 50px rgb(22 25 31 / 0.12)"
      },
      // ── Border radius ──────────────────────────────────────────────────
      // The app uses `rounded` (4 px) everywhere. We alias it as `btn`
      // so that changing the system radius is a one-token update.
      borderRadius: {
        btn: "0.25rem"   // = rounded = 4 px
      }
    }
  },
  plugins: []
} satisfies Config;
