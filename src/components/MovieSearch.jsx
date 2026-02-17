// MovieSearch component handles querying TMDB and returning selectable results.
import { useState, useEffect } from "react";

// Read-only TMDB token stored in environment variables (Vite requires VITE_ prefix).
const TMDB_TOKEN = import.meta.env.VITE_TMDB_READ_TOKEN;


export default function MovieSearch({ onAddMovie, onClose }) {
    // Controlled input state for the search field
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState([]);

    // Fetch movies from TMDB based on a query string
    const handleSearch = async (query) => {
        if (!query) return;
        try {
            const response = await fetch(
                `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}`,
                {
                    headers: {
                        Authorization: `Bearer ${TMDB_TOKEN}`,
                    },
                }
            );
            const data = await response.json();
            setSearchResults(data.results || []);
        } catch (error) {
            console.error("Failed to fetch movies", error)
        }
    };

    // Debounce search: wait 400ms after user stops typing before calling API
    useEffect(() => {
        if (!searchTerm) {
            setSearchResults([]);
            return;
        }

        const timeoutId = setTimeout(() => {
            handleSearch(searchTerm);
        }, 400);

        return () => clearTimeout(timeoutId);
    }, [searchTerm]);

    // Render search UI and list of results
    return (
        <div className="mt-2">
            <input
                type="text"
                value={searchTerm}
                placeholder="Search movies..."
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        handleSearch(searchTerm);
                    }
                }}
            />
            <button onClick={() => handleSearch(searchTerm)} className="ml-2">
                Search
            </button>
            <button onClick={onClose} className="ml-2 text-red-600">
                Cancel
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
                                onClick={() => {
                                    onAddMovie(movie);
                                    setSearchTerm("");
                                    setSearchResults([]);
                                }}
                            >
                                Add
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}