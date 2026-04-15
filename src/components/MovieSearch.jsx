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
    const [voiceError, setVoiceError] = useState(null);
    const [isVoiceSupported, setIsVoiceSupported] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [voiceStatusMessage, setVoiceStatusMessage] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [providersByMovieId, setProvidersByMovieId] = useState({});
    const [detailMovie, setDetailMovie] = useState(null);
    const [isAdding, setIsAdding] = useState(false);
    const inputRef = useRef(null);
    const latestRequestRef = useRef(0);
    const recognitionRef = useRef(null);
    const isMountedRef = useRef(true);
    const suppressNextAutoSearchRef = useRef(false);
    const finalTranscriptRef = useRef("");

    const stopRecognition = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
    };

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
        if (suppressNextAutoSearchRef.current) {
            suppressNextAutoSearchRef.current = false;
            return;
        }

        const timeoutId = setTimeout(() => {
            handleSearch(searchTerm);
        }, 400);

        return () => clearTimeout(timeoutId);
    }, [searchTerm]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        isMountedRef.current = true;
        const SpeechRecognitionCtor =
            typeof window !== "undefined"
                ? window.SpeechRecognition || window.webkitSpeechRecognition
                : null;

        if (!SpeechRecognitionCtor) {
            setIsVoiceSupported(false);
            recognitionRef.current = null;
            return () => {
                isMountedRef.current = false;
            };
        }

        setIsVoiceSupported(true);
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            if (!isMountedRef.current) return;
            setVoiceError(null);
            setIsListening(true);
            setVoiceStatusMessage("Listening for a movie title…");
            finalTranscriptRef.current = "";
        };

        recognition.onresult = (event) => {
            if (!isMountedRef.current) return;
            const transcript = Array.from(event.results || [])
                .filter((result) => result?.isFinal)
                .map((result) => result[0]?.transcript || "")
                .join(" ")
                .trim();

            if (transcript) {
                finalTranscriptRef.current = transcript;
                suppressNextAutoSearchRef.current = true;
                setSearchTerm(transcript);
                setSearchResults([]);
                setHighlightedIndex(0);
                setSearchError(null);
                latestRequestRef.current += 1;
            }
        };

        recognition.onerror = (event) => {
            if (!isMountedRef.current) return;
            const errorCode = String(event?.error || "");
            if (errorCode === "aborted") return;
            if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
                setVoiceError("Microphone access was blocked. You can still type your search.");
                return;
            }
            setVoiceError("Voice input is unavailable right now. You can still type your search.");
        };

        recognition.onend = () => {
            if (!isMountedRef.current) return;
            setIsListening(false);
            const transcript = finalTranscriptRef.current.trim();
            if (transcript) {
                setVoiceStatusMessage(`Searching for "${transcript}"...`);
                finalTranscriptRef.current = "";
                handleSearch(transcript);
            } else {
                setVoiceStatusMessage("");
            }
        };

        recognitionRef.current = recognition;

        return () => {
            isMountedRef.current = false;
            recognition.onstart = null;
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.onend = null;
            recognition.stop();
            recognitionRef.current = null;
        };
    }, []);

    const toggleVoiceInput = () => {
        if (!recognitionRef.current) return;

        if (isListening) {
            stopRecognition();
            return;
        }

        setVoiceError(null);
        setVoiceStatusMessage("");
        try {
            recognitionRef.current.start();
        } catch (error) {
            console.error("Failed to start voice input", error);
            setVoiceError("Voice input is unavailable right now. You can still type your search.");
            setIsListening(false);
        }
    };

    // Render search UI and list of results
    return (
        <div className="mt-2">
            <div className="sticky top-0 z-10 bg-slate-900 pb-2">
                <div className="flex items-start gap-2">
                    <input
                        ref={inputRef}
                        autoFocus
                        id="movie-search-input"
                        name="movie_search"
                        type="text"
                        value={searchTerm}
                        placeholder="Search movies..."
                        className="input-field flex-1"
                        onChange={(e) => {
                            const value = e.target.value;
                            setSearchTerm(value);
                            setVoiceError(null);
                            setVoiceStatusMessage("");
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
                    {isVoiceSupported && (
                        <button
                            type="button"
                            onClick={toggleVoiceInput}
                            className={`icon-btn h-11 w-11 flex-shrink-0 ${isListening ? "animate-pulse border-red-500 bg-red-950/50 text-red-200 shadow-lg shadow-red-950/30" : ""}`}
                            aria-label={isListening ? "Stop voice input" : "Start voice input"}
                            aria-pressed={isListening}
                        >
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Z" />
                                <path d="M19 11a7 7 0 0 1-14 0" />
                                <path d="M12 18v3" />
                            </svg>
                        </button>
                    )}
                </div>
                {isVoiceSupported && !isListening && !voiceStatusMessage && !voiceError && (
                    <p className="mt-2 text-sm text-slate-400">Speak a movie title or type to search.</p>
                )}
                {isListening && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-red-300">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-400 animate-ping" aria-hidden="true" />
                        <span>{voiceStatusMessage || "Listening… tap the mic again to stop."}</span>
                    </div>
                )}
                {!isListening && voiceStatusMessage && !voiceError && (
                    <p className="mt-2 text-sm text-slate-300">{voiceStatusMessage}</p>
                )}
                {voiceError && (
                    <div className="mt-2 rounded-lg border border-red-900/60 bg-red-950/50 px-3 py-2 text-sm text-red-300">
                        {voiceError}
                    </div>
                )}
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
                            className={`flex items-center justify-between rounded-xl border border-slate-700 p-2 ${
                                index === highlightedIndex ? "bg-slate-800" : "bg-slate-900"
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
                                    <div className="text-sm text-slate-400">{year}</div>
                                    <div className="text-xs text-slate-400">
                                        {Array.isArray(providers) && providers.length > 0
                                            ? `Available on: ${providers.join(", ")}`
                                            : "Available on: no US providers found"}
                                    </div>
                                    {matchingProviders.length > 0 && (
                                      <div className="text-xs text-emerald-300">
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
              <div className="mt-2 rounded-lg border border-red-900/60 bg-red-950/50 px-3 py-2 text-sm text-red-300">
                {searchError}
              </div>
            )}
            {!searchError && searchTerm.trim() && searchResults.length === 0 && (
              <div className="mt-2 text-sm text-slate-500">No matching movies found.</div>
            )}
            {searchTerm.trim() && (
              <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900 px-3 py-3">
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
