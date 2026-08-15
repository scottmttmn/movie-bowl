/** @type {import('tailwindcss').Config} */
export default {
  future: {
    // Touch browsers keep :hover applied after a tap, so every hover style read
    // as a stuck state change on phones. Gate hover utilities behind
    // (hover: hover) — the Tailwind v4 default — so a tap leaves nothing behind.
    hoverOnlyWhenSupported: true,
  },
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

