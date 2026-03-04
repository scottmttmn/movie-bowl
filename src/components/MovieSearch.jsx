// MovieSearch component handles querying TMDB and returning selectable results.
import { useState, useEffect, useRef } from "react";
import {getPosterUrl} from "../utils/getPosterUrl"
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { matchUserServices } from "../utils/streamingServices";
import AddMovieModal from "./AddMovieModal";
import { getTmdbMovieDetails, searchTmdbMovies } from "../lib/tmdbApi";

export default function MovieSearch({ onAddMovie, userStreamingServices = [] }) {
    // Controlled input state for the search field
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchError, setSearchError] = useState(null);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [providersByMovieId, setProvidersByMovieId] = useState({});
    const [detailMovie, setDetailMovie] = useState(null);
    const [isAdding, setIsAdding] = useState(false);
    const inputRef = useRef(null);
    const latestRequestRef = useRef(0);

    const buildCustomMovie = (title) => ({
        id: null,
        title,
        release_date: null,
        runtime: null,
        genres: [],
        overview: null,
        poster_path: null,
        streamingProviders: [],
        streamingRegion: "US",
        streamingFetchedAt: null,
        isCustomEntry: true,
    });


    const handleSearch = async (query) => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) return;

        const requestId = latestRequestRef.current + 1;
        latestRequestRef.current = requestId;
        setSearchError(null);

        try {
            const data = await searchTmdbMovies(trimmedQuery);
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
            setSearchResults([]);
            setSearchError("Movie service is unavailable right now. Please try again.");
        }
    };

    const fetchMovieDetails = async (movieId) => {
        return getTmdbMovieDetails(movieId);
    };

    const buildDetailedMovie = async (movie) => {
        const details = await fetchMovieDetails(movie.id);
        const cachedProviders = providersByMovieId[movie.id];
        const providerData = Array.isArray(cachedProviders)
          ? { providers: cachedProviders, region: "US", fetchedAt: null }
          : await fetchStreamingProviders(movie.id, { region: "US" });

        return {
            ...movie,
            ...details,
            streamingProviders: providerData.providers || [],
            streamingRegion: providerData.region || "US",
            streamingFetchedAt: providerData.fetchedAt || null,
        };
    };

    // Add movie with full details fetched inside
    const addMovie = async (movie) => {
        if (isAdding) return;
        setIsAdding(true);
        try {
            const detailedMovie = await buildDetailedMovie(movie);
            await onAddMovie(detailedMovie);
        } catch (error) {
            console.error("Failed to fetch movie details", error);
            setSearchError("Failed to load movie details. Please try again.");
        } finally {
            setIsAdding(false);
        }
        setSearchTerm("");
        setSearchResults([]);
        setHighlightedIndex(0);
        inputRef.current?.focus();
    };

    const addCustomMovie = async () => {
        const customTitle = searchTerm.trim();
        if (!customTitle || isAdding) return;
        setIsAdding(true);

        try {
            await onAddMovie(buildCustomMovie(customTitle));
        } catch (error) {
            console.error("Failed to add custom movie", error);
            setSearchError("Failed to add custom entry. Please try again.");
            setIsAdding(false);
            return;
        }

        setSearchError(null);
        setSearchTerm("");
        setSearchResults([]);
        setHighlightedIndex(0);
        inputRef.current?.focus();
        setIsAdding(false);
    };

    const openDetails = async (movie) => {
        try {
            const detailedMovie = await buildDetailedMovie(movie);
            setDetailMovie(detailedMovie);
        } catch (error) {
            console.error("Failed to open movie details", error);
            setSearchError("Failed to open movie details. Please try again.");
        }
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
            if (isAdding) return;
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
                    id="movie-search-input"
                    name="movie_search"
                    type="text"
                    value={searchTerm}
                    placeholder="Search movies..."
                    className="input-field"
                    onChange={(e) => {
                        const value = e.target.value;
                        setSearchTerm(value);
                        if (!value.trim()) {
                            latestRequestRef.current += 1;
                            setSearchResults([]);
                            setSearchError(null);
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
                            className={`flex items-center justify-between p-2 rounded-lg border border-slate-200 ${
                                index === highlightedIndex ? "bg-slate-100" : "bg-white"
                            }`}
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
                            <div className="ml-2 flex flex-col gap-1">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await addMovie(movie);
                                  }}
                                  className="btn btn-primary text-xs px-2 py-1"
                                  disabled={isAdding}
                                >
                                  {isAdding ? "Adding..." : "Add"}
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await openDetails(movie);
                                  }}
                                  className="btn btn-secondary text-xs px-2 py-1"
                                  disabled={isAdding}
                                >
                                  Details
                                </button>
                            </div>
                        </li>
                    );
                })}
            </ul>
            {searchError && (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {searchError}
              </div>
            )}
            {!searchError && searchTerm.trim() && searchResults.length === 0 && (
              <div className="mt-2 text-sm text-slate-500">No matching movies found.</div>
            )}
            {searchTerm.trim() && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-sm font-medium text-slate-800">
                  Can&apos;t find it?
                </p>
                <p className="mb-2 text-xs text-slate-600">
                  Add a custom title or category for flexible draws.
                </p>
                <button
                  type="button"
                  onClick={addCustomMovie}
                  className="btn btn-secondary px-3 py-1.5 text-xs"
                  disabled={isAdding}
                >
                  {isAdding ? "Adding..." : `Add "${searchTerm.trim()}"`}
                </button>
              </div>
            )}

            {detailMovie && (
              <AddMovieModal
                movie={detailMovie}
                userStreamingServices={userStreamingServices}
                detailPrimaryActionLabel="Add Movie"
                onDetailPrimaryAction={async (selectedMovie) => {
                  if (isAdding) return;
                  setIsAdding(true);
                  try {
                    await onAddMovie(selectedMovie);
                  } finally {
                    setIsAdding(false);
                  }
                }}
                onClose={() => setDetailMovie(null)}
              />
            )}
        </div>
    );
}
