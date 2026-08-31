import { useCallback, useEffect, useMemo, useState } from "react";
import AddMovieModal from "../components/AddMovieModal";
import RemoveFromBowlsModal from "../components/RemoveFromBowlsModal";
import WatchHistoryEntryModal from "../components/WatchHistoryEntryModal";
import { getPosterUrl } from "../utils/getPosterUrl";
import { notifyBowlChange } from "../lib/bowlChanges";
import { supabase } from "../lib/supabase";
import { getTmdbMovieDetails } from "../lib/tmdbApi";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { getMovieNoteValidationError, normalizeMovieNote } from "../utils/movieNote";
import {
  buildLetterboxdWatchedCsv,
  getLetterboxdWatchedExportFileName,
} from "../utils/letterboxdExport";

function formatWatchedDate(value) {
  const date = getWatchedDate(value);
  return date ? date.toLocaleDateString() : null;
}

function getWatchedDate(value) {
  if (!value) return null;

  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getLocalDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export default function WatchListPage() {
  const [movies, setMovies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [selectedDetailMovie, setSelectedDetailMovie] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [isEntryEditorOpen, setIsEntryEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [entryEditorError, setEntryEditorError] = useState("");
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [bowlRemoval, setBowlRemoval] = useState(null);
  const [bowlRemovalError, setBowlRemovalError] = useState("");
  const [isRemovingFromBowls, setIsRemovingFromBowls] = useState(false);

  const loadWatchList = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;

      if (authError || !user) {
        setMovies([]);
        return;
      }

      const { data: watchedRows, error: watchedError } = await supabase
        .from("user_watch_events")
        .select(
          "id, source_draw_event_id, source_kind, bowl_name, tmdb_id, title, poster_path, release_date, runtime, genres, overview, note, watched_on, created_at, updated_at"
        )
        .eq("user_id", user.id)
        .order("watched_on", { ascending: false })
        .order("created_at", { ascending: false });

      if (watchedError) {
        console.error("[WatchListPage] Failed to load watch history", watchedError);
        setMovies([]);
        setErrorMessage("Failed to load your watch history.");
        return;
      }

      setMovies(watchedRows || []);
    } catch (error) {
      console.error("[WatchListPage] Unexpected error", error);
      setMovies([]);
      setErrorMessage("Unexpected error loading your watch history.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWatchList();
  }, [loadWatchList]);

  const buildDetailMovie = async (movie) => {
    const tmdbId = Number(movie?.tmdb_id ?? movie?.id);
    const shouldFetchTmdbDetails = Number.isInteger(tmdbId) && tmdbId > 0;

    if (!shouldFetchTmdbDetails) {
      return {
        ...movie,
        streamingProviders: movie.streamingProviders || [],
        streamingRegion: movie.streamingRegion || "US",
        streamingFetchedAt: movie.streamingFetchedAt || null,
      };
    }

    const [detailsResult, providersResult] = await Promise.allSettled([
      getTmdbMovieDetails(tmdbId),
      fetchStreamingProviders(tmdbId, { region: "US" }),
    ]);

    if (detailsResult.status === "rejected") {
      console.error("[WatchListPage] Failed to load TMDB detail enrichment", detailsResult.reason);
    }
    if (providersResult.status === "rejected") {
      console.error("[WatchListPage] Failed to load streaming provider enrichment", providersResult.reason);
    }

    const details = detailsResult.status === "fulfilled" ? detailsResult.value : null;
    const providerData =
      providersResult.status === "fulfilled"
        ? providersResult.value
        : { providers: [], region: "US", fetchedAt: null };

    return {
      ...(details || {}),
      ...movie,
      bowlMovieId: movie?.id ?? null,
      streamingProviders: providerData.providers || [],
      streamingRegion: providerData.region || "US",
      streamingFetchedAt: providerData.fetchedAt || null,
    };
  };

  const rows = useMemo(
    () =>
      (movies || [])
        .map((movie) => {
          const watchedDate = getWatchedDate(movie?.watched_on ?? movie?.drawn_at);

          return {
            ...movie,
            bowlName: movie?.bowl_name || null,
            watchedDate,
            watchedDateLabel: formatWatchedDate(movie?.watched_on ?? movie?.drawn_at),
            createdAt: getWatchedDate(movie?.created_at),
            watchedYear: watchedDate?.getFullYear() ?? null,
            releaseYear: movie?.release_date ? String(movie.release_date).split("-")[0] : "—",
            posterUrl: getPosterUrl(movie, "w200"),
          };
        })
        .sort(
          (firstMovie, secondMovie) =>
            (secondMovie.watchedDate?.getTime() ?? 0) - (firstMovie.watchedDate?.getTime() ?? 0) ||
            (secondMovie.createdAt?.getTime() ?? 0) - (firstMovie.createdAt?.getTime() ?? 0)
        ),
    [movies]
  );
  const availableYears = useMemo(
    () =>
      [...new Set(rows.map((movie) => movie.watchedYear).filter(Number.isInteger))].sort(
        (firstYear, secondYear) => secondYear - firstYear
      ),
    [rows]
  );
  const activeYear =
    selectedYear !== null && availableYears.includes(selectedYear)
      ? selectedYear
      : availableYears[0] ?? null;
  const activeYearIndex = activeYear === null ? -1 : availableYears.indexOf(activeYear);
  const previousWatchedYear =
    activeYearIndex >= 0 ? availableYears[activeYearIndex + 1] ?? null : null;
  const nextWatchedYear =
    activeYearIndex > 0 ? availableYears[activeYearIndex - 1] ?? null : null;
  const filteredRows = useMemo(
    () => rows.filter((movie) => movie.watchedYear === activeYear),
    [activeYear, rows]
  );
  const monthGroups = useMemo(() => {
    const groups = [];
    const monthMap = new Map();

    filteredRows.forEach((movie) => {
      if (!movie.watchedDate) return;

      const monthKey = `${movie.watchedDate.getFullYear()}-${movie.watchedDate.getMonth()}`;
      let monthGroup = monthMap.get(monthKey);

      if (!monthGroup) {
        monthGroup = {
          key: monthKey,
          label: movie.watchedDate.toLocaleDateString(undefined, { month: "long" }),
          dayGroups: [],
          dayMap: new Map(),
          movieCount: 0,
        };
        monthMap.set(monthKey, monthGroup);
        groups.push(monthGroup);
      }

      const dayKey = getLocalDateKey(movie.watchedDate);
      let dayGroup = monthGroup.dayMap.get(dayKey);

      if (!dayGroup) {
        dayGroup = {
          key: dayKey,
          dateTime: dayKey,
          weekdayLabel: movie.watchedDate.toLocaleDateString(undefined, { weekday: "short" }),
          dayLabel: movie.watchedDate.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          }),
          dayNumber: movie.watchedDate.getDate(),
          movies: [],
        };
        monthGroup.dayMap.set(dayKey, dayGroup);
        monthGroup.dayGroups.push(dayGroup);
      }

      dayGroup.movies.push(movie);
      monthGroup.movieCount += 1;
    });

    return groups.map((group) => ({
      key: group.key,
      label: group.label,
      dayGroups: group.dayGroups,
      movieCount: group.movieCount,
    }));
  }, [filteredRows]);
  const letterboxdExport = useMemo(() => buildLetterboxdWatchedCsv(rows), [rows]);
  const canExportLetterboxd =
    !isLoading && !errorMessage && letterboxdExport.exportedCount > 0;
  const allTimeCountLabel = rows.length === 1 ? "1 all time" : `${rows.length} all time`;
  const selectedYearCountLabel =
    filteredRows.length === 1 ? "1 watched" : `${filteredRows.length} watched`;
  const emptyCountLabel = rows.length === 1 ? "1 watched movie" : `${rows.length} watched movies`;

  const handleExportLetterboxd = () => {
    if (!canExportLetterboxd) return;

    const blob = new Blob([letterboxdExport.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = getLetterboxdWatchedExportFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const normalizeGenres = (genres) =>
    Array.isArray(genres)
      ? genres
          .map((genre) => (typeof genre === "string" ? genre : genre?.name))
          .filter(Boolean)
      : [];

  // Only your own undrawn slips are offered. RLS would let a bowl owner delete
  // anyone's row, but silently dropping someone else's title would also shift
  // person-first odds for the whole bowl with no visible cause.
  const findOwnUndrawnBowlMovies = async (tmdbId) => {
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) return [];

    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;

      if (authError || !user) return [];

      const { data: bowlMovies, error: bowlMoviesError } = await supabase
        .from("bowl_movies")
        .select("id, bowl_id")
        .eq("added_by", user.id)
        .eq("tmdb_id", tmdbId)
        .is("drawn_at", null);

      if (bowlMoviesError) {
        console.error("[WatchListPage] Failed to look up bowl copies", bowlMoviesError);
        return [];
      }

      const matches = bowlMovies || [];
      if (matches.length === 0) return [];

      const { data: bowlRows, error: bowlsError } = await supabase
        .from("bowls")
        .select("id, name")
        .in("id", [...new Set(matches.map((match) => match.bowl_id))]);

      if (bowlsError) {
        console.error("[WatchListPage] Failed to load bowl names", bowlsError);
        return [];
      }

      const bowlNames = new Map((bowlRows || []).map((bowl) => [bowl.id, bowl.name]));

      return matches
        .filter((match) => bowlNames.has(match.bowl_id))
        .map((match) => ({
          id: match.id,
          bowlId: match.bowl_id,
          bowlName: bowlNames.get(match.bowl_id),
        }));
    } catch (error) {
      // The prompt is a convenience on top of a saved entry, so a failed lookup
      // degrades to not offering it rather than breaking the save.
      console.error("[WatchListPage] Unexpected error looking up bowl copies", error);
      return [];
    }
  };

  const handleSaveEntry = async (entry) => {
    const title = String(entry?.title || "").trim();
    if (!title || !entry?.watched_on) {
      setEntryEditorError("Add a title and the date you watched it.");
      return;
    }
    const canEditNote = !editingEntry?.id || editingEntry?.source_kind === "manual";
    const noteValidationError = canEditNote
      ? getMovieNoteValidationError(entry?.note)
      : null;
    if (noteValidationError) {
      setEntryEditorError(noteValidationError);
      return;
    }

    setIsSavingEntry(true);
    setEntryEditorError("");

    try {
      let error;
      let createdTmdbId = null;

      if (editingEntry?.id) {
        const updateParams = {
          p_event_id: editingEntry.id,
          p_title: title,
          p_watched_on: entry.watched_on,
          p_release_date: entry.release_date || null,
        };
        if (editingEntry.source_kind === "manual") {
          updateParams.p_note = normalizeMovieNote(entry.note);
        }
        ({ error } = await supabase.rpc("update_user_watch_event", updateParams));
      } else {
        const tmdbId = Number(entry?.tmdb_id ?? entry?.id);
        createdTmdbId = Number.isInteger(tmdbId) && tmdbId > 0 ? tmdbId : null;
        ({ error } = await supabase.rpc("create_manual_watch_event", {
          p_title: title,
          p_watched_on: entry.watched_on,
          p_tmdb_id: createdTmdbId,
          p_poster_path: entry?.poster_path || null,
          p_release_date: entry.release_date || null,
          p_runtime: entry?.runtime || null,
          p_genres: normalizeGenres(entry?.genres),
          p_overview: entry?.overview || null,
          p_note: normalizeMovieNote(entry?.note),
        }));
      }

      if (error) {
        console.error("[WatchListPage] Failed to save watch history entry", error);
        setEntryEditorError(error.message || "Could not save this history entry. Please try again.");
        return;
      }

      setIsEntryEditorOpen(false);
      setEditingEntry(null);
      await loadWatchList();

      if (createdTmdbId) {
        const matches = await findOwnUndrawnBowlMovies(createdTmdbId);

        if (matches.length > 0) {
          setBowlRemovalError("");
          setBowlRemoval({ title, matches });
        }
      }
    } catch (error) {
      console.error("[WatchListPage] Unexpected error saving watch history entry", error);
      setEntryEditorError("Could not save this history entry. Please try again.");
    } finally {
      setIsSavingEntry(false);
    }
  };

  const handleRemoveFromBowls = async (bowlMovieIds) => {
    const targetIds = (bowlMovieIds || []).filter(Boolean);
    if (targetIds.length === 0 || isRemovingFromBowls) return;

    setIsRemovingFromBowls(true);
    setBowlRemovalError("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;

      if (authError || !user) {
        setBowlRemovalError("Could not remove it from your bowls. Please try again.");
        return;
      }

      const { error } = await supabase
        .from("bowl_movies")
        .delete()
        .in("id", targetIds)
        .eq("added_by", user.id)
        .is("drawn_at", null);

      if (error) {
        console.error("[WatchListPage] Failed to remove movie from bowls", error);
        setBowlRemovalError("Could not remove it from your bowls. Please try again.");
        return;
      }

      notifyBowlChange({ userId: user.id });
      setBowlRemoval(null);
    } catch (error) {
      console.error("[WatchListPage] Unexpected error removing movie from bowls", error);
      setBowlRemovalError("Could not remove it from your bowls. Please try again.");
    } finally {
      setIsRemovingFromBowls(false);
    }
  };

  const handleKeepInBowls = () => {
    if (isRemovingFromBowls) return;

    setBowlRemoval(null);
    setBowlRemovalError("");
  };

  const handleDeleteEntry = async (entry) => {
    if (!entry?.id || isSavingEntry) return;

    setIsSavingEntry(true);
    setEntryEditorError("");

    try {
      const { error } = await supabase.rpc("delete_user_watch_event", {
        p_event_id: entry.id,
      });

      if (error) {
        console.error("[WatchListPage] Failed to delete watch history entry", error);
        setEntryEditorError(error.message || "Could not remove this history entry. Please try again.");
        return;
      }

      setIsEntryEditorOpen(false);
      setEditingEntry(null);
      setSelectedDetailMovie(null);
      await loadWatchList();
    } catch (error) {
      console.error("[WatchListPage] Unexpected error deleting watch history entry", error);
      setEntryEditorError("Could not remove this history entry. Please try again.");
    } finally {
      setIsSavingEntry(false);
    }
  };

  return (
    <div className="page-container py-6 sm:py-8">
      <section className="page-hero mx-auto max-w-5xl">
        <div className="mb-7 flex flex-col gap-4 border-b border-slate-800 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="eyebrow">History</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
              Watch History
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">
              Your personal record of movies you watched, from bowls and on your own.
            </p>
            {!isLoading && !errorMessage && (
              <p className="mt-2 text-sm font-semibold text-slate-400">
                {activeYear === null
                  ? emptyCountLabel
                  : `${selectedYearCountLabel} in ${activeYear} · ${allTimeCountLabel}`}
              </p>
            )}
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <button
              type="button"
              className="btn btn-primary whitespace-nowrap"
              onClick={() => {
                setEntryEditorError("");
                setEditingEntry(null);
                setIsEntryEditorOpen(true);
              }}
            >
              Log a watched movie
            </button>
            <button
              type="button"
              className="btn btn-secondary whitespace-nowrap disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-400 disabled:shadow-none"
              onClick={handleExportLetterboxd}
              disabled={!canExportLetterboxd}
            >
              Export all history CSV
            </button>
            {!isLoading && !errorMessage && rows.length > 0 && letterboxdExport.skippedCount > 0 && (
              <p className="text-xs text-slate-400">
                {letterboxdExport.exportedCount} exportable, {letterboxdExport.skippedCount} skipped
              </p>
            )}
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-400">Loading your watch history…</p>
        ) : errorMessage ? (
          <div className="status-error">{errorMessage}</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/35 px-5 py-10 text-center">
            <p className="text-lg font-medium text-slate-200">No watched movies yet</p>
            <p className="mt-2 text-sm text-slate-400">
              Add a movie yourself, or draw one from a bowl to record it automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            <div
              className="flex flex-col gap-3 rounded-2xl border border-slate-700/70 bg-slate-950/45 p-3 sm:flex-row sm:items-end sm:justify-between sm:p-4"
              aria-label="Watched year"
            >
              <label className="min-w-0 flex-1 text-sm font-medium text-slate-300">
                Year watched
                <select
                  className="input-field mt-1.5"
                  value={activeYear ?? ""}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                >
                  {availableYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button
                  type="button"
                  className="btn btn-secondary px-3 text-sm"
                  onClick={() => setSelectedYear(previousWatchedYear)}
                  disabled={previousWatchedYear === null}
                  aria-label="Show previous watched year"
                >
                  <span aria-hidden="true">←</span>
                  Older
                </button>
                <button
                  type="button"
                  className="btn btn-secondary px-3 text-sm"
                  onClick={() => setSelectedYear(nextWatchedYear)}
                  disabled={nextWatchedYear === null}
                  aria-label="Show next watched year"
                >
                  Newer
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>

            <div className="space-y-10">
              {monthGroups.map((monthGroup) => (
                <section key={monthGroup.key} aria-labelledby={`month-${monthGroup.key}`}>
                  <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-slate-800 pb-3">
                    <h2
                      id={`month-${monthGroup.key}`}
                      className="text-2xl font-semibold tracking-tight text-slate-100"
                    >
                      {monthGroup.label}
                    </h2>
                    <span className="text-sm font-semibold text-slate-400">
                      {monthGroup.movieCount} {monthGroup.movieCount === 1 ? "movie" : "movies"}
                    </span>
                  </div>

                  <div className="relative space-y-6 before:absolute before:bottom-2 before:left-[1.35rem] before:top-2 before:w-px before:bg-slate-800 sm:before:left-[3.7rem]">
                    {monthGroup.dayGroups.map((dayGroup) => (
                      <div
                        key={dayGroup.key}
                        className="relative grid gap-3 pl-14 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-4 sm:pl-0"
                      >
                        <time
                          dateTime={dayGroup.dateTime}
                          className="absolute left-0 top-0 z-10 flex h-11 w-11 flex-col items-center justify-center rounded-xl border border-rose-900/70 bg-rose-950/70 text-center shadow-lg shadow-black/20 sm:static sm:h-auto sm:min-h-16 sm:w-full sm:flex-row sm:gap-2 sm:self-start sm:bg-slate-950/80"
                          aria-label={dayGroup.dayLabel}
                        >
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-300 sm:text-xs">
                            {dayGroup.weekdayLabel}
                          </span>
                          <span className="text-base font-bold leading-none text-slate-50 sm:text-xl">
                            {dayGroup.dayNumber}
                          </span>
                        </time>

                        <div className="space-y-3">
                          <p className="sr-only">{dayGroup.dayLabel}</p>
                          {dayGroup.movies.map((movie) => (
                            <button
                              key={movie.id}
                              type="button"
                              onClick={async () => {
                                setSelectedDetailMovie(await buildDetailMovie(movie));
                              }}
                              className="group flex w-full items-center gap-4 rounded-2xl border border-slate-700/80 bg-slate-950/45 p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-slate-600 hover:bg-slate-900/80 hover:shadow-lg hover:shadow-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/60"
                            >
                              <img
                                src={movie.posterUrl}
                                alt={movie.title}
                                className="h-24 w-16 flex-shrink-0 rounded-xl object-cover shadow-md shadow-black/30"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                  <h3 className="text-lg font-semibold text-slate-100">
                                    {movie.title}
                                  </h3>
                                  <span className="text-sm text-slate-400">
                                    ({movie.releaseYear})
                                  </span>
                                </div>
                                <p className="mt-2 text-sm text-slate-300">
                                  {movie.bowlName ? `From ${movie.bowlName}` : "Added manually"}
                                </p>
                                {movie.watchedDateLabel && (
                                  <p className="mt-1 text-sm text-slate-400">
                                    Watched on {movie.watchedDateLabel}
                                  </p>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </section>

      {selectedDetailMovie && (
        <AddMovieModal
          movie={selectedDetailMovie}
          userStreamingServices={[]}
          detailPrimaryActionLabel="Edit history"
          onDetailPrimaryAction={async (movie) => {
            setEntryEditorError("");
            setSelectedDetailMovie(null);
            setEditingEntry(movie);
            setIsEntryEditorOpen(true);
          }}
          onClose={() => setSelectedDetailMovie(null)}
        />
      )}

      {isEntryEditorOpen && (
        <WatchHistoryEntryModal
          entry={editingEntry}
          onClose={() => {
            if (isSavingEntry) return;
            setEntryEditorError("");
            setIsEntryEditorOpen(false);
            setEditingEntry(null);
          }}
          onSave={handleSaveEntry}
          onDelete={handleDeleteEntry}
          isSaving={isSavingEntry}
          errorMessage={entryEditorError}
        />
      )}

      {bowlRemoval && (
        <RemoveFromBowlsModal
          title={bowlRemoval.title}
          matches={bowlRemoval.matches}
          onKeep={handleKeepInBowls}
          onRemove={handleRemoveFromBowls}
          isRemoving={isRemovingFromBowls}
          errorMessage={bowlRemovalError}
        />
      )}
    </div>
  );
}
