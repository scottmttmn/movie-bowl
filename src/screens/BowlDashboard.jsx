import { useState } from "react";
import DrawButton from "../components/DrawButton";
import RemainingCount from "../components/RemainingCount";
import WatchedMoviesStrip from "../components/WatchedMoviesStrip";
import AddMovieButton from "../components/AddMovieButton";
import ContributionStats from "../components/ContributionStats";
import useBowl from "../hooks/useBowl";
import useUserStreamingServices from "../hooks/useUserStreamingServices";
import AddMovieModal from "../components/AddMovieModal";
import { useNavigate, useParams } from "react-router-dom";


export default function BowlDashboard() {
    
    const { bowlId } = useParams();
    const { bowl, contributions, isLoading, errorMessage, handleDraw, handleAddMovie } = useBowl(bowlId);

    const [showSearch, setShowSearch] = useState(false);
    const [drawnMovie, setDrawnMovie] = useState(null);
    const [prioritizeStreaming, setPrioritizeStreaming] = useState(false);
    const { streamingServices: userStreamingServices } = useUserStreamingServices();

    const navigate = useNavigate();
    
    const contributionArray = Object.entries(contributions || {}).map(
      ([member, totalAdded]) => ({
        member,
        totalAdded,
      })
    );

return (
    <div className="bowl-dashboard p-4 w-screen max-w-screen overflow-hidden">
        <header className="flex justify-between items-center mb-4 min-w-0">
                <button onClick={() => navigate("/")}>Back</button>
                <h2 className="truncate max-w-[60%] text-center">My Bowl</h2>
                <button onClick={() => navigate(`/bowl/${bowlId}/settings`)}>⚙️</button>
            </header>

            {isLoading && (
              <div className="text-sm text-gray-600 mb-2">Loading bowl…</div>
            )}
            {!isLoading && errorMessage && (
              <div className="text-sm text-red-600 mb-2">{errorMessage}</div>
            )}

            <div className="text-center my-4">
                <DrawButton
                  onClick={async () => {
                    const movie = await handleDraw({
                      prioritizeByServices: prioritizeStreaming,
                      userStreamingServices,
                    });
                    if (movie) {
                      setDrawnMovie(movie);
                    }
                  }}
                  disabled={bowl.remaining.length === 0}
                />
                <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={prioritizeStreaming}
                    onChange={(e) => setPrioritizeStreaming(e.target.checked)}
                    disabled={userStreamingServices.length === 0}
                  />
                  Prioritize my streaming services
                </label>
                {userStreamingServices.length === 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    Add services in Settings to enable prioritized draw.
                  </p>
                )}
                <RemainingCount count={bowl.remaining.length} />
            </div>

            
            <div className="w-full max-w-full min-w-0 overflow-x-auto">
                <WatchedMoviesStrip movies={bowl.watched} />
            </div>
            

            <div className="my-4 text-center">
                <AddMovieButton onClick={() => setShowSearch(true)} />

                {showSearch && (
                  <AddMovieModal
                    userStreamingServices={userStreamingServices}
                    onClose={() => setShowSearch(false)}
                    onAddMovie={async (movie) => {
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
        </div>
    );
}
