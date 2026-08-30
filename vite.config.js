import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Stamps every build with an id so a tab that is already open can tell it is no
// longer running the deployed code.
//
// A commit is a much better id than a clock: redeploying the same commit keeps
// the same id, so every open tab is not told to reload for a build that changed
// nothing. Vercel hands us the sha directly, but only when the project is set
// to expose its system environment variables -- so when it does not, ask the
// checkout itself before giving up and using the clock.
function resolveBuildId() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12)
  }

  try {
    // The commit alone, never the state of the working tree. Asking git whether
    // the tree was dirty tagged every production build with a timestamp -- the
    // deploy builder's checkout is not clean by our standards and never will be,
    // and each round of narrowing what counts as dirty was another deploy spent
    // guessing at a container we cannot see.
    //
    // The cost is only local: two local builds of different uncommitted work
    // share an id, so a locally previewed tab will not notice the second one.
    // Nobody but the person who made both is ever served them.
    return execSync('git rev-parse --short=12 HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    // No git and no Vercel metadata. The clock still makes each build distinct,
    // it just cannot tell which commit is live or recognise a rebuild.
    return `local-${Date.now()}`
  }
}

// Publishes that id as a tiny static file. It deliberately sits outside the
// hashed bundle: the whole point is to read the *deployed* id without loading
// any of the deployed code.
function buildVersionManifest(buildId) {
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
export default defineConfig(({ command }) => {
  // Only a build ships an id anywhere; dev and tests never compare one, so they
  // skip the git calls entirely.
  const buildId = command === 'build' ? resolveBuildId() : 'development'

  return {
    plugins: [react(), buildVersionManifest(buildId)],
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
  }
})
