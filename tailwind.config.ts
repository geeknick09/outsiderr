import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0A0A0E",
        violet: {
          neon: "#8B5CF6",
        },
        pink: {
          neon: "#EC4899",
        },
        lime: {
          neon: "#E2F163",
        },
      },
      boxShadow: {
        "glow-violet": "0 0 20px rgba(139,92,246,0.5)",
        "glow-pink": "0 0 20px rgba(236,72,153,0.45)",
        "glow-lime": "0 0 20px rgba(226,241,99,0.45)",
      },
      backgroundImage: {
        "neon-gradient": "linear-gradient(90deg,#8B5CF6 0%,#EC4899 100%)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;
