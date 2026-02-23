// MovieSearch component handles querying TMDB and returning selectable results.
import { useState, useEffect, useRef } from "react";
import {getPosterUrl} from "../utils/getPosterUrl"
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { matchUserServices } from "../utils/streamingServices";

// Read-only TMDB token stored in environment variables (Vite requires VITE_ prefix).
const TMDB_TOKEN = import.meta.env.VITE_TMDB_READ_TOKEN;

export default function MovieSearch({ onAddMovie, userStreamingServices = [] }) {
    // Controlled input state for the search field
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [providersByMovieId, setProvidersByMovieId] = useState({});
    const inputRef = useRef(null);
    const latestRequestRef = useRef(0);


    const handleSearch = async (query) => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) return;

        const requestId = latestRequestRef.current + 1;
        latestRequestRef.current = requestId;

        try {
            const response = await fetch(
                `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(trimmedQuery)}`,
                {
                    headers: {
                        Authorization: `Bearer ${TMDB_TOKEN}`,
                    },
                }
            );
            const data = await response.json();
            if (requestId !== latestRequestRef.current) return;

            const results = data.results || [];
            setSearchResults(results);
            setHighlightedIndex(0);

            const topResults = results.slice(0, 8);
            const providerEntries = await Promise.all(
              topResults.map(async (movie) => {
                const { providers } = await fetchStreamingProviders(movie.id, { region: "US" });
                return [movie.id, providers];
              })
            );

            if (requestId !== latestRequestRef.current) return;

            setProvidersByMovieId((prev) => {
              const next = { ...prev };
              providerEntries.forEach(([movieId, providers]) => {
                next[movieId] = providers;
              });
              return next;
            });
        } catch (error) {
            console.error("Failed to fetch movies", error);
        }
    };

    // Add movie with full details fetched inside
    const addMovie = async (movie) => {
        try {
            const response = await fetch(
                `https://api.themoviedb.org/3/movie/${movie.id}`,
                {
                    headers: {
                        Authorization: `Bearer ${TMDB_TOKEN}`,
                    },
                }
            );
            const details = await response.json();
            if (details) {
                onAddMovie({ ...movie, ...details });
            }
        } catch (error) {
            console.error("Failed to fetch movie details", error);
        }
        setSearchTerm("");
        setSearchResults([]);
        setHighlightedIndex(0);
        inputRef.current?.focus();
    };

    // Handle keyboard navigation and selection
    const handleKeyDown = async (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (searchResults.length > 0) {
                setHighlightedIndex((prev) =>
                    prev < searchResults.length - 1 ? prev + 1 : prev
                );
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (searchResults.length > 0) {
                setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
            }
        } else if (e.key === "Enter") {
            if (searchResults.length > 0) {
                const selectedMovie = searchResults[highlightedIndex];
                await addMovie(selectedMovie);
            } else {
                handleSearch(searchTerm);
            }
        }
    };

    // Debounce search: wait 400ms after user stops typing before calling API
    useEffect(() => {
        if (!searchTerm.trim()) return;

        const timeoutId = setTimeout(() => {
            handleSearch(searchTerm);
        }, 400);

        return () => clearTimeout(timeoutId);
    }, [searchTerm]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Render search UI and list of results
    return (
        <div className="mt-2">
            <div className="sticky top-0 z-10 bg-white pb-2">
                <input
                    ref={inputRef}
                    autoFocus
                    type="text"
                    value={searchTerm}
                    placeholder="Search movies..."
                    className="w-full border rounded px-3 py-2"
                    onChange={(e) => {
                        const value = e.target.value;
                        setSearchTerm(value);
                        if (!value.trim()) {
                            latestRequestRef.current += 1;
                            setSearchResults([]);
                            setHighlightedIndex(0);
                        }
                    }}
                    onKeyDown={handleKeyDown}
                    aria-activedescendant={
                        searchResults.length > 0
                            ? `movie-option-${searchResults[highlightedIndex].id}`
                            : undefined
                    }
                    role="combobox"
                    aria-expanded={searchResults.length > 0}
                    aria-haspopup="listbox"
                    aria-owns="movie-search-listbox"
                />
            </div>

            <ul
                id="movie-search-listbox"
                role="listbox"
                className="mt-2 space-y-2 max-h-[60vh] overflow-y-auto pr-1"
                aria-label="Search results"
            >
                {searchResults.map((movie, index) => {
                    const year = movie.release_date
                        ? movie.release_date.split("-")[0]
                        : "—";
                    const providers = providersByMovieId[movie.id];
                    const matchingProviders = matchUserServices(providers || [], userStreamingServices);

                    return (
                        <li
                            id={`movie-option-${movie.id}`}
                            key={movie.id}
                            role="option"
                            aria-selected={index === highlightedIndex}
                            className={`flex items-center justify-between p-2 border rounded cursor-pointer ${
                                index === highlightedIndex ? "bg-gray-200" : ""
                            }`}
                            onClick={async () => {
                                await addMovie(movie);
                            }}
                        >
                            <div className="flex items-center gap-3">
                                <img
                                    src={getPosterUrl(movie)}
                                    alt={movie.title}
                                    className="w-12 h-16 object-cover rounded"
                                />

                                <div className="text-left">
                                    <div className="font-semibold">{movie.title}</div>
                                    <div className="text-sm text-gray-500">{year}</div>
                                    <div className="text-xs text-gray-500">
                                        {Array.isArray(providers) && providers.length > 0
                                            ? `Available on: ${providers.join(", ")}`
                                            : "Available on: no US providers found"}
                                    </div>
                                    {matchingProviders.length > 0 && (
                                      <div className="text-xs text-green-700">
                                        Your services: {matchingProviders.join(", ")}
                                      </div>
                                    )}
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
