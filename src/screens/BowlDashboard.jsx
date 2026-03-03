import { useEffect, useMemo, useState } from "react";
import DrawButton from "../components/DrawButton";
import RemainingCount from "../components/RemainingCount";
import WatchedMoviesStrip from "../components/WatchedMoviesStrip";
import MyAddedMoviesStrip from "../components/MyAddedMoviesStrip";
import AddMovieButton from "../components/AddMovieButton";
import BowlIllustration from "../components/BowlIllustration";
import ContributionStats from "../components/ContributionStats";
import useBowl from "../hooks/useBowl";
import useUserStreamingServices from "../hooks/useUserStreamingServices";
import AddMovieModal from "../components/AddMovieModal";
import DrawAnimationModal from "../components/DrawAnimationModal";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getTmdbMovieDetails } from "../lib/tmdbApi";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { checkContributionBalance } from "../utils/contributionBalance";
import { MAX_UNDRAWN_MOVIES_PER_BOWL } from "../utils/appLimits";
import { MPAA_RATING_OPTIONS } from "../utils/movieRatings";
import {
  DEFAULT_DRAW_SETTINGS,
  RUNTIME_FILTER_MAX_MINUTES,
  RUNTIME_FILTER_MIN_MINUTES,
} from "../utils/drawSettings";


