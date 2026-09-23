// MovieSearch component handles querying TMDB and returning selectable results.
import { useState, useEffect, useRef, useImperativeHandle, useCallback } from "react";
import { getPosterUrl } from "../utils/getPosterUrl";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { matchUserServices } from "../utils/streamingServices";
import AddMovieModal from "./AddMovieModal";
import { getTmdbMovieDetails, searchTmdbMovies } from "../lib/tmdbApi";
import { describeNetworkError } from "../utils/networkErrors";
import { MAX_MOVIE_NOTE_LENGTH, normalizeMovieNote } from "../utils/movieNote";
import { getMovieIdentityLabel } from "../utils/movieIdentity";
import { getSearchReleaseLabel } from "../utils/movieReleaseStatus";
import { createEmptyStreamingProviderData } from "../utils/tmdbWatchProviders";

const PROVIDER_ENRICHMENT_LIMIT = 8;
const PROVIDER_ENRICHMENT_CONCURRENCY = 4;

function appendUniqueMovies(current, incoming) {
    const seen = new Set(current.map((movie) => movie.id));
    return [...current, ...incoming.filter((movie) => !seen.has(movie.id))];
}

async function mapWithConcurrency(items, concurrency, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;

    const workers = Array.from(
        { length: Math.min(concurrency, items.length) },
        async () => {
            while (nextIndex < items.length) {
                const index = nextIndex;
                nextIndex += 1;
                results[index] = await mapper(items[index], index);
            }
        }
    );

    await Promise.all(workers);
    return results;
}

