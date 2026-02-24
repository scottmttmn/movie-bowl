import { useEffect, useMemo, useState } from "react";
import DrawButton from "../components/DrawButton";
import RemainingCount from "../components/RemainingCount";
import WatchedMoviesStrip from "../components/WatchedMoviesStrip";
import AddMovieButton from "../components/AddMovieButton";
import ContributionStats from "../components/ContributionStats";
import useBowl from "../hooks/useBowl";
import useUserStreamingServices from "../hooks/useUserStreamingServices";
import AddMovieModal from "../components/AddMovieModal";
import DrawAnimationModal from "../components/DrawAnimationModal";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { checkContributionBalance } from "../utils/contributionBalance";


export default function BowlDashboard() {
    
    const { bowlId } = useParams();
    const { bowl, contributions, isLoading, errorMessage, handleDraw, handleAddMovie } = useBowl(bowlId);

    const [showSearch, setShowSearch] = useState(false);
    const [drawnMovie, setDrawnMovie] = useState(null);
    const [selectedWatchedMovie, setSelectedWatchedMovie] = useState(null);
    const [prioritizeStreaming, setPrioritizeStreaming] = useState(false);
    const [useStreamingRank, setUseStreamingRank] = useState(true);
    const [isDrawing, setIsDrawing] = useState(false);
    const [bowlName, setBowlName] = useState("My Bowl");
    const [currentUserId, setCurrentUserId] = useState(null);
    const [memberIds, setMemberIds] = useState([]);
    const [maxContributionLead, setMaxContributionLead] = useState(null);
    const [addGuardMessage, setAddGuardMessage] = useState(null);
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

            <section className="panel text-center my-4">
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
                <div className="mt-3 mx-auto max-w-xl rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-800">Streaming Match Preferences</p>
                      <p className="text-xs text-gray-500">
                        Control whether draws favor titles available on your selected services.
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
                    <div className="mt-2 flex items-center justify-between gap-3 border-t border-gray-100 pt-2">
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
                </div>
                {userStreamingServices.length === 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    Add services in Settings to enable prioritized draw.
                  </p>
                )}
                <div className="mt-2">
                  <RemainingCount count={bowl.remaining.length} />
                </div>
            </section>

            
            <section className="panel w-full max-w-full min-w-0 overflow-x-auto">
                <WatchedMoviesStrip
                  movies={bowl.watched}
                  onSelectMovie={async (movie) => {
                    const providerData = await fetchStreamingProviders(movie.tmdb_id, { region: "US" });
                    setSelectedWatchedMovie({
                      ...movie,
                      streamingProviders: providerData.providers || [],
                      streamingRegion: providerData.region || "US",
                      streamingFetchedAt: providerData.fetchedAt || null,
                    });
                  }}
                />
            </section>
            

            <div className="my-5 text-center">
                <AddMovieButton
                  disabled={isAddBlockedByContributionLimit}
                  onClick={() => {
                    setAddGuardMessage(null);
                    setShowSearch(true);
                  }}
                />
                {maxContributionLead !== null && (
                  <p className="mt-2 text-xs text-slate-500">
                    Contribution lead limit: {maxContributionLead}
                  </p>
                )}
                {addGuardMessage && (
                  <p className="mt-2 text-sm text-amber-700">{addGuardMessage}</p>
                )}
                {isAddBlockedByContributionLimit && (
                  <p className="mt-2 text-sm text-amber-700">
                    You are at {addBalance.myCount} contributions and the lowest active member is at {addBalance.minCount}.
                  </p>
                )}

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
            {selectedWatchedMovie && (
              <AddMovieModal
                movie={selectedWatchedMovie}
                userStreamingServices={userStreamingServices}
                onClose={() => setSelectedWatchedMovie(null)}
              />
            )}
            {isDrawing && <DrawAnimationModal />}
        </div>
    );
}
