import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      exclude: [
        "api/**",
        "dist/**",
        "eslint.config.js",
        "postcss.config.js",
        "src/main.jsx",
        "tailwind.config.js",
        "vite.config.js",
        "coverage/**",
      ],
    },
  },
})
