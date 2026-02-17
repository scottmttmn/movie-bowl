import { useState, useEffect } from "react";
import DrawButton from "../components/DrawButton";
import RemainingCount from "../components/RemainingCount";
import WatchedMoviesStrip from "../components/WatchedMoviesStrip";
import AddMovieButton from "../components/AddMovieButton";
import ContributionStats from "../components/ContributionStats";
import useBowl from "../hooks/useBowl";
import MovieSearch from "../components/MovieSearch";


export default function BowlDashboard() {
    
    const { bowl, handleDraw, handleAddMovie} = useBowl();

    const [showSearch, setShowSearch] = useState(false);


    const contributionArray = Object.entries(bowl.contributions).map(([member, totalAdded]) => ({
        member,
        totalAdded,
    }));

    return (
        <div className="bowl-dashboard p-4">
            <header className="flex justify-between items-center mb-4">
                <button onClick={() => console.log("Go back")}>Back</button>
                <h2>My Bowl</h2>
                <button onClick={() => console.log("Settings")}>⚙️</button>
            </header>

            <div className="text-center my-4">
                <DrawButton onClick={handleDraw} disabled={bowl.remaining.length === 0} />
                <RemainingCount count={bowl.remaining.length} />
            </div>

            <div className="overflow-x-auto whitespace-nowrap py-2">
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
        </div>
    );
}