# Movie Bowl

Movie Bowl is a collaborative app for maintaining a shared movie list and randomly drawing what to watch next.

## What It Does

- Create and join bowls.
- Add movies from TMDB search.
- Draw a random movie from the remaining list.
- Optionally prioritize draws to titles available on your streaming services.
- Track watched titles in a horizontal history strip.
- Open full movie details from:
  - a newly drawn movie
  - search results (`Details`)
  - watched movie cards
- Manage bowl members and invite links.
- Owner can rename bowl in Bowl Settings.
- Store user streaming service preferences.

## Tech Stack

- React 19 + Vite 7
- React Router
- Supabase (auth + database)
- Tailwind CSS
- Vitest + Testing Library

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` with:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
TMDB_READ_ACCESS_TOKEN=...
APP_BASE_URL=https://moviebowl.app
RESEND_API_KEY=...
INVITE_EMAIL_FROM="Movie Bowl <invites@mail.moviebowl.app>"
```

3. Run locally.

For full local behavior, including `/api/*` routes:

```bash
vercel dev
```

If you only need frontend-only iteration, you can still use:

```bash
npm run dev
```

## Scripts

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run preview` - preview production build
- `npm run lint` - run ESLint
- `npm run test` - start Vitest in watch mode
- `npm run test:run` - run tests once

## Streaming-Service Logic

- User picks services in **User Settings**.
- Service names are normalized in `src/utils/streamingServices.js`.
- Provider availability is fetched from TMDB:
  - `src/lib/streamingProviders.js`
  - proxied through server routes in `api/tmdb/*` so the TMDB key stays server-side
  - includes in-memory caching + in-flight request deduping
- Draw behavior:
  - if prioritize toggle is on and matches exist, draw from matches
  - if no matches, fallback to all remaining titles

## Key Files

- App shell/routes: `src/App.jsx`
- Bowl state and draw logic: `src/hooks/useBowl.js`
- Draw candidate selection: `src/utils/selectDrawCandidate.js`
- User streaming settings hook: `src/hooks/useUserStreamingServices.js`
- Bowl dashboard UI: `src/screens/BowlDashboard.jsx`
- Bowl settings UI: `src/screens/BowlSettings.jsx`
- User settings UI: `src/screens/UserSettings.jsx`
- Invite email route: `api/invites/send.js`

## Production Setup

### Canonical app domain

- Production app URL: `https://moviebowl.app`
- Configure `moviebowl.app` as the primary production domain in Vercel
- In Supabase Auth settings:
  - `Site URL` should be `https://moviebowl.app`
  - `Allowed Redirect URLs` should include:
    - `https://moviebowl.app`
    - `http://localhost:3000`
    - optionally `http://localhost:5173`

### Sending domain

- Use a dedicated sending subdomain for email:
  - `mail.moviebowl.app`
- Verify `mail.moviebowl.app` in Resend
- Add the DNS records Resend provides for that subdomain
- Recommended sender:
  - `Movie Bowl <invites@mail.moviebowl.app>`

### Auth email delivery

- The app still uses Supabase magic-link auth
- To avoid the default Supabase email rate limits, configure custom SMTP in Supabase Auth
- Recommended branded sender:
  - `Movie Bowl <auth@mail.moviebowl.app>`

### Invite email delivery

- Bowl invites are stored in `bowl_invites`
- The app sends invite emails through:
  - `POST /api/invites/send`
- Invite links inside those emails use:
  - `APP_BASE_URL`

## Environment Variables

### Browser-visible

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These are visible in the browser bundle by design.

### Server-only

- `TMDB_READ_ACCESS_TOKEN`
- `APP_BASE_URL`
- `RESEND_API_KEY`
- `INVITE_EMAIL_FROM`

Do not prefix server-only values with `VITE_`.

## Tests

Current tests include:

- Component smoke tests (`src/components/__tests__/components.smoke.test.jsx`)
- Draw selection unit tests (`src/utils/__tests__/selectDrawCandidate.test.js`)
- Hook-level draw integration tests (`src/hooks/__tests__/useBowl.test.js`)

Run all tests:

```bash
npm run test:run
```

## Notes

- The app currently expects a Supabase schema with tables like:
  - `profiles`
  - `bowls`
  - `bowl_movies`
  - `bowl_members`
  - `bowl_invites`
- There is also an RPC used on the home screen:
  - `get_my_bowls_with_counts`
