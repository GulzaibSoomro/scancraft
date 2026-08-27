import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#EDF1F5",
        grid: "#C4D0E0",
        ink: {
          DEFAULT: "#1D3557",
          soft: "#4A5B7A",
        },
        surface: "#FFFFFF",
        critical: "#C1272D",
        warning: "#B5790F",
        pass: "#1B7A6E",
      },
      fontFamily: {
        display: ["var(--font-plex-condensed)", "sans-serif"],
        sans: ["var(--font-plex-sans)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
      backgroundImage: {
        "blueprint-grid":
          "linear-gradient(to right, #C4D0E0 1px, transparent 1px), linear-gradient(to bottom, #C4D0E0 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "28px 28px",
      },
      boxShadow: {
        stamp: "0 2px 0 rgba(29, 53, 87, 0.12)",
      },
    },
  },
  plugins: [],
};
export default config;