export default function MovieSearch({
    onAddMovie,
    onSubmitMovie,
    inlineDetails = false,
    disabled = false,
    submissionPending = false,
    hideResults = false,
    searchHeader = null,
    searchFooter = null,
    alternateBody = null,
    feedback = null,
    autoFocusSearch = true,
    controllerRef = null,
    onDetailChange,
    onDraftChange,
    onSearchFocus,
    detailActionLabel = "Add Movie",
    userStreamingServices = [],
    includeComment = true,
}) {
    // Controlled input state for the search field
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [searchError, setSearchError] = useState(null);
    const [loadMoreError, setLoadMoreError] = useState(null);
    const [searchPage, setSearchPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [totalResults, setTotalResults] = useState(0);
    const [voiceError, setVoiceError] = useState(null);
    const [isVoiceSupported, setIsVoiceSupported] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [voiceStatusMessage, setVoiceStatusMessage] = useState("");
    // What the recognizer has heard so far, shown in the field while listening.
    // It stays out of searchTerm until listening ends, so the words appearing
    // never start a search of their own.
    const [voiceTranscript, setVoiceTranscript] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [providersByMovieId, setProvidersByMovieId] = useState({});
    const [detailMovie, setDetailMovie] = useState(null);
    const [detailActionError, setDetailActionError] = useState("");
    const [locallyAdding, setIsAdding] = useState(false);
    const isAdding = locallyAdding || disabled;
    const isSubmitting = locallyAdding || submissionPending;
    const submittingRef = useRef(false);
    const [commentDraft, setCommentDraft] = useState("");
    const inputRef = useRef(null);
    const scrollRef = useRef(null);
    const latestRequestRef = useRef(0);
    const recognitionRef = useRef(null);
    const isMountedRef = useRef(true);
    const suppressNextAutoSearchRef = useRef(false);
    const finalTranscriptRef = useRef("");
    const heardTranscriptRef = useRef("");
    const [focusRequest, setFocusRequest] = useState(0);
    const handledFocusRequest = useRef(0);

    useEffect(() => {
        if (focusRequest === handledFocusRequest.current || isAdding || detailMovie) return;
        if (inputRef.current?.closest("[hidden]")) return;
        inputRef.current?.focus();
        handledFocusRequest.current = focusRequest;
    }, [focusRequest, isAdding, detailMovie]);

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
        streamingProviderLogos: {},
        streamingAvailability: createEmptyStreamingProviderData("US").availability,
        streamingWatchUrl: null,
        streamingProviderStatus: "unavailable",
        streamingRegion: "US",
        streamingFetchedAt: null,
        isCustomEntry: true,
    });

    // The comment belongs to one movie, so it is written in that movie's details
    // and attached only from there. Quick add and custom titles carry none.
    const attachCurrentComment = (movie) =>
        includeComment
            ? { ...movie, note: normalizeMovieNote(commentDraft) }
            : movie;


    const enrichProviders = useCallback(async (movies, requestId) => {
        const targets = movies.slice(0, PROVIDER_ENRICHMENT_LIMIT);
        if (targets.length === 0) return;

        setProvidersByMovieId((previous) => {
            const next = { ...previous };
            targets.forEach((movie) => {
                if (!next[movie.id]) next[movie.id] = { status: "loading", data: null };
            });
            return next;
        });

        const entries = await mapWithConcurrency(
            targets,
            PROVIDER_ENRICHMENT_CONCURRENCY,
            async (movie) => {
                const data = await fetchStreamingProviders(movie.id, { region: "US" });
                return [movie.id, { status: data.status || "ready", data }];
            }
        );

        if (requestId !== latestRequestRef.current) return;
        setProvidersByMovieId((previous) => {
            const next = { ...previous };
            entries.forEach(([movieId, entry]) => {
                next[movieId] = entry;
            });
            return next;
        });
    }, []);

    const handleSearch = useCallback(async (query, { page = 1, append = false } = {}) => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) return;

        const requestId = append
            ? latestRequestRef.current
            : latestRequestRef.current + 1;
        if (!append) latestRequestRef.current = requestId;
        setLoadMoreError(null);
        if (append) {
            setIsLoadingMore(true);
        } else {
            setSearchError(null);
            setIsSearching(true);
            setSearchResults([]);
            setProvidersByMovieId({});
            setSearchPage(1);
            setTotalPages(0);
            setTotalResults(0);
        }

        try {
            const data = await searchTmdbMovies(trimmedQuery, { page });
            if (requestId !== latestRequestRef.current) return;

            const results = data.results || [];
            setSearchResults((current) => appendUniqueMovies(append ? current : [], results));
            if (!append) setHighlightedIndex(0);
            setSearchPage(Number(data.page) || page);
            setTotalPages(Number(data.totalPages) || (results.length > 0 ? page : 0));
            setTotalResults(Number(data.totalResults) || results.length);
            // Titles are on screen now; providers keep filling in behind them.
            if (append) setIsLoadingMore(false);
            else setIsSearching(false);
            await enrichProviders(results, requestId);
        } catch (error) {
            if (requestId !== latestRequestRef.current) return;
            console.error("Failed to fetch movies", error);
            const message = describeNetworkError(
              error,
              "Movie service is unavailable right now. Please try again."
            );
            if (append) setLoadMoreError(message);
            else {
                setSearchResults([]);
                setSearchError(message);
            }
        } finally {
            // A newer search owns the indicator, so only the latest one clears it.
            if (requestId === latestRequestRef.current) {
                if (append) setIsLoadingMore(false);
                else setIsSearching(false);
            }
        }
    }, [enrichProviders]);

    const fetchMovieDetails = async (movieId) => {
        return getTmdbMovieDetails(movieId);
    };

    const buildDetailedMovie = async (movie) => {
        const details = await fetchMovieDetails(movie.id);
        const cachedProviderEntry = providersByMovieId[movie.id];
        const providerData = cachedProviderEntry?.status === "ready"
          ? cachedProviderEntry.data
          : await fetchStreamingProviders(movie.id, { region: "US" });

        return {
            ...movie,
            ...details,
            streamingProviders: providerData.providers || [],
            streamingProviderLogos: providerData.providerLogos || {},
            streamingAvailability: providerData.availability || {},
            streamingWatchUrl: providerData.watchUrl || null,
            streamingProviderStatus: providerData.status || "ready",
            streamingRegion: providerData.region || "US",
            streamingFetchedAt: providerData.fetchedAt || null,
        };
    };

    const normalizeAddResult = (result) => {
        if (result?.ok === false) {
            return {
                ...result,
                ok: false,
                message: result.message || "Could not add this movie. Please try again.",
            };
        }
        if (result === false) {
            return { ok: false, message: "Could not add this movie. Please try again." };
        }
        return { ok: true, message: null };
    };

    const resetAfterSuccessfulAdd = () => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        setSearchError(null);
        setVoiceError(null);
        setVoiceStatusMessage("");
        finalTranscriptRef.current = "";
        heardTranscriptRef.current = "";
        setVoiceTranscript("");
        suppressNextAutoSearchRef.current = false;
        setDetailActionError("");
        setDetailMovie(null);
        onDetailChange?.(false);
        latestRequestRef.current += 1;
        setSearchTerm("");
        setSearchResults([]);
        setProvidersByMovieId({});
        setIsSearching(false);
        setIsLoadingMore(false);
        setLoadMoreError(null);
        setSearchPage(1);
        setTotalPages(0);
        setTotalResults(0);
        setHighlightedIndex(0);
        setCommentDraft("");
        setFocusRequest((request) => request + 1);
    };

    useImperativeHandle(controllerRef, () => ({
        focusSearch: () => inputRef.current?.focus(),
        blurSearch: () => inputRef.current?.blur(),
        reset: resetAfterSuccessfulAdd,
        back: () => { setDetailMovie(null); setDetailActionError(""); setCommentDraft(""); onDetailChange?.(false); setFocusRequest((request) => request + 1); },
    }));

    const submitDraft = async (draft, detailed = false) => {
        if (onSubmitMovie) return onSubmitMovie({ ...draft, detailsLoaded: detailed });
        const hydrated = detailed || draft.isCustomEntry ? draft : await buildDetailedMovie(draft);
        return onAddMovie({ ...hydrated, note: draft.note });
    };

    // The bowl flow captures its destination before its controller hydrates.
    // Other consumers keep their existing hydrated-movie callback contract.
    const addMovie = async (movie) => {
        if (isAdding || submittingRef.current) return;
        submittingRef.current = true;
        setIsAdding(true);
        try {
            const result = normalizeAddResult(await submitDraft(movie));
            if (!result.ok) {
                if (!onSubmitMovie) setSearchError(result.message);
                return;
            }
            resetAfterSuccessfulAdd();
        } catch (error) {
            console.error("Failed to fetch movie details", error);
            setSearchError(
              describeNetworkError(error, "Failed to load movie details. Please try again.")
            );
        } finally {
            submittingRef.current = false;
            setIsAdding(false);
        }
    };

    const addCustomMovie = async () => {
        const customTitle = searchTerm.trim();
        if (!customTitle || isAdding || submittingRef.current) return;
        submittingRef.current = true;
        setIsAdding(true);

        try {
            const result = normalizeAddResult(
                await submitDraft(buildCustomMovie(customTitle), true)
            );
            if (!result.ok) {
                if (!onSubmitMovie) setSearchError(result.message);
                return;
            }
            resetAfterSuccessfulAdd();
        } catch (error) {
            console.error("Failed to add custom movie", error);
            setSearchError(
              describeNetworkError(error, "Failed to add custom entry. Please try again.")
            );
        } finally {
            submittingRef.current = false;
            setIsAdding(false);
        }
    };

    const openDetails = async (movie) => {
        try {
            const detailedMovie = await buildDetailedMovie(movie);
            setDetailActionError("");
            setDetailMovie(detailedMovie);
            onDetailChange?.(true);
        } catch (error) {
            console.error("Failed to open movie details", error);
            setSearchError(
              describeNetworkError(error, "Failed to open movie details. Please try again.")
            );
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

        // Flag progress before the debounce so typing never looks like a dead end.
        setIsSearching(true);
        const timeoutId = setTimeout(() => {
            handleSearch(searchTerm);
        }, 400);

        return () => clearTimeout(timeoutId);
    }, [handleSearch, searchTerm]);

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
        // Interim results are what let the field fill in as someone speaks.
        // Without them nothing appears until they stop, and there is no way to
        // tell whether they were heard at all.
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            if (!isMountedRef.current) return;
            setVoiceError(null);
            setIsListening(true);
            setVoiceStatusMessage("Say a movie title — pause to search.");
            finalTranscriptRef.current = "";
            heardTranscriptRef.current = "";
            setVoiceTranscript("");
        };

        recognition.onresult = (event) => {
            if (!isMountedRef.current) return;
            const results = Array.from(event.results || []);
            const joinTranscripts = (list) => list
                .map((result) => result?.[0]?.transcript || "")
                .join(" ")
                .replace(/\s+/g, " ")
                .trim();
            const finalTranscript = joinTranscripts(results.filter((result) => result?.isFinal));
            const heardTranscript = joinTranscripts(results);

            if (finalTranscript) finalTranscriptRef.current = finalTranscript;
            heardTranscriptRef.current = heardTranscript;
            setVoiceTranscript(heardTranscript);
        };

        recognition.onerror = (event) => {
            if (!isMountedRef.current) return;
            const errorCode = String(event?.error || "");
            if (errorCode === "aborted") return;
            // Browsers follow an error with onend, but the field is read-only
            // while listening, so it must not depend on that to be typable again.
            setIsListening(false);
            setVoiceTranscript("");
            finalTranscriptRef.current = "";
            heardTranscriptRef.current = "";
            if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
                setVoiceError("Microphone access was blocked. You can still type your search.");
                return;
            }
            setVoiceError("Voice input is unavailable right now. You can still type your search.");
        };

        recognition.onend = () => {
            if (!isMountedRef.current) return;
            setIsListening(false);
            setVoiceTranscript("");
            // A recognizer that stops mid-word can end without marking its last
            // words final -- "Star" final, "Wars" still interim. What it had
            // heard is still what the person said, so it wins whenever it
            // carries the final words forward rather than contradicting them.
            const finalTranscript = finalTranscriptRef.current.trim();
            const heardTranscript = heardTranscriptRef.current.trim();
            const transcript = heardTranscript.startsWith(finalTranscript)
                ? heardTranscript
                : finalTranscript || heardTranscript;
            finalTranscriptRef.current = "";
            heardTranscriptRef.current = "";
            if (transcript) {
                suppressNextAutoSearchRef.current = true;
                latestRequestRef.current += 1;
                setSearchTerm(transcript);
                setSearchResults([]);
                setProvidersByMovieId({});
                setHighlightedIndex(0);
                setSearchError(null);
                setLoadMoreError(null);
                setSearchPage(1);
                setTotalPages(0);
                setTotalResults(0);
                setVoiceStatusMessage(`Searching for "${transcript}"...`);
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
    }, [handleSearch]);

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
        <div className={inlineDetails ? "bowl-add-search" : "mt-2"}>
          <div className={inlineDetails ? "bowl-add-search-form" : undefined} hidden={inlineDetails && Boolean(detailMovie)}>
            <div className="sticky top-0 z-10 -mx-1 bg-slate-900/95 px-1 pb-3 backdrop-blur">
                {searchHeader}
                <div className="relative">
                    <input
                        ref={inputRef}
                        disabled={disabled}
                        autoFocus={autoFocusSearch}
                        id="movie-search-input"
                        name="movie_search"
                        type="text"
                        value={isListening ? voiceTranscript : searchTerm}
                        readOnly={isListening}
                        placeholder={isListening ? "Listening…" : "Search movies..."}
                        className={`input-field w-full ${isVoiceSupported ? "pr-[5.5rem]" : ""} ${isListening ? "border-rose-500 bg-rose-950/30 ring-2 ring-rose-500/20" : ""}`}
                        onFocus={onSearchFocus}
                        onChange={(e) => {
                            const value = e.target.value;
                            latestRequestRef.current += 1;
                            setSearchTerm(value);
                            onDraftChange?.();
                            setVoiceError(null);
                            setVoiceStatusMessage("");
                            setSearchResults([]);
                            setProvidersByMovieId({});
                            setIsLoadingMore(false);
                            setLoadMoreError(null);
                            setSearchPage(1);
                            setTotalPages(0);
                            setTotalResults(0);
                            setHighlightedIndex(0);
                            if (!value.trim()) setIsSearching(false);
                            setSearchError(null);
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
                        // Inside the field, so listening changes the field itself
                        // rather than adding a second control beside it.
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={toggleVoiceInput}
                            className={`absolute right-1 top-1/2 flex h-9 min-w-9 -translate-y-1/2 items-center justify-center rounded-lg px-2 text-sm font-semibold transition ${isListening ? "bg-rose-500/25 text-rose-100 hover:bg-rose-500/35" : "text-slate-300 hover:bg-slate-700/60"}`}
                            aria-label={isListening ? "Stop voice input" : "Start voice input"}
                            aria-pressed={isListening}
                        >
                            {isListening ? (
                                <span aria-hidden="true">Done</span>
                            ) : (
                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Z" />
                                    <path d="M19 11a7 7 0 0 1-14 0" />
                                    <path d="M12 18v3" />
                                </svg>
                            )}
                        </button>
                    )}
                </div>
                {isListening ? (
                    <p className="mt-2 text-sm text-rose-300" role="status">
                        {voiceStatusMessage || "Listening… tap Done to stop."}
                    </p>
                ) : isSearching ? (
                    <p className="mt-2 flex items-center gap-2 text-sm text-slate-300" role="status">
                        <span
                            className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-slate-600 border-t-rose-400"
                            aria-hidden="true"
                        />
                        <span>Searching movies…</span>
                    </p>
                ) : searchResults.length > 0 ? (
                    <p className={inlineDetails ? "sr-only" : "mt-2 text-sm text-slate-300"} role="status">
                        {totalResults > searchResults.length
                            ? `${searchResults.length} of ${totalResults} results below`
                            : `${searchResults.length} ${searchResults.length === 1 ? "result" : "results"} below`}
                        {" — tap Add to pick one."}
                    </p>
                ) : !inlineDetails && isVoiceSupported && !voiceStatusMessage && !voiceError ? (
                    <p className="mt-2 text-sm text-slate-400">Speak a movie title or type to search.</p>
                ) : null}
                {!isListening && !isSearching && voiceStatusMessage && !voiceError && (
                    <p className="mt-2 text-sm text-slate-300">{voiceStatusMessage}</p>
                )}
                {voiceError && (
                    <div className="mt-2 rounded-lg border border-rose-900/60 bg-rose-950/50 px-3 py-2 text-sm text-rose-300">
                        {voiceError}
                    </div>
                )}
                {feedback}
            </div>

            <div ref={scrollRef} className={inlineDetails ? "bowl-add-scroll" : undefined} hidden={hideResults || Boolean(alternateBody)}>
            <ul
                id="movie-search-listbox"
                role="listbox"
                className="mt-2 space-y-2 sm:max-h-[60vh] sm:overflow-y-auto sm:pr-1"
                aria-label="Search results"
            >
                {searchResults.map((movie, index) => {
                    const releaseLabel = getSearchReleaseLabel(movie);
                    const identityLabel = getMovieIdentityLabel(movie);
                    const providerEntry = providersByMovieId[movie.id];
                    const providers = providerEntry?.data?.providers || [];
                    const matchingProviders = matchUserServices(providers || [], userStreamingServices);

                    return (
                        <li
                            id={`movie-option-${movie.id}`}
                            key={movie.id}
                            role="option"
                            aria-selected={index === highlightedIndex}
                            className={`flex items-center justify-between gap-3 rounded-2xl border border-slate-700/80 p-3 transition ${
                                index === highlightedIndex ? "bg-slate-800/90 ring-1 ring-rose-800/40" : "bg-slate-950/35 hover:bg-slate-800/60"
                            }`}
                        >
                            <div className="flex min-w-0 items-center gap-3">
                                <img
                                    src={getPosterUrl(movie)}
                                    alt={movie.title}
                                    className="h-20 w-14 flex-shrink-0 rounded-lg object-cover shadow-md shadow-black/30"
                                />

                                <div className="min-w-0 text-left">
                                    <div className="font-semibold text-slate-100">{movie.title}</div>
                                    <div className="text-sm text-slate-400">{releaseLabel}</div>
                                    {identityLabel && (
                                        <div className="truncate text-xs text-slate-400">{identityLabel}</div>
                                    )}
                                    <div className="truncate text-xs text-slate-400">
                                        {!providerEntry
                                            ? "Availability not checked yet"
                                            : providerEntry.status === "loading"
                                              ? "Checking US availability…"
                                              : providerEntry.status === "failed"
                                                ? "Availability unavailable right now"
                                                : providers.length > 0
                                                  ? `Available on: ${providers.join(", ")}`
                                                  : "No included or free US providers found"}
                                    </div>
                                    {matchingProviders.length > 0 && (
                                      <div className="truncate text-xs text-emerald-300">
                                        Your services: {matchingProviders.join(", ")}
                                      </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-shrink-0 flex-col gap-2">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await addMovie(movie);
                                  }}
                                  className="btn btn-primary min-w-20 px-3 py-2 text-xs"
                                  disabled={isAdding}
                                >
                                  {isSubmitting ? "Adding..." : "Add"}
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await openDetails(movie);
                                  }}
                                  className="btn btn-secondary min-w-20 px-3 py-2 text-xs"
                                  disabled={isAdding}
                                >
                                  Details
                                </button>
                            </div>
                        </li>
                    );
                })}
            </ul>

            {searchResults.length > 0 && searchPage < totalPages && (
                <div className="mt-4 flex flex-col items-center gap-2">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={isLoadingMore || isAdding}
                        onClick={() => handleSearch(searchTerm, {
                            page: searchPage + 1,
                            append: true,
                        })}
                    >
                        {isLoadingMore ? "Loading more…" : "Load more movies"}
                    </button>
                    {loadMoreError && (
                        <p className="text-center text-sm text-rose-300" role="alert">
                            {loadMoreError} Your current results are still here.
                        </p>
                    )}
                </div>
            )}
            {isSearching && searchResults.length === 0 && (
              <ul className="mt-2 space-y-2" aria-hidden="true">
                {[0, 1, 2].map((placeholder) => (
                  <li
                    key={placeholder}
                    className="flex items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/35 p-3"
                  >
                    <div className="h-20 w-14 flex-shrink-0 animate-pulse rounded-lg bg-slate-800/80" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-slate-800/80" />
                      <div className="h-3 w-1/4 animate-pulse rounded bg-slate-800/60" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-slate-800/60" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {searchError && (
              <div
                className="mt-2 rounded-lg border border-rose-900/60 bg-rose-950/50 px-3 py-2 text-sm text-rose-300"
                role="alert"
              >
                {searchError}
              </div>
            )}
            {!searchError && !isSearching && searchTerm.trim() && searchResults.length === 0 && (
              <div className="mt-2 text-sm text-slate-400">No matching movies found.</div>
            )}
            {searchTerm.trim() && !isSearching && (
              <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900 px-3 py-3">
                <p className="text-sm font-medium text-slate-100">
                  Can&apos;t find it?
                </p>
                <p className="mb-2 text-xs text-slate-400">
                  Add a custom title or category for flexible draws.
                </p>
                <button
                  type="button"
                  onClick={addCustomMovie}
                  className="btn btn-secondary px-3 py-2 text-sm sm:py-1.5 sm:text-xs"
                  disabled={isAdding}
                >
                  {isSubmitting ? "Adding..." : `Add "${searchTerm.trim()}"`}
                </button>
              </div>
            )}

            {searchFooter}
            </div>
            {!hideResults && alternateBody && <div className="bowl-add-scroll">{alternateBody}</div>}
          </div>
            {detailMovie && (
              <AddMovieModal
                inline={inlineDetails}
                movie={detailMovie}
                userStreamingServices={userStreamingServices}
                detailPrimaryActionLabel={detailActionLabel}
                detailPrimaryActionError={detailActionError}
                detailPrimaryActionFields={includeComment ? (
                  <label className="block text-sm font-medium text-slate-200">
                    Comment (optional)
                    <textarea
                      disabled={isAdding}
                      name="movie_comment"
                      className="input-field mt-1.5 min-h-20 resize-y"
                      value={commentDraft}
                      maxLength={MAX_MOVIE_NOTE_LENGTH}
                      placeholder="Recommended by Tim at dinner…"
                      onChange={(event) => setCommentDraft(event.target.value)}
                    />
                    <span className="mt-1 flex items-start justify-between gap-3 text-xs font-normal text-slate-400">
                      <span>Why this movie belongs in the bowl.</span>
                      <span
                        className="shrink-0"
                        aria-label={`${commentDraft.length} of ${MAX_MOVIE_NOTE_LENGTH} characters`}
                      >
                        {commentDraft.length}/{MAX_MOVIE_NOTE_LENGTH}
                      </span>
                    </span>
                  </label>
                ) : null}
                isDetailPrimaryActionLoading={isSubmitting}
                isDetailPrimaryActionDisabled={disabled}
                onDetailPrimaryAction={async (selectedMovie) => {
                  if (isAdding || submittingRef.current) return;
                  submittingRef.current = true;
                  setIsAdding(true);
                  setDetailActionError("");
                  try {
                    const result = normalizeAddResult(
                      await submitDraft(attachCurrentComment(selectedMovie), true)
                    );
                    if (!result.ok) {
                      if (!onSubmitMovie) setDetailActionError(result.message);
                      return;
                    }
                    resetAfterSuccessfulAdd();
                  } finally {
                    submittingRef.current = false;
                    setIsAdding(false);
                  }
                }}
                onClose={() => {
                  setDetailActionError("");
                  setCommentDraft("");
                  setDetailMovie(null);
                  onDetailChange?.(false);
                  setFocusRequest((request) => request + 1);
                }}
              />
            )}
        </div>
    );
}
