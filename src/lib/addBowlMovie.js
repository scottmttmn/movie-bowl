import { supabase } from "./supabase";
import { fetchProviderLinks } from "./providerLinks";
import { warmTmdbMovieFilterMetadata } from "./tmdbApi";
import { notifyBowlChange } from "./bowlChanges";
import { MAX_UNDRAWN_MOVIES_PER_BOWL } from "../utils/appLimits";
import { getMovieNoteValidationError, normalizeMovieNote } from "../utils/movieNote";
import { getMovieAttributionLabel, isStarterPackMovie } from "../utils/drawBuckets";
import { OFFLINE_MESSAGE, describeNetworkError, isOffline, isOfflineError } from "../utils/networkErrors";

export const BOWL_MOVIE_FIELDS = "id, bowl_id, tmdb_id, title, poster_path, release_date, runtime, genres, overview, note, is_pinned, added_by, added_by_name, starter_pack, added_at, drawn_at, drawn_by, snapshot_at";
export const addResult = (ok, code = null, message = null) => ({ ok, code, message });
export function getPositiveTmdbId(movie) {
  const id = Number(movie?.tmdb_id ?? movie?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}
// Identifies the logical submission behind an operation: the same title going
// to the same bowl for the same person, whatever id a given attempt carries.
export function getSubmissionKey({ accountId, bowlId, movie }) {
  const tmdbId = getPositiveTmdbId(movie);
  return `${accountId}:${bowlId}:${tmdbId || String(movie?.title || "").trim().toLowerCase()}`;
}
// Codes whose write may still be in flight. Neither is a settled answer, so the
// operation stays claimed until it resolves and the same title cannot be sent
// again under a fresh id in the meantime.
export const UNSETTLED_ADD_CODES = ["outcome_unknown", "add_not_committed"];
export function isUnsettledAddCode(code) {
  return UNSETTLED_ADD_CODES.includes(code);
}
export function isDuplicateMovieError(error) {
  return error?.code === "23505" && /already in the bowl|bowl_active_tmdb_movies/i.test(`${error.message} ${error.details}`);
}
export function getDuplicateMovieMessage(movie, existingMovie) {
  const contributor = getMovieAttributionLabel(existingMovie);
  if (movie?.title && contributor && isStarterPackMovie(existingMovie)) {
    return `"${movie.title.trim()}" is already in the bowl, in the ${contributor} pack, so it can come up on anyone's turn.`;
  }
  return movie?.title && contributor
    ? `"${movie.title.trim()}" is already in the bowl — ${contributor} added it, so it can come up on their turn.`
    : "This movie is already in the bowl.";
}

// A claimed row comes back without its joined profile, and an ordinary add's
// pending row is what normally supplies one, so a claim names its adder the
// same way that row does.
const OWN_PROFILE = { display_name: "You" };

export function createBowlMovieService({ client = supabase, offline = isOffline,
  publish = notifyBowlChange, warmProviders = fetchProviderLinks,
  warmMetadata = warmTmdbMovieFilterMetadata } = {}) {
  const inFlight = new Set();

  const unknown = (operation) => addResult(false, "outcome_unknown",
    `Could not confirm whether ${operation.movie.title} was added to ${operation.bowlName || "this bowl"}. Check its status before trying again.`);

  const notCommitted = (operation) => addResult(false, "add_not_committed",
    `${operation.movie.title} has not been added to ${operation.bowlName || "this bowl"}. Try again — the same submission cannot add it twice.`);

  const matchesSubmission = (row, operation) => row.added_by === operation.accountId
    && row.bowl_id === operation.bowlId
    && row.title === String(operation.movie.title).trim()
    && getPositiveTmdbId(row) === getPositiveTmdbId(operation.movie)
    && normalizeMovieNote(row.note) === normalizeMovieNote(operation.movie.note);

  async function checkStatus(operation) {
    try {
      const { data: auth, error: authError } = await client.auth.getSession();
      if (authError || auth?.session?.user?.id !== operation.accountId || operation.isCurrent?.() === false) {
        return addResult(false, "not_authenticated", "You must be signed in to add a movie.");
      }
      const { data, error } = await client.from("bowl_movies").select(BOWL_MOVIE_FIELDS)
        .eq("id", operation.submissionId).maybeSingle();
      if (error) return unknown(operation);
      // The id read back is the submission's own primary key, so a row that is
      // not ours means retrying could only collide with it. Stay uncertain.
      if (data) return matchesSubmission(data, operation) ? { ...addResult(true), movie: data } : unknown(operation);
      // Nothing holds the id. Resending the same submission is safe even if the
      // first write is still in flight: whichever arrives second loses the
      // primary key and reconciles here rather than adding a second slip.
      return notCommitted(operation);
    } catch {
      // A failed read cannot establish whether the write committed.
      return unknown(operation);
    }
  }

  // Already this person's -- including a claim whose answer was lost and is
  // being retried -- so there is nothing to add. The row is published so an
  // open dashboard that still shows it as a pack slip catches up.
  function alreadyOwn({ accountId, bowlId }, movie, row) {
    publish({ type: "add", phase: "success", userId: accountId, bowlId, submissionId: row.id,
      movie: { ...row, profiles: OWN_PROFILE, local_status: null, local_temp_id: null } });
    return addResult(false, "duplicate_movie", `"${movie.title}" is already in the bowl, and it's yours.`);
  }

  // No warm on any path here: a pack title was never an ordinary add, and
  // claiming one must not spend the provider budget installs are kept off.
  async function claimPackSlip(operation, movie, slip) {
    const { accountId, bowlId } = operation;
    const claimed = (row) => {
      const settled = {
        ...addResult(true, "claimed_from_pack",
          `Added ${movie.title} — it was in the ${getMovieAttributionLabel(slip)} pack, now it's yours.`),
        movie: { ...row, profiles: OWN_PROFILE, local_status: null, local_temp_id: null },
      };
      publish({ type: "add", phase: "success", userId: accountId, bowlId, submissionId: row.id, movie: settled.movie });
      return settled;
    };
    // The claim writes as whoever is signed in now, so it is checked as late
    // as an insert is: an account switch mid-add must not claim for the wrong
    // person under the first one's name.
    const { data: latestAuth, error: latestAuthError } = await client.auth.getSession();
    if (latestAuthError || latestAuth?.session?.user?.id !== accountId || operation.isCurrent?.() === false) {
      return addResult(false, "not_authenticated", "You must be signed in to add a movie.");
    }

    let response;
    try {
      response = await client.rpc("claim_bowl_starter_pack_movie", {
        p_bowl_id: bowlId, p_tmdb_id: getPositiveTmdbId(movie), p_note: normalizeMovieNote(movie.note),
      });
    } catch (error) {
      response = { error };
    }
    if (!response.error) {
      const row = Array.isArray(response.data) ? response.data[0] : response.data;
      if (row?.id) return claimed(row);
    }

    const code = response.error?.code || "";
    if (code === "42501") return addResult(false, "access_lost", "You no longer have access to this bowl. Choose another bowl.");
    // Whatever the error, the slip is read back before anything is settled: a
    // lost answer may hide a claim that committed, and a refusal can be this
    // person's own earlier claim landing first. Only a slip that now belongs
    // to them settles it as theirs.
    let readBack = false;
    try {
      const { data: row, error } = await client.from("bowl_movies").select(BOWL_MOVIE_FIELDS).eq("id", slip.id).maybeSingle();
      if (!error && row && !row.drawn_at && row.added_by === accountId && !isStarterPackMovie(row)) {
        // Theirs, but not necessarily by this attempt: another tab on the
        // same account may have claimed it with a different comment. Only a
        // row carrying this submission's comment is this claim landing.
        if (normalizeMovieNote(row.note) === normalizeMovieNote(movie.note)) return claimed(row);
        return alreadyOwn(operation, movie, row);
      }
      readBack = !error;
    } catch {
      // Fall through: the read cannot say either way.
    }
    // The database said no and the slip is not theirs: someone else drew or
    // claimed it first. Settled, and a fresh add will see whatever is there.
    if (code === "P0001" && readBack) {
      return addResult(false, "claim_lost", `${movie.title} was just drawn or claimed by someone else. Try adding it again.`);
    }
    // An untouched slip proves nothing -- the claim may not have committed
    // yet -- so this stays unconfirmed. Adding it again is how to find out: a
    // claim that landed reads as this person's own title, and one that did
    // not claims again. Neither makes a second copy.
    // Said in full even offline: nothing retries this on reconnect, so the
    // usual "this will pick up where it left off" would promise too much.
    return addResult(false, "add_failed", `Could not confirm whether ${movie.title} was added. `
      + (isOfflineError(response.error) ? "Reconnect, then add it again to check." : "Add it again to check."));
  }

  async function add(operation) {
    const { bowlId, accountId, submissionId } = operation;
    const movie = { ...operation.movie, title: String(operation.movie?.title || "").trim() };
    if (!bowlId || !movie?.title?.trim() || !submissionId) return addResult(false, "invalid_movie", "Choose a movie to add.");
    const noteError = getMovieNoteValidationError(movie.note);
    if (noteError) return addResult(false, "comment_too_long", noteError);
    if (offline()) return addResult(false, "offline", OFFLINE_MESSAGE);
    const tmdbId = getPositiveTmdbId(movie);
    const key = getSubmissionKey({ accountId, bowlId, movie });
    if (inFlight.has(key)) return addResult(false, "duplicate_movie", getDuplicateMovieMessage(movie));
    inFlight.add(key);
    let optimistic = false;
    let dispatched = false;
    let existingMovie;
    let result;
    let user;
    let accessToken;
    const current = () => operation.isCurrent?.() !== false;
    const warm = (settled) => {
      if (settled?.ok && tmdbId && accessToken && current()) {
        Promise.resolve().then(() => warmProviders(tmdbId, bowlId)).catch(() => {});
        Promise.resolve().then(() => warmMetadata(tmdbId, bowlId, accessToken)).catch(() => {});
      }
      return settled;
    };
    try {
      const { data: auth, error: authError } = await client.auth.getSession();
      user = auth?.session?.user;
      accessToken = auth?.session?.access_token;
      if (authError || !user || user.id !== accountId || !current()) {
        return addResult(false, "not_authenticated", "You must be signed in to add a movie.");
      }
      // The access check and the bowl read are both reads, so they go out
      // together; access is still decided before anything uses the rows, and
      // row-level security already limits what the read can return.
      const [
        { data: context, error: accessError },
        { data: remaining, error: readError },
      ] = await Promise.all([
        client.rpc("get_my_bowl_context"),
        client.from("bowl_movies")
          .select(BOWL_MOVIE_FIELDS).eq("bowl_id", bowlId).is("drawn_at", null).order("added_at", { ascending: true }),
      ]);
      if (accessError) throw accessError;
      if (!context?.bowls?.some((bowl) => bowl.id === bowlId)) {
        return addResult(false, "access_lost", "You no longer have access to this bowl. Choose another bowl.");
      }
      if (readError) throw readError;
      // Ahead of both the limit and the duplicate check: this submission already
      // succeeded, so neither is its problem. Its own late-landed row could be
      // the one filling the bowl, or the one that looks like a duplicate.
      const landed = (remaining || []).find((row) => row.id === submissionId);
      if (landed && matchesSubmission(landed, operation)) {
        result = { ...addResult(true), movie: { ...landed, local_status: null, local_temp_id: null } };
        publish({ type: "add", phase: "success", userId: accountId, bowlId, submissionId, movie: result.movie });
        return warm(result);
      }
      existingMovie = tmdbId && (remaining || []).find((row) => getPositiveTmdbId(row) === tmdbId);
      // Adding a title that is sitting in the bowl's starter pack claims it:
      // the slip becomes this person's, in place, so the bowl keeps one copy
      // and they can pin it. Ahead of the limit, because the count does not
      // move -- which is also why the message says what happened.
      if (existingMovie && isStarterPackMovie(existingMovie)) {
        result = await claimPackSlip(operation, movie, existingMovie);
        return result;
      }
      // Already this person's -- including a claim whose answer was lost and
      // is being retried -- so there is nothing to add and nothing to wait for.
      if (existingMovie && existingMovie.added_by === accountId) {
        return alreadyOwn(operation, movie, existingMovie);
      }
      if ((remaining || []).length >= MAX_UNDRAWN_MOVIES_PER_BOWL) {
        return addResult(false, "limit_reached", `Bowl is at the undrawn movie limit (${MAX_UNDRAWN_MOVIES_PER_BOWL}).`);
      }
      if (existingMovie) {
        const { data: profiles } = await client.rpc("get_bowl_profile_directory", { p_bowl_id: bowlId });
        const profile = profiles?.find((row) => row.user_id === existingMovie.added_by);
        if (profile) {
          existingMovie = {
            ...existingMovie,
            profiles: { display_name: profile.display_name || null },
          };
        }
        return addResult(false, "duplicate_movie", getDuplicateMovieMessage(movie, existingMovie));
      }
      const { data: latestAuth, error: latestAuthError } = await client.auth.getSession();
      if (latestAuthError || latestAuth?.session?.user?.id !== accountId || !current()) {
        return addResult(false, "not_authenticated", "You must be signed in to add a movie.");
      }
      const now = new Date().toISOString();
      const payload = {
        id: submissionId, bowl_id: bowlId, added_by: accountId, tmdb_id: tmdbId,
        title: movie.title.trim(), poster_path: movie.poster_path ?? null,
        release_date: movie.release_date ?? null, runtime: movie.runtime ?? null,
        genres: (Array.isArray(movie.genres) ? movie.genres : []).map((genre) => typeof genre === "string" ? genre : genre?.name).filter(Boolean),
        overview: movie.overview ?? null, note: normalizeMovieNote(movie.note),
        is_pinned: false, snapshot_at: now,
      };
      optimistic = true;
      publish({ type: "add", phase: "pending", userId: accountId, bowlId, submissionId,
        movie: { ...payload, local_temp_id: submissionId, local_status: "syncing", added_at: now,
          drawn_at: null, drawn_by: null, profiles: { display_name: "You" } } });
      const insert = (row) => client.from("bowl_movies").insert([row]).select(BOWL_MOVIE_FIELDS).single();
      dispatched = true;
      let response = await insert(payload);
      if (response.error?.code === "23502" && /tmdb_id/i.test(`${response.error.message} ${response.error.details}`) && tmdbId === null && current()) {
        response = await insert({ ...payload, tmdb_id: -Math.floor(Math.random() * 2_000_000_000) - 1 });
      }
      if (response.error) throw response.error;
      const persisted = Array.isArray(response.data) ? response.data[0] : response.data;
      result = persisted?.id ? { ...addResult(true), movie: { ...persisted, local_status: null, local_temp_id: null } } : await checkStatus(operation);
    } catch (error) {
      if (isDuplicateMovieError(error)) {
        result = addResult(false, "duplicate_movie", getDuplicateMovieMessage(movie, existingMovie));
      } else if (error?.code === "42501" || error?.code === "23503") {
        result = addResult(false, "access_lost", "You no longer have access to this bowl. Choose another bowl.");
      } else if (dispatched && (!/^(?:[0-9A-Z]{5}|PGRST[0-9]+)$/.test(error?.code || "") || (error.code === "23505" && /pkey/i.test(error.message || "")))) {
        result = await checkStatus(operation);
      } else {
        result = addResult(false, "add_failed", describeNetworkError(error, "Could not add this movie. Please try again."));
      }
    } finally {
      inFlight.delete(key);
      if (optimistic && current()) publish({ type: "add", phase: result?.ok ? "success" : "error",
        userId: accountId, bowlId, submissionId, movie: result?.movie });
    }
    return warm(result);
  }
  return { add, checkStatus };
}

export const bowlMovieService = createBowlMovieService();
