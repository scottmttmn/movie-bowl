import { access, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// app-evolution calls this before every capture and identifies the worktree it
// reproduced. The orchestration stays stable here while the fake backend comes
// from that commit, so authenticated screens use the API shape they shipped
// with rather than today's.
//
// Everything here is fabricated on purpose. Deduplication only works when the
// same UI produces the same pixels, and a real account's data moves under it --
// a bowl added, a movie drawn, and the next capture looks like a UI change.
// Real accounts also put real names and addresses in screenshots that this
// repository keeps forever.

export const EVOLUTION_BOWL_ID = "evolution-bowl";

const POSTER_FIXTURES = path.dirname(fileURLToPath(import.meta.url)) + "/poster-fixtures";

const MOVIES = [
  { id: "evolution-movie-1", tmdb_id: 4011, title: "The Long Goodbye", poster: "evolution-1", runtime: 112, genres: ["Crime"], release_date: "1973-03-07" },
  { id: "evolution-movie-2", tmdb_id: 4012, title: "Paris, Texas", poster: "evolution-2", runtime: 145, genres: ["Drama"], release_date: "1984-05-19" },
  { id: "evolution-movie-3", tmdb_id: 4013, title: "Local Hero", poster: "evolution-3", runtime: 111, genres: ["Comedy"], release_date: "1983-02-17" },
  { id: "evolution-movie-4", tmdb_id: 4014, title: "The Searchers", poster: "evolution-4", runtime: 119, genres: ["Western"], release_date: "1956-03-13" },
  { id: "evolution-movie-5", tmdb_id: 4015, title: "Moonstruck", poster: "evolution-5", runtime: 102, genres: ["Romance"], release_date: "1987-12-16" },
];

// Fixed, because a capture dated by "now" would differ from itself on every run.
const SEEDED_AT = "2026-01-05T19:30:00.000Z";
const WATCHED_ON = "2026-01-05";

function seed(backend, defaultUser) {
  const { state } = backend;

  state.bowls.push({
    id: EVOLUTION_BOWL_ID,
    name: "Friday Night",
    owner_id: defaultUser.id,
    draw_access_mode: "all_members",
    draw_method: "person_first",
    created_at: SEEDED_AT,
  });
  state.bowl_members.push({
    id: "evolution-member",
    bowl_id: EVOLUTION_BOWL_ID,
    user_id: defaultUser.id,
    role: "Owner",
  });
  state.bowl_movies.push(
    ...MOVIES.slice(0, 4).map((movie, index) => ({
      id: movie.id,
      bowl_id: EVOLUTION_BOWL_ID,
      tmdb_id: movie.tmdb_id,
      title: movie.title,
      poster_path: `/${movie.poster}.jpg`,
      release_date: movie.release_date,
      runtime: movie.runtime,
      genres: movie.genres,
      added_by: defaultUser.id,
      added_at: SEEDED_AT,
      drawn_at: null,
      is_pinned: index === 0,
    })),
  );
  // One watched title, so the watch list and the bowl's watched strip have
  // something to show rather than their empty states.
  const watched = MOVIES[4];
  state.user_watch_events.push({
    id: "evolution-watch-1",
    user_id: defaultUser.id,
    source_kind: "bowl_draw",
    bowl_name: "Friday Night",
    tmdb_id: watched.tmdb_id,
    title: watched.title,
    poster_path: `/${watched.poster}.jpg`,
    release_date: watched.release_date,
    runtime: watched.runtime,
    genres: watched.genres,
    watched_on: WATCHED_ON,
    created_at: SEEDED_AT,
    updated_at: SEEDED_AT,
  });
  state.tmdbSearchResults = MOVIES.map((movie) => ({
    id: movie.tmdb_id,
    title: movie.title,
    poster_path: `/${movie.poster}.jpg`,
    release_date: movie.release_date,
  }));
}

const LOCAL_FAKE_BACKEND_URL = new URL("./fakeBackend.js", import.meta.url);

export async function fakeBackendModuleUrl(projectRoot) {
  if (!projectRoot) return LOCAL_FAKE_BACKEND_URL;
  const candidate = path.resolve(projectRoot, "e2e/support/fakeBackend.js");
  try {
    await access(candidate);
    return pathToFileURL(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function loadFakeBackendForCapture(projectRoot) {
  const moduleUrl = await fakeBackendModuleUrl(projectRoot);
  if (!moduleUrl) return undefined;
  let loaded;
  if (projectRoot) {
    const sourcePath = fileURLToPath(moduleUrl);
    const adapterPath = path.join(
      path.dirname(sourcePath),
      `.app-evolution-fakeBackend-${process.pid}.mjs`,
    );
    const source = await readFile(sourcePath, "utf8");
    let captureSource = source
      .replace(/^\s*import .* from ["']@playwright\/test["'];?\s*$/m, "")
      .replace(/(^|\n)(\s*)class FakeBackend \{/, "$1$2export class FakeBackend {");
    const fixtureStart = captureSource.search(/^\s*export const test = base\.extend\(/m);
    if (fixtureStart >= 0) captureSource = captureSource.slice(0, fixtureStart);
    await writeFile(adapterPath, `${captureSource}\n`, "utf8");
    try {
      loaded = await import(pathToFileURL(adapterPath).href);
    } finally {
      await rm(adapterPath, { force: true });
    }
  } else {
    loaded = await import(moduleUrl.href);
  }
  if (typeof loaded.FakeBackend !== "function" || !loaded.DEFAULT_USER) {
    throw new Error(`Capture fake ${fileURLToPath(moduleUrl)} must export FakeBackend and DEFAULT_USER`);
  }
  return loaded;
}

/**
 * Art from disk instead of the network.
 *
 * The fake backend answers Supabase and /api/*, and lets everything else
 * through -- so posters would come from TMDB's CDN, over the network, for every
 * historical capture. TMDB replaces artwork, which would redate a screenshot
 * for a reason that has nothing to do with this app. These fixtures are drawn
 * here and never change. Drop real files in the same directory, named for the
 * poster paths above, if you would rather the timeline carried real covers.
 */

// Anything the app asks TMDB for that is not a seeded poster: service logos,
// mostly, which the settings screens have requested since September 2026. A
// 404 renders as a broken-image icon, and a capture that bakes one into every
// later screenshot records a fault the app never had. A plain tile is the
// honest stand-in -- it says "art goes here" without inventing a brand mark.
const PLACEHOLDER_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="">
  <rect width="48" height="48" rx="10" fill="#243044"/>
  <rect x="1" y="1" width="46" height="46" rx="9" fill="none" stroke="rgba(255,255,255,0.14)"/>
</svg>`;

async function serveImageFixtures(page) {
  await page.route("https://image.tmdb.org/**", async (route) => {
    const name = path.basename(new URL(route.request().url()).pathname, ".jpg");
    let body = PLACEHOLDER_IMAGE;
    try {
      body = await readFile(path.join(POSTER_FIXTURES, `${name}.svg`), "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body });
  });
}

export async function setup({ page, projectRoot }) {
  const fake = await loadFakeBackendForCapture(projectRoot);
  // Commits before the fake backend existed should keep the honest signed-out
  // view. Borrowing today's fake would invent an API those commits never had.
  if (!fake) return;
  const { FakeBackend, DEFAULT_USER } = fake;
  const backend = new FakeBackend();
  seed(backend, DEFAULT_USER);
  await backend.install(page);
  await backend.authenticate(page);
  await serveImageFixtures(page);
}

export default setup;
