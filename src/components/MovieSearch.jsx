// MovieSearch component handles querying TMDB and returning selectable results.
import { useState, useEffect, useRef, useImperativeHandle } from "react";
import {getPosterUrl} from "../utils/getPosterUrl"
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { matchUserServices } from "../utils/streamingServices";
import AddMovieModal from "./AddMovieModal";
import { getTmdbMovieDetails, searchTmdbMovies } from "../lib/tmdbApi";
import { describeNetworkError } from "../utils/networkErrors";
import { MAX_MOVIE_NOTE_LENGTH, normalizeMovieNote } from "../utils/movieNote";

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
    const [searchError, setSearchError] = useState(null);
    const [voiceError, setVoiceError] = useState(null);
    const [isVoiceSupported, setIsVoiceSupported] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [voiceStatusMessage, setVoiceStatusMessage] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [providersByMovieId, setProvidersByMovieId] = useState({});
    const [detailMovie, setDetailMovie] = useState(null);
    const [detailActionError, setDetailActionError] = useState("");
    const [locallyAdding, setIsAdding] = useState(false);
    const isAdding = locallyAdding || disabled;
    const isSubmitting = locallyAdding || submissionPending;
    const submittingRef = useRef(false);
    const [commentDraft, setCommentDraft] = useState("");
    const [isCommentOpen, setIsCommentOpen] = useState(false);
    const inputRef = useRef(null);
    const scrollRef = useRef(null);
    const commentInputRef = useRef(null);
    const latestRequestRef = useRef(0);
    const recognitionRef = useRef(null);
    const isMountedRef = useRef(true);
    const suppressNextAutoSearchRef = useRef(false);
    const finalTranscriptRef = useRef("");
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
        streamingRegion: "US",
        streamingFetchedAt: null,
        isCustomEntry: true,
    });

    const attachCurrentComment = (movie) =>
        includeComment
            ? { ...movie, note: normalizeMovieNote(commentDraft) }
            : movie;


    const handleSearch = async (query) => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) return;

        const requestId = latestRequestRef.current + 1;
        latestRequestRef.current = requestId;
        setSearchError(null);
        setIsSearching(true);

        try {
            const data = await searchTmdbMovies(trimmedQuery);
            if (requestId !== latestRequestRef.current) return;

            const results = data.results || [];
            setSearchResults(results);
            setHighlightedIndex(0);
            // Titles are on screen now; providers keep filling in behind them.
            setIsSearching(false);

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
            if (requestId !== latestRequestRef.current) return;
            console.error("Failed to fetch movies", error);
            setSearchResults([]);
            setSearchError(
              describeNetworkError(
                error,
                "Movie service is unavailable right now. Please try again."
              )
            );
        } finally {
            // A newer search owns the indicator, so only the latest one clears it.
            if (requestId === latestRequestRef.current) {
                setIsSearching(false);
            }
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
        setDetailActionError("");
        setDetailMovie(null);
        onDetailChange?.(false);
        latestRequestRef.current += 1;
        setSearchTerm("");
        setSearchResults([]);
        setIsSearching(false);
        setHighlightedIndex(0);
        setCommentDraft("");
        setIsCommentOpen(false);
        setFocusRequest((request) => request + 1);
    };

    useImperativeHandle(controllerRef, () => ({
        focusSearch: () => inputRef.current?.focus(),
        blurSearch: () => inputRef.current?.blur(),
        reset: resetAfterSuccessfulAdd,
        back: () => { setDetailMovie(null); setDetailActionError(""); onDetailChange?.(false); setFocusRequest((request) => request + 1); },
    }));

    const submitDraft = async (movie, detailed = false) => {
        const draft = attachCurrentComment(movie);
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
    }, [searchTerm]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        if (isCommentOpen) {
            commentInputRef.current?.focus();
        }
    }, [isCommentOpen]);

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
        <div className={inlineDetails ? "bowl-add-search" : "mt-2"}>
          <div className={inlineDetails ? "bowl-add-search-form" : undefined} hidden={inlineDetails && Boolean(detailMovie)}>
            <div className="sticky top-0 z-10 -mx-1 bg-slate-900/95 px-1 pb-3 backdrop-blur">
                {searchHeader}
                <div className="flex items-start gap-2">
                    <input
                        ref={inputRef}
                        disabled={disabled}
                        autoFocus={autoFocusSearch}
                        id="movie-search-input"
                        name="movie_search"
                        type="text"
                        value={searchTerm}
                        placeholder="Search movies..."
                        className="input-field flex-1"
                        onFocus={onSearchFocus}
                        onChange={(e) => {
                            const value = e.target.value;
                            setSearchTerm(value);
                            onDraftChange?.();
                            setVoiceError(null);
                            setVoiceStatusMessage("");
                            if (!value.trim()) {
                                latestRequestRef.current += 1;
                                setSearchResults([]);
                                setIsSearching(false);
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
                            disabled={disabled}
                            onClick={toggleVoiceInput}
                            className={`icon-btn h-11 w-11 flex-shrink-0 ${isListening ? "animate-pulse border-rose-500 bg-rose-950/50 text-rose-200 shadow-lg shadow-rose-950/30" : ""}`}
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
                {isListening ? (
                    <div className="mt-2 flex items-center gap-2 text-sm text-rose-300">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-400 animate-ping" aria-hidden="true" />
                        <span>{voiceStatusMessage || "Listening… tap the mic again to stop."}</span>
                    </div>
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
                        {searchResults.length} {searchResults.length === 1 ? "result" : "results"} below — tap Add to pick one.
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
            {includeComment && (
                <div className="mt-3 rounded-xl border border-slate-700/80 bg-slate-950/35 text-left">
                    <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                        onClick={() => setIsCommentOpen((prev) => !prev)}
                        aria-expanded={isCommentOpen}
                        aria-controls="movie-comment-panel"
                    >
                        <span className="min-w-0">
                            <span className="block text-sm font-medium text-slate-100">Comment (optional)</span>
                            {!isCommentOpen && (
                                <span className="mt-0.5 block truncate text-xs text-slate-400">
                                    {commentDraft.trim()
                                        ? commentDraft.trim()
                                        : "Add a reminder of why this movie belongs in the bowl."}
                                </span>
                            )}
                        </span>
                        <span className="flex-shrink-0 text-sm font-medium text-rose-300">
                            {isCommentOpen ? "Hide" : commentDraft.trim() ? "Edit" : "Add"}
                        </span>
                    </button>
                    {isCommentOpen && (
                        <div id="movie-comment-panel" className="px-3 pb-3">
                            <label className="sr-only" htmlFor="movie-comment-input">
                                Comment (optional)
                            </label>
                            <textarea
                                disabled={isAdding}
                                ref={commentInputRef}
                                id="movie-comment-input"
                                name="movie_comment"
                                className="input-field min-h-20 resize-y"
                                value={commentDraft}
                                maxLength={MAX_MOVIE_NOTE_LENGTH}
                                placeholder="Recommended by Tim at dinner…"
                                onChange={(event) => setCommentDraft(event.target.value)}
                            />
                            <span className="mt-1 flex items-start justify-between gap-3 text-xs text-slate-400">
                                <span>Applies to the next movie you add.</span>
                                <span
                                    className="shrink-0"
                                    aria-label={`${commentDraft.length} of ${MAX_MOVIE_NOTE_LENGTH} characters`}
                                >
                                    {commentDraft.length}/{MAX_MOVIE_NOTE_LENGTH}
                                </span>
                            </span>
                        </div>
                    )}
                </div>
            )}

            <ul
                id="movie-search-listbox"
                role="listbox"
                className="mt-2 space-y-2 sm:max-h-[60vh] sm:overflow-y-auto sm:pr-1"
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
                                    <div className="text-sm text-slate-400">{year}</div>
                                    <div className="truncate text-xs text-slate-400">
                                        {Array.isArray(providers) && providers.length > 0
                                            ? `Available on: ${providers.join(", ")}`
                                            : "Available on: no US providers found"}
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
                isDetailPrimaryActionLoading={isSubmitting}
                isDetailPrimaryActionDisabled={disabled}
                onDetailPrimaryAction={async (selectedMovie) => {
                  if (isAdding || submittingRef.current) return;
                  submittingRef.current = true;
                  setIsAdding(true);
                  setDetailActionError("");
                  try {
                    const result = normalizeAddResult(
                      await submitDraft(selectedMovie, true)
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
                  setDetailMovie(null);
                  onDetailChange?.(false);
                  setFocusRequest((request) => request + 1);
                }}
              />
            )}
        </div>
    );
}
