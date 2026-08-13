// import type { Config } from "tailwindcss";

// // Palette continues the green identity from the original Agentic Search
// // deck (Brown Bag Session) so the app and the pitch read as one product.
// const config: Config = {
//   content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
//   theme: {
//     extend: {
//       colors: {
//         forest: "#0F5C3E", // headings, primary text on light surfaces
//         emerald: {
//           DEFAULT: "#1EA672", // primary actions, active nav, brand accent
//           light: "#E3F5EC", // tinted surfaces / badges
//           dark: "#0B7A54",
//         },
//         teal: {
//           DEFAULT: "#127C79",
//           light: "#DFF3F2",
//         },
//         gold: {
//           DEFAULT: "#D9A441", // warnings, offers/salary-sensitive accents
//           light: "#FBF0DC",
//         },
//         ink: "#16241D", // near-black text, matches deck's dark cards
//         surface: {
//           DEFAULT: "#F7FAF8", // app background — soft green-white
//           card: "#FFFFFF",
//         },
//         muted: "#5B6B62", // secondary text
//         border: "#DCE7E1",
//       },
//       fontFamily: {
//         sans: ["Inter", "system-ui", "sans-serif"],
//       },
//       borderRadius: {
//         xl: "14px",
//       },
//     },
//   },
//   plugins: [],
// };

// export default config;

// Fission Design System
import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border:     "var(--border)",
        input:      "var(--input)",
        ring:       "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary:    { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        secondary:  { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        destructive:{ DEFAULT: "var(--destructive)", foreground: "var(--destructive-foreground)" },
        muted:      { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        card:       { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover:    { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        accent:     { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
        success:    { DEFAULT: "var(--success)", foreground: "var(--success-foreground)" },
        warning:    { DEFAULT: "var(--warning)", foreground: "var(--warning-foreground)" },
        sidebar:    { DEFAULT: "var(--sidebar-background)", foreground: "var(--sidebar-foreground)" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config