export default function BowlDashboard() {
    
    const { bowlId } = useParams();
    const { bowl, contributions, isLoading, errorMessage, handleDraw, handleAddMovie, handleDeleteMovie, handleReaddMovie } = useBowl(bowlId);

    const [showSearch, setShowSearch] = useState(false);
    const [drawnMovie, setDrawnMovie] = useState(null);
    const [selectedDetailMovie, setSelectedDetailMovie] = useState(null);
    const [selectedDetailContext, setSelectedDetailContext] = useState(null);
    const [showMyAdds, setShowMyAdds] = useState(false);
    const [prioritizeStreaming, setPrioritizeStreaming] = useState(false);
    const [useStreamingRank, setUseStreamingRank] = useState(true);
    const [selectedRatings, setSelectedRatings] = useState(MPAA_RATING_OPTIONS);
    const [includeUnknownRatings, setIncludeUnknownRatings] = useState(true);
    const [selectedGenres, setSelectedGenres] = useState(null);
    const [includeUnknownGenres, setIncludeUnknownGenres] = useState(true);
    const [runtimeMinMinutes, setRuntimeMinMinutes] = useState(RUNTIME_FILTER_MIN_MINUTES);
    const [runtimeMaxMinutes, setRuntimeMaxMinutes] = useState(RUNTIME_FILTER_MAX_MINUTES);
    const [includeUnknownRuntime, setIncludeUnknownRuntime] = useState(true);
    const [showDrawFilters, setShowDrawFilters] = useState(false);
    const [showRatingFilters, setShowRatingFilters] = useState(false);
    const [showGenreFilters, setShowGenreFilters] = useState(false);
    const [showRuntimeFilters, setShowRuntimeFilters] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [bowlName, setBowlName] = useState("My Bowl");
    const [currentUserId, setCurrentUserId] = useState(null);
    const [memberIds, setMemberIds] = useState([]);
    const [maxContributionLead, setMaxContributionLead] = useState(null);
    const [addGuardMessage, setAddGuardMessage] = useState(null);
    const [deleteErrorMessage, setDeleteErrorMessage] = useState(null);
    const [readdErrorMessage, setReaddErrorMessage] = useState(null);
    const [pendingReaddMovie, setPendingReaddMovie] = useState(null);
    const [isReadding, setIsReadding] = useState(false);
    const [didApplyDefaultDrawSettings, setDidApplyDefaultDrawSettings] = useState(false);
    const {
      streamingServices: userStreamingServices,
      defaultDrawSettings,
      loading: isLoadingUserPreferences,
    } = useUserStreamingServices();

    const navigate = useNavigate();
    
    const contributionArray = Object.entries(contributions || {}).map(
      ([member, totalAdded]) => ({
        member,
        totalAdded,
      })
    );

    const addBalance = useMemo(() => {
      if (maxContributionLead === null) return null;
      return checkContributionBalance({
        movies: [...(bowl.remaining || []), ...(bowl.watched || [])],
        memberIds,
        userId: currentUserId,
        maxLead: maxContributionLead,
      });
    }, [bowl.remaining, bowl.watched, memberIds, currentUserId, maxContributionLead]);

    const isAddBlockedByContributionLimit = Boolean(maxContributionLead !== null && addBalance && !addBalance.allowed);
    const isAddBlockedByUndrawnLimit = (bowl.remaining || []).length >= MAX_UNDRAWN_MOVIES_PER_BOWL;
    const isAddBlocked = isAddBlockedByContributionLimit || isAddBlockedByUndrawnLimit;
    const myRemainingAdds = useMemo(
      () => (bowl.remaining || []).filter((movie) => movie.added_by === currentUserId),
      [bowl.remaining, currentUserId]
    );
    const availableDrawGenres = useMemo(() => {
      const genreSet = new Set();
      (bowl.remaining || []).forEach((movie) => {
        if (!Array.isArray(movie?.genres)) return;
        movie.genres.forEach((genre) => {
          const value =
            typeof genre === "string"
              ? genre.trim()
              : genre?.name
                ? String(genre.name).trim()
                : "";
          if (value) genreSet.add(value);
        });
      });
      return Array.from(genreSet).sort((a, b) => a.localeCompare(b));
    }, [bowl.remaining]);
    const selectedDrawGenres = useMemo(() => {
      if (!Array.isArray(selectedGenres)) return availableDrawGenres;
      const available = new Set(availableDrawGenres);
      return selectedGenres.filter((genre) => available.has(genre));
    }, [selectedGenres, availableDrawGenres]);
    const ratingSummary = useMemo(() => {
      const selectedCount = selectedRatings.length;
      if (selectedCount === MPAA_RATING_OPTIONS.length && includeUnknownRatings) return "All ratings";
      if (selectedCount === 0 && !includeUnknownRatings) return "No ratings selected";
      const parts = [];
      if (selectedCount === MPAA_RATING_OPTIONS.length) {
        parts.push("All rated");
      } else if (selectedCount > 0) {
        parts.push(selectedRatings.join(", "));
      }
      if (includeUnknownRatings) parts.push("Unknown");
      return parts.join(" • ");
    }, [selectedRatings, includeUnknownRatings]);
    const genreSummary = useMemo(() => {
      const activeGenres = Array.isArray(selectedGenres) ? selectedDrawGenres : availableDrawGenres;
      if (activeGenres.length === 0 && !includeUnknownGenres) return "No genres selected";
      if (!Array.isArray(selectedGenres) && includeUnknownGenres) return "All genres";
      const parts = [];
      if (!Array.isArray(selectedGenres)) {
        parts.push("All listed genres");
      } else if (activeGenres.length <= 3) {
        parts.push(activeGenres.join(", "));
      } else {
        parts.push(`${activeGenres.length} genres`);
      }
      if (includeUnknownGenres) parts.push("Unknown");
      return parts.filter(Boolean).join(" • ");
    }, [selectedGenres, selectedDrawGenres, availableDrawGenres, includeUnknownGenres]);
    const runtimeSummary = useMemo(() => {
      const base = `${runtimeMinMinutes}-${runtimeMaxMinutes} min`;
      return includeUnknownRuntime ? `${base} • Unknown` : base;
    }, [runtimeMinMinutes, runtimeMaxMinutes, includeUnknownRuntime]);

    useEffect(() => {
      if (didApplyDefaultDrawSettings || isLoadingUserPreferences) return;

      const defaults = defaultDrawSettings || DEFAULT_DRAW_SETTINGS;
      setPrioritizeStreaming(Boolean(defaults.prioritizeStreaming));
      setUseStreamingRank(Boolean(defaults.useStreamingRank));
      setSelectedRatings(defaults.selectedRatings || MPAA_RATING_OPTIONS);
      setIncludeUnknownRatings(Boolean(defaults.includeUnknownRatings));
      setSelectedGenres(defaults.selectedGenres ?? null);
      setIncludeUnknownGenres(Boolean(defaults.includeUnknownGenres));
      setRuntimeMinMinutes(defaults.runtimeMinMinutes || DEFAULT_DRAW_SETTINGS.runtimeMinMinutes);
      setRuntimeMaxMinutes(defaults.runtimeMaxMinutes || DEFAULT_DRAW_SETTINGS.runtimeMaxMinutes);
      setIncludeUnknownRuntime(Boolean(defaults.includeUnknownRuntime));
      setDidApplyDefaultDrawSettings(true);
    }, [defaultDrawSettings, didApplyDefaultDrawSettings, isLoadingUserPreferences]);

    useEffect(() => {
      let cancelled = false;

      const loadBowlName = async () => {
        if (!bowlId) return;

        const { data: authData, error: authError } = await supabase.auth.getSession();
        const userId = authData?.session?.user?.id;
        if (authError || !userId) {
          if (!cancelled) navigate("/", { replace: true });
          return;
        }
        if (!cancelled) setCurrentUserId(userId);

        const { data, error } = await supabase
          .from("bowls")
          .select("name, owner_id, max_contribution_lead")
          .eq("id", bowlId)
          .single();

        if (error || !data || cancelled) {
          if (!cancelled) navigate("/", { replace: true });
          return;
        }

        const isOwner = data.owner_id === userId;
        if (!isOwner) {
          const { data: memberRow, error: memberError } = await supabase
            .from("bowl_members")
            .select("user_id")
            .eq("bowl_id", bowlId)
            .eq("user_id", userId)
            .maybeSingle();

          if (memberError || !memberRow) {
            if (!cancelled) navigate("/", { replace: true });
            return;
          }
        }

        const { data: memberRows, error: membersError } = await supabase
          .from("bowl_members")
          .select("user_id")
          .eq("bowl_id", bowlId);

        if (membersError) {
          if (!cancelled) {
            setMemberIds([]);
          }
        } else if (!cancelled) {
          setMemberIds((memberRows || []).map((row) => row.user_id).filter(Boolean));
        }

        setBowlName(data?.name || "My Bowl");
        const loadedLead = Number(data?.max_contribution_lead);
        setMaxContributionLead(
          Number.isInteger(loadedLead) && loadedLead >= 1
            ? loadedLead
            : null
        );
      };

      loadBowlName();

      return () => {
        cancelled = true;
      };
    }, [bowlId, navigate]);

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
        console.error("[BowlDashboard] Failed to load TMDB detail enrichment", detailsResult.reason);
      }
      if (providersResult.status === "rejected") {
        console.error("[BowlDashboard] Failed to load streaming provider enrichment", providersResult.reason);
      }

      const details = detailsResult.status === "fulfilled" ? detailsResult.value : null;
      const providerData =
        providersResult.status === "fulfilled"
          ? providersResult.value
          : { providers: [], region: "US", fetchedAt: null };

      return {
        ...(details || {}),
        ...movie,
        streamingProviders: providerData.providers || [],
        streamingRegion: providerData.region || "US",
        streamingFetchedAt: providerData.fetchedAt || null,
      };
    };

