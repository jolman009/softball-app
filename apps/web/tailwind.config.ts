import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
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
      boxShadow: {
        soft: "0 18px 50px rgb(22 25 31 / 0.12)"
      }
    }
  },
  plugins: []
} satisfies Config;
