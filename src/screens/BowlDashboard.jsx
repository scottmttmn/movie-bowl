import { useState } from "react";
import DrawButton from "../components/DrawButton";
import RemainingCount from "../components/RemainingCount";
import WatchedMoviesStrip from "../components/WatchedMoviesStrip";
import AddMovieButton from "../components/AddMovieButton";
import ContributionStats from "../components/ContributionStats";

export default function BowlDashboard() {

  const TMDB_TOKEN = import.meta.env.VITE_TMDB_READ_TOKEN;
  //console.log("TMDB TOKEN:",TMDB_TOKEN)
  const initialMovies = [
    { id: 1, title: "Inception", poster: "https://via.placeholder.com/100",addedBy: "You" },
    { id: 2, title: "The Matrix", poster: "https://via.placeholder.com/100",addedBy:"Partner" },
    { id: 3, title: "Spirited Away", poster: "https://via.placeholder.com/100",addedBy:"You" },
  ];

  const [bowl, setBowl] = useState({
    remaining: initialMovies,
    watched: [],
    contributions: {
        You: 2,
        Partner: 1,
    }
  });

  const [searchTerm,setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch,setShowSearch] = useState(false);

  const handleDraw = () => {
    if (bowl.remaining.length === 0) return;

    // Pick a random movie from remaining
    const index = Math.floor(Math.random() * bowl.remaining.length);
    const drawn = bowl.remaining[index];

    // Update bowl after draw with drawn removed from bowl and moved to watched
    setBowl((prev) => ({
        ...prev,
      remaining: prev.remaining.filter((_, i) => i !== index),
      watched: [...prev.watched, drawn],
    }));
  };
  const handleSearch = async () => {
    if (!searchTerm) return;
    try {
        const response = await fetch(
            `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(searchTerm)}`,
            {
              headers: {
                Authorization: `Bearer ${TMDB_TOKEN}`,
              },
            }
          );
        const data = await response.json();
        setSearchResults(data.results || []);
    } catch (error){
        console.error("Failed to fetch movies",error)
    }
  };
  const handleAddMovie = (movie,addedBy = "You") => {
    // For now just add a mock movie
    const newMovie = {
      id: movie.id,
      title: movie.title,
      poster: movie.poster_path
      ? `https://image.tmdb.org/t/p/w200${movie.poster_path}`
      : "https://via.placeholder.com/100",
      addedBy
    };

    setBowl((prev) => ({
      ...prev,
      remaining: [...prev.remaining, newMovie],
      contributions: {
        ...prev.contributions,
        [addedBy]:(prev.contributions[addedBy] || 0) + 1,
      }
    }));
    setSearchResults([]);
    setSearchTerm("");
    setShowSearch(false);
  };
    // Convert contributions object to array for display
    const contributionArray = Object.entries(bowl.contributions).map(([member, totalAdded]) => ({
        member,
        totalAdded,
        last7Days: totalAdded, // placeholder
      }));

  return (
    <div className="bowl-dashboard p-4">
      <header className="flex justify-between items-center mb-4">
        <button onClick={() => console.log("Go back")}>Back</button>
        <h2>My Bowl</h2>
        <button onClick={() => console.log("Settings")}>⚙️</button>
      </header>

      {/* Draw Section */}
      <div className="text-center my-4">
        <DrawButton onClick={handleDraw} disabled={bowl.remaining.length === 0} />
        <RemainingCount count={bowl.remaining.length} />
      </div>

      {/* Watched Movies */}
      <WatchedMoviesStrip movies={bowl.watched} />

      {/* Add Movie */}
      <div className="my-4 text-center">
        <AddMovieButton onClick={() => setShowSearch(true)} />

        {showSearch && (
          <div className="mt-2">
            <input
              type="text"
              value={searchTerm}
              placeholder="Search movies..."
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button onClick={handleSearch} className="ml-2">
              Search
            </button>

            <ul className="mt-3 space-y-2">
  {searchResults.map((movie) => {
    const year = movie.release_date
      ? movie.release_date.split("-")[0]
      : "—";

    return (
      <li
        key={movie.id}
        className="flex items-center justify-between p-2 border rounded"
      >
        <div className="flex items-center gap-3">
          <img
            src={
              movie.poster_path
                ? `https://image.tmdb.org/t/p/w92${movie.poster_path}`
                : "https://via.placeholder.com/60"
            }
            alt={movie.title}
            className="w-12 h-16 object-cover rounded"
          />

          <div className="text-left">
            <div className="font-semibold">
              {movie.title}
            </div>
            <div className="text-sm text-gray-500">
              {year}
            </div>
          </div>
        </div>

        <button
          className="px-2 py-1 bg-blue-500 text-white rounded"
          onClick={() => handleAddMovie(movie)}
        >
          Add
        </button>
      </li>
    );
  })}
</ul>
          </div>
        )}
      </div>

      {/* Dynamic Contribution Stats*/}
      <ContributionStats
        stats={contributionArray}
      />
    </div>
  );
}