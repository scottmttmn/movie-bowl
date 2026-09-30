# Onboarding

Your first week on Movie Bowl, for someone new to this codebase and possibly to
professional development. The other documents are thorough, but they are
reference material written for people who already know their way around:
`README.md` is the product and its production setup, `CLAUDE.md` is how the code
is put together, `STABILITY.md` is the release guardrails. This one is the order
to read them in, what you can safely run, and what not to touch yet.

If a step here is wrong for you, fixing this file is a good first pull request.
Nobody else can see where it is unclear.

## Ground rules

These come first because they are the only mistakes here that cannot be undone
by reverting a commit.

- **Never use production credentials.** You do not need them to run the tests,
  and you should not need them to run the app. In particular never hold the
  production `SUPABASE_SECRET_KEY`: it bypasses every row-level security policy.
- **Never run `supabase db push` or `supabase link` against production.** You
  will use both on a Supabase project of your own (Day 2). Schema reaches the
  production database only through Scott, and only before the app change that
  depends on it is merged (see "Database changes" below).
- **Never commit `.env`.** It is gitignored; keep it that way.
- **This repository is public.** No secrets, no customer data, and no write-ups
  of unfixed bugs in any file, commit message or pull request. If you find
  something that looks like a security problem, tell Scott directly.
- **You do not merge your own pull requests.** Scott merges.

## Day 1: tools and a green checkout

Everything today works with no accounts and no secrets.

1. Install Node with nvm, git, and an editor. The repository pins Node 24
   (`.nvmrc`, and `engines` in `package.json`). Older versions may appear to work
   and then fail in ways that look like your change.

   ```bash
   nvm install      # reads .nvmrc
   nvm use
   node --version   # v24.x
   ```

2. Clone and install. Use `npm ci`, not `npm install`: it installs exactly what
   `package-lock.json` says and never rewrites it.

   ```bash
   git clone https://github.com/scottmttmn/movie-bowl.git
   cd movie-bowl
   npm ci
   ```

3. Run the gate, one command at a time, and read each result.

   ```bash
   npm run lint          # zero warnings expected
   npm run test:run      # unit and component tests (Vitest), ~2 minutes
   npm run build         # production build
   npx playwright install chromium   # once; on Linux add --with-deps
   npm run test:e2e      # browser tests (Playwright), ~2 minutes
   npm run test:counts   # compares the counts above with CLAUDE.md
   ```

   The expected numbers are in one sentence in `CLAUDE.md` under Commands
   ("A clean checkout is expected to be fully green ..."). A fresh `main` should
   match it exactly.

Two things that look alarming and are not:

- `test:run` prints a lot of red `console.error` output. Most of it comes from
  tests that deliberately exercise failures. Whether anything actually failed is
  the summary at the bottom, or `npm run test:failures`.
- None of this needs a `.env`. The unit tests pin fake Supabase settings in
  `vite.config.js`, and the Playwright suite fakes the whole backend in
  `e2e/support/fakeBackend.js`.

The database tests (`./scripts/pgtap.sh`) need a local PostgreSQL with pgTAP.
CI runs them on every pull request, so you can skip them until you change SQL.

## Day 2: use the product, then run it yourself

