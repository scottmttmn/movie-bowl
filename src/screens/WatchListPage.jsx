import { useCallback, useEffect, useMemo, useState } from "react";
import AddMovieModal from "../components/AddMovieModal";
import RemoveFromBowlsModal from "../components/RemoveFromBowlsModal";
import WatchHistoryEntryModal from "../components/WatchHistoryEntryModal";
import { getPosterUrl } from "../utils/getPosterUrl";
import { notifyBowlChange } from "../lib/bowlChanges";
import { findOwnUndrawnBowlCopies, removeOwnBowlCopies } from "../lib/ownBowlCopies";
import {
  describeSkippedRestores,
  fetchSoloDrawRemovedCopies,
  undoSoloDraw,
} from "../lib/soloDraw";
import { isWithinSoloUndoWindow } from "../utils/watchHistory";
import { supabase } from "../lib/supabase";
import { getTmdbMovieDetails } from "../lib/tmdbApi";
import { getMovieNoteValidationError, normalizeMovieNote } from "../utils/movieNote";
import { updateOwnWatchComment } from "../lib/watchComments";
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
  const [restorableCopies, setRestorableCopies] = useState([]);
  const [restoreNotice, setRestoreNotice] = useState("");
  const [exportNotice, setExportNotice] = useState("");

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
          "id, source_draw_event_id, source_kind, source_bowl_movie_id, bowl_name, tmdb_id, title, poster_path, release_date, runtime, genres, overview, note, personal_note, watched_on, created_at, updated_at"
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
      return { ...movie };
    }

    let details = null;
    try {
      details = await getTmdbMovieDetails(tmdbId);
    } catch (error) {
      console.error("[WatchListPage] Failed to load TMDB detail enrichment", error);
    }

    return {
      ...(details || {}),
      ...movie,
      bowlMovieId: movie?.id ?? null,
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

    // The tooltip cannot be read on a phone, so an export that left titles
    // out says so where everyone sees it.
    const { exportedCount, skippedCount } = letterboxdExport;
    setExportNotice(
      skippedCount > 0
        ? `Exported ${exportedCount} ${exportedCount === 1 ? "movie" : "movies"}. ` +
            `${skippedCount} custom ${skippedCount === 1 ? "title was" : "titles were"} skipped, ` +
            "because Letterboxd can only match movies from the search."
        : ""
    );
  };

  const normalizeGenres = (genres) =>
    Array.isArray(genres)
      ? genres
          .map((genre) => (typeof genre === "string" ? genre : genre?.name))
          .filter(Boolean)
      : [];

  const handleSaveEntry = async (entry) => {
    const title = String(entry?.title || "").trim();
    if (!title || !entry?.watched_on) {
      setEntryEditorError("Add a title and the date you watched it.");
      return;
    }
    const noteValidationError = getMovieNoteValidationError(entry?.personal_note);
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
        ({ error } = await supabase.rpc("update_user_watch_event", {
          p_event_id: editingEntry.id,
          p_title: title,
          p_watched_on: entry.watched_on,
          p_release_date: entry.release_date || null,
          p_note: normalizeMovieNote(entry.personal_note),
          p_set_personal_note: true,
        }));
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
          p_note: normalizeMovieNote(entry?.personal_note),
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
        const matches = await findOwnUndrawnBowlCopies({ tmdbId: createdTmdbId });

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

  const handleSavePersonalNote = async (entryId, note) => {
    const result = await updateOwnWatchComment(entryId, note);
    if (result.ok) {
      const patch = (row) => (row?.id === entryId ? { ...row, personal_note: result.note } : row);
      setMovies((current) => current.map(patch));
      setSelectedDetailMovie((current) => patch(current));
    }
    return result;
  };

  // Offered from a solo entry rather than at the reveal: drawing alone does not
  // decide anything for the groups you share those copies with, and the lookup
  // has to answer for the bowls as they are now, not as they were that night.
  const handleOfferBowlRemoval = async (entry) => {
    if (!entry?.id || isSavingEntry) return;

    setEntryEditorError("");
    const matches = await findOwnUndrawnBowlCopies({
      tmdbId: Number(entry.tmdb_id),
      bowlMovieId: entry.source_bowl_movie_id || null,
    });

    if (matches.length === 0) {
      setEntryEditorError("This movie is no longer in any of your bowls.");
      return;
    }

    setIsEntryEditorOpen(false);
    setEditingEntry(null);
    setBowlRemovalError("");
    setBowlRemoval({ title: entry.title, matches });
  };

  const handleRemoveFromBowls = async (bowlMovieIds) => {
    if (isRemovingFromBowls) return;

    setIsRemovingFromBowls(true);
    setBowlRemovalError("");

    try {
      const removal = await removeOwnBowlCopies(bowlMovieIds);

      if (!removal.ok) {
        setBowlRemovalError(removal.message);
        return;
      }

      notifyBowlChange({ userId: removal.userId });
      setBowlRemoval(null);
    } finally {
      setIsRemovingFromBowls(false);
    }
  };

  // Read when the editor opens rather than with the list: only this one entry
  // needs it, and only while it is young enough for undo to mean a restore.
  useEffect(() => {
    if (!isEntryEditorOpen || !isWithinSoloUndoWindow(editingEntry)) {
      setRestorableCopies([]);
      return;
    }

    let active = true;
    fetchSoloDrawRemovedCopies(editingEntry.id).then((copies) => {
      if (active) setRestorableCopies(copies);
    });

    return () => {
      active = false;
    };
  }, [isEntryEditorOpen, editingEntry]);

  const handleKeepInBowls = () => {
    if (isRemovingFromBowls) return;

    setBowlRemoval(null);
    setBowlRemovalError("");
  };

  const handleDeleteEntry = async (entry) => {
    if (!entry?.id || isSavingEntry) return;

    setIsSavingEntry(true);
    setEntryEditorError("");
    setRestoreNotice("");

    try {
      // Inside the window a solo entry undoes rather than deletes. With the
      // automatic-removal setting off the two do the same thing; with it on,
      // only undo puts the copies back, and the server refuses the plain
      // deletion for exactly that reason.
      if (isWithinSoloUndoWindow(entry)) {
        const undo = await undoSoloDraw(entry.id);

        if (!undo.ok) {
          setEntryEditorError(undo.message);
          return;
        }

        setIsEntryEditorOpen(false);
        setEditingEntry(null);
        setSelectedDetailMovie(null);
        setRestoreNotice(describeSkippedRestores(undo.skipped));
        if (undo.restored > 0) notifyBowlChange({});
        await loadWatchList();
        return;
      }

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
        <div className="mb-7 flex items-start justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
              Watch History
            </h1>
            {!isLoading && !errorMessage && rows.length > 0 && (
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-slate-400">
                {activeYear === null ? (
                  emptyCountLabel
                ) : (
                  <>
                    <span>{selectedYearCountLabel} in</span>
                    <select
                      className="input-field min-h-0 w-auto py-1 pl-2.5 pr-8 text-sm font-semibold"
                      aria-label="Year watched"
                      value={activeYear}
                      onChange={(event) => setSelectedYear(Number(event.target.value))}
                    >
                      {availableYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                    <span>· {allTimeCountLabel}</span>
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="icon-btn"
              aria-label="Log a watched movie"
              title="Log a watched movie"
              onClick={() => {
                setEntryEditorError("");
                setEditingEntry(null);
                setIsEntryEditorOpen(true);
              }}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            {/* The skipped count is detail, not status: custom titles have no
                TMDB id for Letterboxd to match, so it rides on the tooltip. */}
            <button
              type="button"
              className="icon-btn disabled:cursor-not-allowed disabled:opacity-45"
              aria-label="Export all history CSV"
              title={
                letterboxdExport.skippedCount > 0
                  ? `Export all history CSV (${letterboxdExport.exportedCount} exportable, ${letterboxdExport.skippedCount} skipped)`
                  : "Export all history CSV"
              }
              onClick={handleExportLetterboxd}
              disabled={!canExportLetterboxd}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
              </svg>
            </button>
          </div>
        </div>

        {exportNotice && (
          <div className="status-warning mb-4 flex flex-wrap items-center justify-between gap-3" role="status">
            <p>{exportNotice}</p>
            <button type="button" className="btn btn-ghost" onClick={() => setExportNotice("")}>
              Dismiss
            </button>
          </div>
        )}

        {restoreNotice && (
          <div className="status-warning mb-4 flex flex-wrap items-center justify-between gap-3" role="status">
            <p>{restoreNotice}</p>
            <button type="button" className="btn btn-ghost" onClick={() => setRestoreNotice("")}>
              Dismiss
            </button>
          </div>
        )}

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
                                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-300">
                                  {movie.bowlName ? `From ${movie.bowlName}` : "Added manually"}
                                  {movie.source_kind === "solo_draw" && (
                                    <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
                                      Solo
                                    </span>
                                  )}
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
          showWhereToWatch={false}
          noteHeading="Why it was in the bowl"
          noteCollapsed
          personalComment={{
            entryId: selectedDetailMovie.id,
            note: selectedDetailMovie.personal_note,
            onSave: (note) => handleSavePersonalNote(selectedDetailMovie.id, note),
          }}
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
          onRemoveFromBowls={
            editingEntry?.source_kind === "solo_draw" ? handleOfferBowlRemoval : null
          }
          restorableCopies={restorableCopies}
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
