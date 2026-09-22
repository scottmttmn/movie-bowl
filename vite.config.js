import { execSync } from 'node:child_process'
import { defineConfig, loadEnv } from 'vite'
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

// Opens the connections the first screen is about to need while the bundle is
// still downloading, rather than after it has run: Supabase answers every read
// a screen makes, and TMDB serves every poster. The Supabase origin comes from
// the build's own environment and is left out when it is not a real URL, so a
// checkout without one builds the same page it always did.
function preconnectOrigins(env) {
  return {
    name: 'movie-bowl-preconnect',
    apply: 'build',
    transformIndexHtml() {
      const tags = []
      try {
        const { origin } = new URL(env.VITE_SUPABASE_URL)
        // crossorigin, because supabase-js reads over CORS and a connection
        // opened without it cannot be reused for those requests.
        tags.push({
          tag: 'link',
          attrs: { rel: 'preconnect', href: origin, crossorigin: true },
          injectTo: 'head-prepend',
        })
      } catch {
        // No usable Supabase URL at build time; the page connects on demand.
      }
      tags.push({
        tag: 'link',
        attrs: { rel: 'preconnect', href: 'https://image.tmdb.org' },
        injectTo: 'head-prepend',
      })
      return tags
    },
  }
}

// Libraries change far less often than the app, so they get chunks of their
// own. A deploy then replaces only the app's code, and a returning visitor --
// which after every deploy is everyone, since open tabs reload onto it -- keeps
// React and the Supabase client from the cache instead of downloading them again.
function vendorChunk(id) {
  if (!id.includes('/node_modules/')) return undefined
  if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) {
    return 'vendor-react'
  }
  if (/\/node_modules\/(@supabase|tslib|iceberg-js)\//.test(id)) {
    return 'vendor-supabase'
  }
  return undefined
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Only a build ships an id anywhere; dev and tests never compare one, so they
  // skip the git calls entirely.
  const buildId = command === 'build' ? resolveBuildId() : 'development'

  return {
    plugins: [
      react(),
      buildVersionManifest(buildId),
      preconnectOrigins(loadEnv(mode, process.cwd(), 'VITE_')),
    ],
    build: {
      rollupOptions: {
        output: { manualChunks: vendorChunk },
      },
    },
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    test: {
      environment: "jsdom",
      maxWorkers: 2,
      // The Supabase client throws "supabaseUrl is required" at import without
      // these, which takes five test files down before their tests are ever
      // collected -- so the run loses fifty tests and still reports every
      // remaining one as passing. Pinned here rather than left to the
      // environment so the suite is self-contained on any machine, and so a
      // real .env can never point a test at a real Supabase: these are the same
      // unreachable values playwright.config.js and .app-evolution.yml use, and
      // nothing is expected to answer them.
      env: {
        VITE_SUPABASE_URL: "http://127.0.0.1:54321",
        VITE_SUPABASE_ANON_KEY: "movie-bowl-e2e-anon-key",
      },
      // Must stay comfortably above the setup file's asyncUtilTimeout. If a
      // waitFor can consume the whole per-test budget, a wait that is merely
      // slow reports as an opaque test timeout instead of naming the assertion
      // that did not hold.
      testTimeout: 20000,
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