Before reading code, use the live app at [moviebowl.app](https://moviebowl.app)
with a personal account: make a bowl, add a few movies, add a custom title,
draw one, put it back, look at your watch list. Ask Scott to invite you to a
bowl with someone else in it, because the draw only makes sense with two people.
Then read `README.md` down to "Tech Stack", and the About page in the app for
where the idea came from.

Running it locally needs a backend of your own. This path has not yet been
walked end to end by a newcomer; expect to fix a step or two and write down
what you changed.

1. **A personal Supabase project** (free tier, [supabase.com](https://supabase.com)).
   Build its schema in two steps: the pre-migration baseline by hand, then the
   migrations with the Supabase CLI, which records each one as applied so a
   later `db push` of your own migration does not replay them all. Skip
   `supabase/baseline/00_platform.sql`: it imitates what a real Supabase
   project already has, for plain PostgreSQL. The connection string and project
   ref are under Project Settings. Install the Supabase CLI first
   ([supabase.com/docs/guides/cli](https://supabase.com/docs/guides/cli)).

   ```bash
   export DB="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres"
   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/baseline/01_schema.sql
   supabase login
   supabase link --project-ref <your project ref>   # yours, never production's
   supabase db push
   ```

   In Authentication, URL Configuration, add `http://localhost:3000` and
   `http://localhost:5173` to the redirect URLs. Sign-in is by emailed link.

2. **A TMDB account** (free) for a read access token, used by movie search.

3. **The Vercel CLI**, which is already a dev dependency. `npm run dev:api` asks
   you to log in and link a project the first time; a personal Vercel account
   is enough.

4. A `.env` with only what that needs. The long list in the README is
   production's. The rest power email invitations, TV pairing, streaming links
   and the daily cache job, which you can leave unconfigured until you work on
   one of them.

   ```bash
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your project's anon key>
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_SECRET_KEY=<your project's service role key, never production's>
   TMDB_READ_ACCESS_TOKEN=<your TMDB token>
   APP_BASE_URL=http://localhost:3000
   ```

5. `npm run dev:api` and open `http://localhost:3000`. (`npm run dev` is faster
   but serves no `/api/*` routes, so search fails there.)

## Day 3: find your way around

Read `CLAUDE.md` from "Architecture" to the end of "The draw". It is dense;
the first pass is for the map, not the detail. What matters most:

- **Where code goes.** `utils/` is pure functions with no network, `hooks/`
  talks to Supabase and holds state, `lib/` wraps outside services, `screens/`
  are one route each, `api/` is serverless code that holds the secrets.
- **One promise you must not break.** The default draw picks a *person* evenly,
  then one of their movies, so adding more titles does not raise your odds. It
  is the reason the product exists.

Then trace two flows through the code with the app open beside it:

- **Adding a movie**: `src/components/AddMovieModal.jsx` and `MovieSearch.jsx`,
  through `src/context/BowlAddContext.jsx` and `src/hooks/useBowlAdd.js`, to
  `src/lib/addBowlMovie.js`, which writes to Supabase.
- **Drawing**: `handleDraw` in `src/hooks/useBowl.js`, the filters in
  `src/utils/drawSelection.js`, the final pick in `src/utils/drawMethods.js`,
  and the `draw_bowl_movie` function under `supabase/migrations/`.

Read the tests next to each file (`__tests__/`) as you go. They are often the
clearest statement of what the code is supposed to do.

## Days 4 and 5: a first change

Pick something small that a browser can see, so you exercise the whole loop:

- anything in this file that was wrong for you;
- a tidy-up from "Visual consistency sweep" in `TODO.md`: one component using
  raw colours where a shared class from `src/index.css` exists;
- a missing test for a pure function in `src/utils/`.

Leave these alone for the first few weeks; `STABILITY.md` explains why:
`src/hooks/useBowl.js`, `MovieSearch.jsx`, `AddMovieModal.jsx`,
`src/screens/BowlSettings.jsx`, `supabase/migrations/`, and the TV code in
`src/tv/` and `tv-android/`.

The loop:

1. Branch from the remote, not from your local `main`:
   `git fetch origin && git switch -c your-branch-name origin/main`.
2. Make the change and add or update a test for it.
3. Run the Day 1 gate. If you added or removed tests, update the count sentence
   in `CLAUDE.md` in the same commit. Two branches that both touch it will
   conflict there; that is expected, and the fix is to re-run on the merged
   code and write the new numbers.
4. Commit with an imperative, sentence-case subject: "Show the bowl name on the
   invite card", not "fixed stuff".
5. Open a pull request **ready for review**, not as a draft: the automated
   reviewer (Codex) skips drafts. Say what a user sees before and after.
6. CI runs five checks: Lint, Build, Tests, Playwright, Database. Zero checks
   after a few minutes usually means your branch conflicts with `main`.
7. Answer the review comments, push fixes, and ask Scott to merge.

## Database changes

Not a first-week task, but know the rule before you need it. Schema changes are
new files in `supabase/migrations/`, never edits in the Supabase dashboard and
never edits to `supabase/baseline/`. Permission changes also need a pgTAP test
in `supabase/tests/` and a revert in `supabase/rollback/`. Then:

**The migration is applied to production before the pull request that depends
on it is merged.** Scott applies it and confirms with `supabase migration list`.
Merging first once took bowl creation down in production. See
`supabase/README.md`.

## Words you will see

- **Bowl**: a shared list of movies. **Slip**: one movie in it.
- **Home bowl**: where the app opens for you. The database calls it the
  *default* bowl; that difference is deliberate.
- **Draw method**: how a bowl picks. *Person-first* (the default), *title-first*
  (a flat raffle) or *rotation* (whoever has waited longest).
- **Custom movie**: typed in by hand rather than found on TMDB. It has a
  negative `tmdb_id`, so code that calls TMDB must skip it.
- **Starter pack**: a set of titles installed into a bowl that belongs to no one.
- **Add link**: a public link that lets someone without an account add a few
  titles.
- **Theater mode**: trailers that play before the drawn movie is revealed.
- **RLS** (row-level security): Postgres rules that decide which rows each user
  may read or write. The browser talks to the database directly, so these rules
  are the real permission system.
- **RPC**: a database function the app calls, such as `draw_bowl_movie`. Prefer
  them over several separate writes from the browser.
