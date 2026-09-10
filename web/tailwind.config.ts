import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "SF Pro Text",
          "SF Pro Display",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "system-ui",
          "sans-serif",
        ],
      },
      // Status colors -- CharmQuark brand, matching lib/palette.ts STATUS_COLOR.
      colors: {
        ready: "#34C759",       // green
        assembling: "#FF8D28",  // orange
        blocked: "#FF383C",     // red
        draft: "#8E8E93",       // gray
        confirmed: "#00C3D0",   // teal
      },
    },
  },
  plugins: [],
};

export default config;