return (
    <div className="bowl-dashboard page-container pb-10 pt-3 overflow-hidden">
        <header className="mb-4 flex items-center justify-between min-w-0">
                <button onClick={() => navigate("/")} className="btn btn-ghost px-3 py-2">Back</button>
                <h2 className="truncate max-w-[60%] text-2xl font-semibold text-slate-800 text-center">{bowlName}</h2>
                <button onClick={() => navigate(`/bowl/${bowlId}/settings`)} className="icon-btn" aria-label="Bowl settings">⚙️</button>
            </header>

            {isLoading && (
              <div className="text-sm text-gray-600 mb-2">Loading bowl…</div>
            )}
            {!isLoading && errorMessage && (
              <div className="text-sm text-red-600 mb-2">{errorMessage}</div>
            )}

            <section className="panel my-4">
              <div className="mx-auto max-w-5xl">
                <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center md:flex-row md:justify-center md:gap-4">
                  <DrawButton
                    onClick={async () => {
                      if (isDrawing) return;
                      setIsDrawing(true);

                      try {
                        const minAnimationDelay = new Promise((resolve) => setTimeout(resolve, 1200));
                        const drawPromise = handleDraw({
                          prioritizeByServices: prioritizeStreaming,
                          prioritizeByServiceRank: useStreamingRank,
                          userStreamingServices,
                          ratingFilter: {
                            allowedRatings: selectedRatings,
                            includeUnknown: includeUnknownRatings,
                          },
                          genreFilter: {
                            allowedGenres: selectedDrawGenres,
                            includeUnknown: includeUnknownGenres,
                          },
                          runtimeFilter: {
                            minMinutes: runtimeMinMinutes,
                            maxMinutes: runtimeMaxMinutes,
                            includeUnknown: includeUnknownRuntime,
                          },
                        });

                        const [movie] = await Promise.all([drawPromise, minAnimationDelay]);
                        if (movie) {
                          const detailMovie = await buildDetailMovie(movie);
                          setDrawnMovie(detailMovie);
                        }
                      } finally {
                        setIsDrawing(false);
                      }
                    }}
                    isLoading={isDrawing}
                    disabled={bowl.remaining.length === 0}
                  />
                  <AddMovieButton
                    disabled={isAddBlocked}
                    onClick={() => {
                      setAddGuardMessage(null);
                      setShowSearch(true);
                    }}
                  />
                </div>

                <div className="mt-4">
                  <BowlIllustration className="mx-auto h-44 md:h-48 w-full max-w-2xl drop-shadow-md" />
                </div>

                <div className="mt-3 text-center">
                  <RemainingCount count={bowl.remaining.length} />
                </div>

                <div className="mt-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowDrawFilters((prev) => !prev)}
                    className={`icon-btn h-10 w-10 ${showDrawFilters ? "border-blue-300 text-blue-700" : ""}`}
                    aria-label={showDrawFilters ? "Hide filters" : "Filters"}
                    title={showDrawFilters ? "Hide filters" : "Filters"}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M4 6h16" />
                      <path d="M7 12h10" />
                      <path d="M10 18h4" />
                    </svg>
                    <span className="sr-only">{showDrawFilters ? "Hide filters" : "Filters"}</span>
                  </button>
                </div>
                {showDrawFilters && (
                  <div className="mt-3 mx-auto max-w-xl rounded-xl border border-slate-200/70 bg-slate-50/55 px-3.5 py-3 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-left">
                          <p className="text-sm font-medium text-gray-800">Streaming Match Preferences</p>
                          <p className="text-xs text-gray-500">
                            Favor titles available on your selected services.
                          </p>
                        </div>
                        <label htmlFor="prioritize-streaming-draw" className="relative inline-flex items-center cursor-pointer">
                          <input
                            id="prioritize-streaming-draw"
                            name="prioritize_streaming_draw"
                            aria-label="Prioritize streaming services"
                            type="checkbox"
                            className="peer sr-only"
                            checked={prioritizeStreaming}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setPrioritizeStreaming(checked);
                              if (checked) setUseStreamingRank(true);
                            }}
                            disabled={userStreamingServices.length === 0}
                          />
                          <span className="h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-blue-600 peer-disabled:bg-gray-200" />
                          <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                        </label>
                      </div>
                      {prioritizeStreaming && userStreamingServices.length > 0 && (
                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200/70 pt-2.5">
                          <div className="text-left">
                            <p className="text-sm font-medium text-gray-800">Use my service ranking</p>
                            <p className="text-xs text-gray-500">If off, draw randomly from any matching service.</p>
                          </div>
                          <label htmlFor="use-streaming-rank-draw" className="relative inline-flex items-center cursor-pointer">
                            <input
                              id="use-streaming-rank-draw"
                              name="use_streaming_rank_draw"
                              aria-label="Use streaming service ranking"
                              type="checkbox"
                              className="peer sr-only"
                              checked={useStreamingRank}
                              onChange={(e) => setUseStreamingRank(e.target.checked)}
                            />
                            <span className="h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-blue-600" />
                            <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                          </label>
                        </div>
                      )}
                      <div className="mt-2 text-left">
                        <button
                          type="button"
                          className="text-xs font-medium text-blue-700 hover:text-blue-800"
                          onClick={() => navigate("/settings#streaming-services")}
                        >
                          {userStreamingServices.length > 0 ? "Edit streaming service ranking" : "Choose streaming services"}
                        </button>
                      </div>
                      <div className="mt-3 border-t border-slate-200/70 pt-2.5 text-left">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200/70 bg-white/70 px-3 py-2 text-left"
                          onClick={() => setShowRatingFilters((prev) => !prev)}
                          aria-expanded={showRatingFilters}
                          aria-controls="draw-rating-filter-panel"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-800">Rating filter</p>
                            <p className="mt-0.5 text-xs text-gray-500">{ratingSummary}</p>
                          </div>
                          <span className="text-xs font-medium text-blue-700">
                            {showRatingFilters ? "Hide ratings" : "Edit ratings"}
                          </span>
                        </button>
                        {showRatingFilters && (
                          <div id="draw-rating-filter-panel" className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                            {MPAA_RATING_OPTIONS.map((rating) => {
                              const key = `draw-rating-${rating.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                              return (
                                <label key={rating} htmlFor={key} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                                  <input
                                    id={key}
                                    name="draw_ratings"
                                    aria-label={key}
                                    type="checkbox"
                                    checked={selectedRatings.includes(rating)}
                                    onChange={(event) => {
                                      setSelectedRatings((prev) => {
                                        if (event.target.checked) {
                                          return prev.includes(rating) ? prev : [...prev, rating];
                                        }
                                        return prev.filter((value) => value !== rating);
                                      });
                                    }}
                                  />
                                  {rating}
                                </label>
                              );
                            })}
                            <label
                              htmlFor="draw-rating-unknown"
                              className="inline-flex items-center gap-1.5 text-sm text-slate-700"
                            >
                              <input
                                id="draw-rating-unknown"
                                name="draw_rating_unknown"
                                aria-label="draw-rating-unknown"
                                type="checkbox"
                                checked={includeUnknownRatings}
                                onChange={(event) => setIncludeUnknownRatings(event.target.checked)}
                              />
                              Unrated/Unknown
                            </label>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 border-t border-slate-200/70 pt-2.5 text-left">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200/70 bg-white/70 px-3 py-2 text-left"
                          onClick={() => setShowGenreFilters((prev) => !prev)}
                          aria-expanded={showGenreFilters}
                          aria-controls="draw-genre-filter-panel"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-800">Genre filter</p>
                            <p className="mt-0.5 text-xs text-gray-500">{genreSummary}</p>
                          </div>
                          <span className="text-xs font-medium text-blue-700">
                            {showGenreFilters ? "Hide genres" : "Edit genres"}
                          </span>
                        </button>
                        {showGenreFilters && (
                          <div id="draw-genre-filter-panel" className="mt-2">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <p className="text-xs text-gray-500">Only draw from selected genres.</p>
                              <button
                                type="button"
                                className="text-xs font-medium text-blue-700 hover:text-blue-800"
                                onClick={() => setSelectedGenres(null)}
                              >
                                Select all
                              </button>
                            </div>
                            {availableDrawGenres.length > 0 ? (
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                {availableDrawGenres.map((genre) => {
                                  const key = `draw-genre-${genre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                                  return (
                                    <label key={genre} htmlFor={key} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                                      <input
                                        id={key}
                                        name="draw_genres"
                                        aria-label={key}
                                        type="checkbox"
                                        checked={selectedDrawGenres.includes(genre)}
                                        onChange={(event) => {
                                          setSelectedGenres((prev) => {
                                            const base = Array.isArray(prev) ? prev : availableDrawGenres;
                                            if (event.target.checked) {
                                              return base.includes(genre) ? base : [...base, genre];
                                            }
                                            return base.filter((value) => value !== genre);
                                          });
                                        }}
                                      />
                                      {genre}
                                    </label>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500">No genre data available for current bowl movies.</p>
                            )}
                            <label
                              htmlFor="draw-genre-unknown"
                              className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-700"
                            >
                              <input
                                id="draw-genre-unknown"
                                name="draw_genre_unknown"
                                aria-label="draw-genre-unknown"
                                type="checkbox"
                                checked={includeUnknownGenres}
                                onChange={(event) => setIncludeUnknownGenres(event.target.checked)}
                              />
                              Include uncategorized/unknown genres
                            </label>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 border-t border-slate-200/70 pt-2.5 text-left">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200/70 bg-white/70 px-3 py-2 text-left"
                          onClick={() => setShowRuntimeFilters((prev) => !prev)}
                          aria-expanded={showRuntimeFilters}
                          aria-controls="draw-runtime-filter-panel"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-800">Runtime filter</p>
                            <p className="mt-0.5 text-xs text-gray-500">{runtimeSummary}</p>
                          </div>
                          <span className="text-xs font-medium text-blue-700">
                            {showRuntimeFilters ? "Hide runtime" : "Edit runtime"}
                          </span>
                        </button>
                        {showRuntimeFilters && (
                          <div id="draw-runtime-filter-panel" className="mt-2 rounded-lg border border-slate-200/80 bg-white/70 p-3">
                            <p className="text-xs text-gray-500">
                              Set the acceptable runtime range for this draw.
                            </p>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <label htmlFor="draw-runtime-min" className="text-sm text-slate-700">
                                Minimum minutes
                                <input
                                  id="draw-runtime-min"
                                  name="draw_runtime_min"
                                  aria-label="draw-runtime-min"
                                  type="number"
                                  min={RUNTIME_FILTER_MIN_MINUTES}
                                  max={runtimeMaxMinutes}
                                  value={runtimeMinMinutes}
                                  onChange={(event) => {
                                    const value = Number.parseInt(event.target.value || "0", 10);
                                    if (!Number.isFinite(value)) return;
                                    setRuntimeMinMinutes(Math.max(RUNTIME_FILTER_MIN_MINUTES, Math.min(runtimeMaxMinutes, value)));
                                  }}
                                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                />
                              </label>
                              <label htmlFor="draw-runtime-max" className="text-sm text-slate-700">
                                Maximum minutes
                                <input
                                  id="draw-runtime-max"
                                  name="draw_runtime_max"
                                  aria-label="draw-runtime-max"
                                  type="number"
                                  min={runtimeMinMinutes}
                                  max={RUNTIME_FILTER_MAX_MINUTES}
                                  value={runtimeMaxMinutes}
                                  onChange={(event) => {
                                    const value = Number.parseInt(event.target.value || "0", 10);
                                    if (!Number.isFinite(value)) return;
                                    setRuntimeMaxMinutes(Math.max(runtimeMinMinutes, Math.min(RUNTIME_FILTER_MAX_MINUTES, value)));
                                  }}
                                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                                />
                              </label>
                            </div>
                            <div className="mt-3 space-y-3">
                              <label htmlFor="draw-runtime-min-slider" className="block text-xs text-slate-500">
                                Minimum runtime
                                <input
                                  id="draw-runtime-min-slider"
                                  name="draw_runtime_min_slider"
                                  aria-label="draw-runtime-min-slider"
                                  type="range"
                                  min={RUNTIME_FILTER_MIN_MINUTES}
                                  max={runtimeMaxMinutes}
                                  value={runtimeMinMinutes}
                                  onChange={(event) =>
                                    setRuntimeMinMinutes(
                                      Math.max(
                                        RUNTIME_FILTER_MIN_MINUTES,
                                        Math.min(runtimeMaxMinutes, Number.parseInt(event.target.value || "0", 10) || RUNTIME_FILTER_MIN_MINUTES)
                                      )
                                    )
                                  }
                                  className="mt-1 w-full"
                                />
                              </label>
                              <label htmlFor="draw-runtime-max-slider" className="block text-xs text-slate-500">
                                Maximum runtime
                                <input
                                  id="draw-runtime-max-slider"
                                  name="draw_runtime_max_slider"
                                  aria-label="draw-runtime-max-slider"
                                  type="range"
                                  min={runtimeMinMinutes}
                                  max={RUNTIME_FILTER_MAX_MINUTES}
                                  value={runtimeMaxMinutes}
                                  onChange={(event) =>
                                    setRuntimeMaxMinutes(
                                      Math.max(
                                        runtimeMinMinutes,
                                        Math.min(RUNTIME_FILTER_MAX_MINUTES, Number.parseInt(event.target.value || "0", 10) || RUNTIME_FILTER_MAX_MINUTES)
                                      )
                                    )
                                  }
                                  className="mt-1 w-full"
                                />
                              </label>
                            </div>
                            <label
                              htmlFor="draw-runtime-unknown"
                              className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-700"
                            >
                              <input
                                id="draw-runtime-unknown"
                                name="draw_runtime_unknown"
                                type="checkbox"
                                checked={includeUnknownRuntime}
                                onChange={(event) => setIncludeUnknownRuntime(event.target.checked)}
                              />
                              Include unknown runtime
                            </label>
                          </div>
                        )}
                      </div>
                  </div>
                )}
                {userStreamingServices.length === 0 && (
                  <p className="mt-2 text-center text-xs text-slate-500">
                    Add services in Settings to enable prioritized draw.
                  </p>
                )}
                {maxContributionLead !== null && (
                  <p className="mt-2 text-center text-xs text-slate-500">
                    Contribution lead limit: {maxContributionLead}
                  </p>
                )}
                {addGuardMessage && (
                  <p className="mt-2 text-center text-sm text-amber-700">{addGuardMessage}</p>
                )}
                {isAddBlockedByContributionLimit && (
                  <p className="mt-2 text-center text-sm text-amber-700">
                    You are at {addBalance.myCount} contributions and the lowest active member is at {addBalance.minCount}.
                  </p>
                )}
                {isAddBlockedByUndrawnLimit && (
                  <p className="mt-2 text-center text-sm text-amber-700">
                    Bowl is at the undrawn movie limit ({MAX_UNDRAWN_MOVIES_PER_BOWL}).
                  </p>
                )}
              </div>
            </section>

            
            <section className="panel w-full max-w-full min-w-0 overflow-x-auto">
                <WatchedMoviesStrip
                  movies={bowl.watched}
                  onSelectMovie={async (movie) => {
                    setSelectedDetailContext("watched");
                    setSelectedDetailMovie(await buildDetailMovie(movie));
                  }}
                />
                {readdErrorMessage && (
                  <p className="mt-2 text-sm text-amber-700">{readdErrorMessage}</p>
                )}
            </section>

            <section className="panel mt-4 w-full max-w-full min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div className="text-left">
                  <h3 className="section-title text-base">My Added Movies</h3>
                  <p className="text-xs text-slate-500">View and manage only movies you added.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMyAdds((prev) => !prev)}
                  className="btn btn-secondary px-3 py-2 text-sm"
                >
                  {showMyAdds ? "Hide" : "Show"}
                </button>
              </div>

              {showMyAdds && (
                <div className="mt-3">
                  {myRemainingAdds.length === 0 ? (
                    <p className="text-sm text-slate-500">You have no undrawn movies in this bowl.</p>
                  ) : (
                    <MyAddedMoviesStrip
                      movies={myRemainingAdds}
                      onViewMovie={async (movie) => {
                        setSelectedDetailContext("myAdds");
                        setSelectedDetailMovie(await buildDetailMovie(movie));
                      }}
                      onDeleteMovie={async (movie) => {
                        const shouldDelete = window.confirm(
                          `Delete "${movie.title}" from this bowl?`
                        );
                        if (!shouldDelete) return;
                        setDeleteErrorMessage(null);
                        const deleted = await handleDeleteMovie(movie.id);
                        if (!deleted) {
                          setDeleteErrorMessage("Could not delete this movie. Please try again.");
                        }
                      }}
                    />
                  )}
                </div>
              )}
              {deleteErrorMessage && <p className="mt-2 text-sm text-red-600">{deleteErrorMessage}</p>}
            </section>
            

            <div className="my-5 text-center">
              {showSearch && (
                <AddMovieModal
                  userStreamingServices={userStreamingServices}
                  onClose={() => setShowSearch(false)}
                  onAddMovie={async (movie) => {
                    if (maxContributionLead !== null) {
                      const balance = checkContributionBalance({
                        movies: [...(bowl.remaining || []), ...(bowl.watched || [])],
                        memberIds,
                        userId: currentUserId,
                        maxLead: maxContributionLead,
                      });

                      if (!balance.allowed) {
                        setAddGuardMessage(
                          `You are at ${balance.myCount} contributions and the lowest active member is at ${balance.minCount}.`
                        );
                        return;
                      }
                    }
                    if ((bowl.remaining || []).length >= MAX_UNDRAWN_MOVIES_PER_BOWL) {
                      setAddGuardMessage(
                        `Bowl is at the undrawn movie limit (${MAX_UNDRAWN_MOVIES_PER_BOWL}).`
                      );
                      return;
                    }

                    await handleAddMovie(movie);
                    setShowSearch(false);
                  }}
                />
              )}
            </div>

            <ContributionStats
                stats={contributionArray}
            />
            {drawnMovie && (
              <AddMovieModal
                movie={drawnMovie}
                userStreamingServices={userStreamingServices}
                onClose={() => setDrawnMovie(null)}
              />
            )}
            {selectedDetailMovie && (
              <AddMovieModal
                movie={selectedDetailMovie}
                userStreamingServices={userStreamingServices}
                detailPrimaryActionLabel={selectedDetailContext === "watched" ? "Move to Bowl" : null}
                onDetailPrimaryAction={
                  selectedDetailContext === "watched"
                    ? async (movie) => {
                        setReaddErrorMessage(null);
                        setSelectedDetailMovie(null);
                        setSelectedDetailContext(null);
                        setPendingReaddMovie(movie);
                      }
                    : null
                }
                onClose={() => {
                  setSelectedDetailMovie(null);
                  setSelectedDetailContext(null);
                }}
              />
            )}
            {pendingReaddMovie && (
              <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 px-4">
                <div className="panel w-full max-w-md">
                  <h3 className="text-lg font-semibold text-slate-800">Re-add to Bowl?</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    "{pendingReaddMovie.title}" will be removed from the watched strip and placed back in your bowl.
                  </p>
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingReaddMovie(null)}
                      className="btn btn-secondary"
                      disabled={isReadding}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (isReadding) return;
                        if ((bowl.remaining || []).length >= MAX_UNDRAWN_MOVIES_PER_BOWL) {
                          setReaddErrorMessage(
                            `Bowl is at the undrawn movie limit (${MAX_UNDRAWN_MOVIES_PER_BOWL}).`
                          );
                          setPendingReaddMovie(null);
                          return;
                        }
                        setIsReadding(true);
                        const ok = await handleReaddMovie(pendingReaddMovie.id);
                        setIsReadding(false);
                        setPendingReaddMovie(null);
                        if (!ok) {
                          setReaddErrorMessage("Could not re-add this movie. Please try again.");
                        }
                      }}
                      className="btn btn-primary"
                      disabled={isReadding}
                    >
                      {isReadding ? "Re-adding..." : "Re-add"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {isDrawing && <DrawAnimationModal />}
        </div>
    );
}
