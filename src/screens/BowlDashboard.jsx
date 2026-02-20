import { useState } from "react";
import DrawButton from "../components/DrawButton";
import RemainingCount from "../components/RemainingCount";
import WatchedMoviesStrip from "../components/WatchedMoviesStrip";
import AddMovieButton from "../components/AddMovieButton";
import ContributionStats from "../components/ContributionStats";
import useBowl from "../hooks/useBowl";
import MovieSearch from "../components/MovieSearch";
import { useNavigate } from "react-router-dom";
import AddMovieModal from "../components/AddMovieModal";


export default function BowlDashboard() {
    
    const { bowl, handleDraw, handleAddMovie} = useBowl();

    const [showSearch, setShowSearch] = useState(false);
    const [drawnMovie, setDrawnMovie] = useState(null);

    const navigate = useNavigate();
    
    const contributionArray = Object.entries(bowl.contributions).map(([member, totalAdded]) => ({
        member,
        totalAdded,
    }));

return (
    <div className="bowl-dashboard p-4 w-screen max-w-screen overflow-hidden">
        <header className="flex justify-between items-center mb-4 min-w-0">
                <button onClick={() => navigate("/")}>Back</button>
                <h2 className="truncate max-w-[60%] text-center">My Bowl</h2>
                <button onClick={() => console.log("Settings")}>⚙️</button>
            </header>

            <div className="text-center my-4">
                <DrawButton
                  onClick={() => {
                    const movie = handleDraw();
                    if (movie) {
                      setDrawnMovie(movie);
                    }
                  }}
                  disabled={bowl.remaining.length === 0}
                />
                <RemainingCount count={bowl.remaining.length} />
            </div>

            
            <div className="w-full max-w-full min-w-0 overflow-x-auto">
                <WatchedMoviesStrip movies={bowl.watched} />
            </div>
            

            <div className="my-4 text-center">
                <AddMovieButton onClick={() => setShowSearch(true)} />

                {showSearch && (
                    <MovieSearch
                        onAddMovie={(movie) => {
                            handleAddMovie(movie);
                            setShowSearch(false);
                        }}
                        onClose={() => setShowSearch(false)}
                    />
                )}
            </div>

            <ContributionStats
                stats={contributionArray}
            />
            {drawnMovie && (
              <AddMovieModal
                movie={drawnMovie}
                onClose={() => setDrawnMovie(null)}
              />
            )}
        </div>
    );
}