import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Stamps every build with an id so a tab that is already open can tell it is no
// longer running the deployed code. Vercel exposes the commit at build time; a
// local build falls back to the clock, which is enough to keep builds distinct.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`

// Publishes that id as a tiny static file. It deliberately sits outside the
// hashed bundle: the whole point is to read the *deployed* id without loading
// any of the deployed code.
function buildVersionManifest() {
  return {
    name: 'movie-bowl-build-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ buildId })}\n`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), buildVersionManifest()],
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  test: {
    environment: "jsdom",
    maxWorkers: 2,
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
