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
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { checkContributionBalance } from "../utils/contributionBalance";
import { MAX_UNDRAWN_MOVIES_PER_BOWL } from "../utils/appLimits";
import { MPAA_RATING_OPTIONS } from "../utils/movieRatings";


export default function BowlDashboard() {
    
    const { bowlId } = useParams();
    const { bowl, contributions, isLoading, errorMessage, handleDraw, handleAddMovie, handleDeleteMovie } = useBowl(bowlId);

    const [showSearch, setShowSearch] = useState(false);
    const [drawnMovie, setDrawnMovie] = useState(null);
    const [selectedDetailMovie, setSelectedDetailMovie] = useState(null);
    const [showMyAdds, setShowMyAdds] = useState(false);
    const [prioritizeStreaming, setPrioritizeStreaming] = useState(false);
    const [useStreamingRank, setUseStreamingRank] = useState(true);
    const [selectedRatings, setSelectedRatings] = useState(MPAA_RATING_OPTIONS);
    const [includeUnknownRatings, setIncludeUnknownRatings] = useState(true);
    const [maxRuntimeMinutes, setMaxRuntimeMinutes] = useState(500);
    const [includeUnknownRuntime, setIncludeUnknownRuntime] = useState(true);
    const [showAdvancedRuntime, setShowAdvancedRuntime] = useState(false);
    const [showDrawFilters, setShowDrawFilters] = useState(false);
    const [preferLongMovies, setPreferLongMovies] = useState(false);
    const [longMovieMinMinutes, setLongMovieMinMinutes] = useState(150);
    const [isDrawing, setIsDrawing] = useState(false);
    const [bowlName, setBowlName] = useState("My Bowl");
    const [currentUserId, setCurrentUserId] = useState(null);
    const [memberIds, setMemberIds] = useState([]);
    const [maxContributionLead, setMaxContributionLead] = useState(null);
    const [addGuardMessage, setAddGuardMessage] = useState(null);
    const [deleteErrorMessage, setDeleteErrorMessage] = useState(null);
    const { streamingServices: userStreamingServices } = useUserStreamingServices();

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
                          runtimeFilter: {
                            mode: preferLongMovies ? "min" : "max",
                            threshold: preferLongMovies ? longMovieMinMinutes : maxRuntimeMinutes,
                            includeUnknown: includeUnknownRuntime,
                          },
                        });

                        const [movie] = await Promise.all([drawPromise, minAnimationDelay]);
                        if (movie) {
                          setDrawnMovie(movie);
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
                      <div className="mt-3 border-t border-slate-200/70 pt-2.5 text-left">
                        <p className="text-sm font-medium text-gray-800">Rating filter</p>
                        <p className="mb-1.5 text-xs text-gray-500">Only draw from selected ratings.</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {MPAA_RATING_OPTIONS.map((rating) => {
                            const key = `draw-rating-${rating.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                            return (
                              <label key={rating} htmlFor={key} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                                <input
                                  id={key}
                                  name="draw_ratings"
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
                              type="checkbox"
                              checked={includeUnknownRatings}
                              onChange={(event) => setIncludeUnknownRatings(event.target.checked)}
                            />
                            Unrated/Unknown
                          </label>
                        </div>
                      </div>
                      <div className="mt-3 border-t border-slate-200/70 pt-2.5 text-left">
                        <p className="text-sm font-medium text-gray-800">Runtime filter</p>
                        <p className="mb-1.5 text-xs text-gray-500">
                          Set a maximum runtime for typical draws.
                        </p>
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor="draw-runtime-max"
                            className="text-sm text-slate-700"
                          >
                            Max minutes
                          </label>
                          <input
                            id="draw-runtime-max"
                            name="draw_runtime_max"
                            type="number"
                            min={60}
                            max={600}
                            value={maxRuntimeMinutes}
                            onChange={(event) => {
                              const value = Number.parseInt(event.target.value || "0", 10);
                              setMaxRuntimeMinutes(Number.isFinite(value) ? Math.max(60, Math.min(600, value)) : 500);
                            }}
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                            disabled={preferLongMovies}
                          />
                        </div>
                        <label
                          htmlFor="draw-runtime-unknown"
                          className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-700"
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
                        <div className="mt-1.5">
                          <button
                            type="button"
                            onClick={() => setShowAdvancedRuntime((prev) => !prev)}
                            className="text-xs font-medium text-blue-700 hover:text-blue-800"
                          >
                            {showAdvancedRuntime ? "Hide advanced runtime options" : "Advanced runtime options"}
                          </button>
                        </div>
                        {showAdvancedRuntime && (
                          <div className="mt-2 rounded-lg border border-slate-200/80 bg-white/70 p-2">
                            <label
                              htmlFor="draw-runtime-long-mode"
                              className="inline-flex items-center gap-1.5 text-sm text-slate-700"
                            >
                              <input
                                id="draw-runtime-long-mode"
                                name="draw_runtime_long_mode"
                                type="checkbox"
                                checked={preferLongMovies}
                                onChange={(event) => setPreferLongMovies(event.target.checked)}
                              />
                              Prefer long movies
                            </label>
                            {preferLongMovies && (
                              <div className="mt-2 flex items-center gap-2">
                                <label htmlFor="draw-runtime-min" className="text-sm text-slate-700">
                                  Min minutes
                                </label>
                                <input
                                  id="draw-runtime-min"
                                  name="draw_runtime_min"
                                  type="number"
                                  min={60}
                                  max={600}
                                  value={longMovieMinMinutes}
                                  onChange={(event) => {
                                    const value = Number.parseInt(event.target.value || "0", 10);
                                    setLongMovieMinMinutes(
                                      Number.isFinite(value) ? Math.max(60, Math.min(600, value)) : 150
                                    );
                                  }}
                                  className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                                />
                              </div>
                            )}
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
                    const providerData =
                      Number(movie.tmdb_id) > 0
                        ? await fetchStreamingProviders(movie.tmdb_id, { region: "US" })
                        : { providers: [], region: "US", fetchedAt: null };
                    setSelectedDetailMovie({
                      ...movie,
                      streamingProviders: providerData.providers || [],
                      streamingRegion: providerData.region || "US",
                      streamingFetchedAt: providerData.fetchedAt || null,
                    });
                  }}
                />
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
                        const providerData =
                          Number(movie.tmdb_id) > 0
                            ? await fetchStreamingProviders(movie.tmdb_id, { region: "US" })
                            : { providers: [], region: "US", fetchedAt: null };
                        setSelectedDetailMovie({
                          ...movie,
                          streamingProviders: providerData.providers || [],
                          streamingRegion: providerData.region || "US",
                          streamingFetchedAt: providerData.fetchedAt || null,
                        });
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
                onClose={() => setSelectedDetailMovie(null)}
              />
            )}
            {isDrawing && <DrawAnimationModal />}
        </div>
    );
}
