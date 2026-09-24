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
import usePersonDiscovery from "../hooks/usePersonDiscovery";

const PROVIDER_ENRICHMENT_LIMIT = 8;
// How long title results wait for the people lookup that started with them.
// Long enough that the People row usually lands with the movies rather than
// above rows already on screen; short enough that titles never feel held up.
const PEOPLE_SETTLE_MS = 400;
const PROVIDER_ENRICHMENT_CONCURRENCY = 4;

function possessive(name) {
    return `${name}\u2019s`;
}

function getProfileUrl(person) {
    return person?.profilePath ? `https://image.tmdb.org/t/p/w185${person.profilePath}` : null;
}

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

// One line of availability per result. It says what is known and nothing
// more: a check still running is a shimmer, a failed check says so, and a row
// that was never checked says nothing rather than implying there is nothing.
function describeResultAvailability(providerEntry, userStreamingServices) {
    if (!providerEntry) return null;
    if (providerEntry.status === "loading") return { tone: "loading" };
    if (providerEntry.status === "failed") {
        return { tone: "quiet", text: "Couldn\u2019t check availability" };
    }
    const providers = providerEntry.data?.providers || [];
    const mine = matchUserServices(providers, userStreamingServices);
    if (mine.length > 0) {
        const others = providers.length - mine.length;
        return {
            tone: "mine",
            text: `On ${mine.join(", ")}${others > 0 ? ` \u00b7 +${others} more` : ""}`,
        };
    }
    if (providers.length > 0) return { tone: "quiet", text: providers.join(", ") };
    return { tone: "quiet", text: "Not on free or included US services" };
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
    // A search that could not run, kept apart from searchError, which also
    // carries failed adds: only a failed search gets "Try again", and it must
    // never read as a search that found nothing.
    const [searchFailure, setSearchFailure] = useState(null);
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
    // Which row's + is in flight, so only that row shows it; the rest disable.
    const [addingMovieId, setAddingMovieId] = useState(null);
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
    const discovery = usePersonDiscovery();
    const {
        searchPeople,
        clearPeople,
        openPerson,
        closePerson,
        reset: resetDiscovery,
    } = discovery;
    // Which person chip the arrow keys are on; null means the highlight is in
    // the movies, where a bare Enter has always added the first one.
    const [highlightedPerson, setHighlightedPerson] = useState(null);
    const gridRef = useRef(null);
    const keyboardMovedRef = useRef(false);
    const providersRef = useRef({});
    providersRef.current = providersByMovieId;
    const personView = discovery.person;
    const visiblePeople = !personView && discovery.peopleResult.query === searchTerm.trim()
        ? discovery.peopleResult.people
        : [];
    // The movies on screen: a chosen person's, or the title results.
    const listMovies = personView ? discovery.visibleMovies : searchResults;

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
            setSearchFailure(null);
            setIsSearching(true);
            setSearchResults([]);
            setProvidersByMovieId({});
            setSearchPage(1);
            setTotalPages(0);
            setTotalResults(0);
            setHighlightedPerson(null);
            closePerson();
        }
        // Fired beside the title search, never before it. A People row that
        // lands after the movies still shows -- whether a name finds its
        // person cannot depend on which request happened to win -- but the
        // titles give it a brief moment first, so it rarely pushes rows down.
        const peopleSettled = append ? null : searchPeople(trimmedQuery);

        try {
            const data = await searchTmdbMovies(trimmedQuery, { page });
            if (requestId !== latestRequestRef.current) return;
            if (peopleSettled) {
                await Promise.race([peopleSettled, new Promise((resolve) => setTimeout(resolve, PEOPLE_SETTLE_MS))]);
                if (requestId !== latestRequestRef.current) return;
            }

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
                setSearchFailure(message);
            }
        } finally {
            // A newer search owns the indicator, so only the latest one clears it.
            if (requestId === latestRequestRef.current) {
                if (append) setIsLoadingMore(false);
                else setIsSearching(false);
            }
        }
    }, [closePerson, enrichProviders, searchPeople]);

    // A person's movies get availability the way title results do: only the
    // rows on screen, a bounded batch at a time, and never the whole
    // filmography up front.
    const personMovies = discovery.visibleMovies;
    useEffect(() => {
        if (!discovery.person || personMovies.length === 0) return;
        const unchecked = personMovies.filter((movie) => !providersRef.current[movie.id]);
        if (unchecked.length > 0) enrichProviders(unchecked, latestRequestRef.current);
    }, [discovery.person, enrichProviders, personMovies]);

    const fetchMovieDetails = async (movieId) => {
        return getTmdbMovieDetails(movieId);
    };

    const buildDetailedMovie = async (movie) => {
        // Details and availability do not depend on each other, so neither
        // waits for the other: opening a movie or adding one costs one round
        // trip rather than two.
        const cachedProviderEntry = providersByMovieId[movie.id];
        const [details, providerData] = await Promise.all([
            fetchMovieDetails(movie.id),
            cachedProviderEntry?.status === "ready"
                ? cachedProviderEntry.data
                : fetchStreamingProviders(movie.id, { region: "US" }),
        ]);

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
        setSearchFailure(null);
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
        resetDiscovery();
        setHighlightedPerson(null);
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

    // Someone adding from a person's movies is often adding several, so a
    // successful add keeps the person, role and position and clears only the
    // add itself. Title results reset exactly as they always have.
    const finishSuccessfulAdd = () => {
        if (!discovery.person) {
            resetAfterSuccessfulAdd();
            return;
        }
        setSearchError(null);
        setDetailActionError("");
        setDetailMovie(null);
        onDetailChange?.(false);
        setCommentDraft("");
        setFocusRequest((request) => request + 1);
    };

    // There is no way back to the title results but the field: editing the
    // query leaves the person, and a control for the same thing only crowded
    // a header that has a phone's width to work with.
    // The arrow keys and Enter live on the field, so a click that leaves focus
    // on a chip or tab -- or on nothing, once the chip it was on is gone --
    // leaves them doing nothing. With a mouse or trackpad the click hands focus
    // back. A tap does not: focusing the field on a phone raises the keyboard
    // over the list that was just opened.
    const returnFocusToField = () => {
        if (window.matchMedia?.("(pointer: fine)")?.matches) {
            setFocusRequest((request) => request + 1);
        }
    };

    const switchRole = (roleName) => {
        discovery.chooseRole(roleName);
        setHighlightedIndex(0);
        if (gridRef.current) gridRef.current.scrollTop = 0;
    };

    const showPerson = (person) => {
        returnFocusToField();
        setHighlightedPerson(null);
        setHighlightedIndex(0);
        setSearchError(null);
        openPerson(person);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        if (gridRef.current) gridRef.current.scrollTop = 0;
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
        setAddingMovieId(movie?.id ?? null);
        try {
            const result = normalizeAddResult(await submitDraft(movie));
            if (!result.ok) {
                if (!onSubmitMovie) setSearchError(result.message);
                return;
            }
            finishSuccessfulAdd();
        } catch (error) {
            console.error("Failed to fetch movie details", error);
            setSearchError(
              describeNetworkError(error, "Failed to load movie details. Please try again.")
            );
        } finally {
            submittingRef.current = false;
            setIsAdding(false);
            setAddingMovieId(null);
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
    // People and then movies are one sequence for the arrow keys. The
    // highlight starts on the first movie, so a bare Enter adds it exactly as
    // it did before people existed; a person is only ever reached on purpose.
    const handleKeyDown = async (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") keyboardMovedRef.current = true;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (highlightedPerson !== null) {
                if (highlightedPerson < visiblePeople.length - 1) {
                    setHighlightedPerson(highlightedPerson + 1);
                } else if (listMovies.length > 0) {
                    setHighlightedPerson(null);
                    setHighlightedIndex(0);
                }
            } else if (listMovies.length > 0) {
                setHighlightedIndex((prev) =>
                    prev < listMovies.length - 1 ? prev + 1 : prev
                );
            } else if (visiblePeople.length > 0) {
                setHighlightedPerson(0);
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (highlightedPerson !== null) {
                if (highlightedPerson > 0) setHighlightedPerson(highlightedPerson - 1);
            } else if (listMovies.length > 0 && highlightedIndex > 0) {
                setHighlightedIndex(highlightedIndex - 1);
            } else if (visiblePeople.length > 0) {
                setHighlightedPerson(visiblePeople.length - 1);
            }
        } else if (e.key === "Enter") {
            if (isAdding) return;
            if (highlightedPerson !== null && visiblePeople[highlightedPerson]) {
                e.preventDefault();
                showPerson(visiblePeople[highlightedPerson]);
            } else if (listMovies.length > 0) {
                const selectedMovie = listMovies[highlightedIndex] || listMovies[0];
                await addMovie(selectedMovie);
            } else if (!discovery.person) {
                handleSearch(searchTerm);
            }
        }
    };

    // The highlight lives in the field, so the page does not scroll to it the
    // way it would to a focused element; without this, arrowing past the rows
    // in view moves a highlight nobody can see. Only an arrow press scrolls --
    // results landing must not move the page.
    const activeOptionId = highlightedPerson !== null && visiblePeople[highlightedPerson]
        ? `person-option-${visiblePeople[highlightedPerson].id}`
        : listMovies[highlightedIndex]
            ? `movie-option-${listMovies[highlightedIndex].id}`
            : null;
    useEffect(() => {
        if (!keyboardMovedRef.current || !activeOptionId) return;
        keyboardMovedRef.current = false;
        document.getElementById(activeOptionId)?.scrollIntoView?.({ block: "nearest" });
    }, [activeOptionId]);

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
            setVoiceStatusMessage("Say a title or someone in it — pause to search.");
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
                setHighlightedPerson(null);
                setSearchError(null);
                setSearchFailure(null);
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
                    {/* The leading icon is the field's state: a magnifier to search,
                        sound bars while it is listening. */}
                    <span className="pointer-events-none absolute left-3.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center" aria-hidden="true">
                        {isListening ? (
                            <span className="flex h-5 items-center gap-[3px]" data-testid="voice-wave">
                                {[0, 1, 2, 3].map((bar) => (
                                    <span key={bar} className="voice-wave-bar" style={{ animationDelay: `${bar * 0.12}s` }} />
                                ))}
                            </span>
                        ) : (
                            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <circle cx="11" cy="11" r="7" />
                                <path d="M20 20l-3.5-3.5" />
                            </svg>
                        )}
                    </span>
                    <input
                        ref={inputRef}
                        disabled={disabled}
                        autoFocus={autoFocusSearch}
                        id="movie-search-input"
                        name="movie_search"
                        type="text"
                        value={isListening ? voiceTranscript : searchTerm}
                        readOnly={isListening}
                        placeholder={isListening ? "Listening…" : "Movie title or person"}
                        className={`input-field w-full pl-10 ${isVoiceSupported ? "pr-[5.5rem]" : "pr-10"} ${isListening ? "border-rose-500 bg-rose-950/30 ring-2 ring-rose-500/20" : ""}`}
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
                            setHighlightedPerson(null);
                            // Typing always searches, even if the last voice
                            // transcript left the auto-search suppressed: that
                            // flag is only cleared by a change, and a transcript
                            // matching the field makes none.
                            suppressNextAutoSearchRef.current = false;
                            keyboardMovedRef.current = false;
                            clearPeople();
                            closePerson();
                            if (!value.trim()) setIsSearching(false);
                            setSearchError(null);
                            setSearchFailure(null);
                        }}
                        onKeyDown={handleKeyDown}
                        aria-activedescendant={activeOptionId || undefined}
                        role="combobox"
                        aria-expanded={listMovies.length > 0 || visiblePeople.length > 0}
                        aria-haspopup="grid"
                        aria-controls="movie-search-listbox"
                    />
                    {isSearching && !isListening && (
                        // The wrapper centres it: animate-spin sets its own
                        // transform, which would cancel a translate on the same box.
                        <span
                            className={`pointer-events-none absolute top-1/2 flex h-4 w-4 -translate-y-1/2 ${isVoiceSupported ? "right-12" : "right-3.5"}`}
                            aria-hidden="true"
                            data-testid="search-spinner"
                        >
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-rose-400" />
                        </span>
                    )}
                    {isVoiceSupported && (
                        // Inside the field, so listening changes the field itself
                        // rather than adding a second control beside it.
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={toggleVoiceInput}
                            className={`absolute right-1 top-1/2 flex h-9 min-w-9 -translate-y-1/2 items-center justify-center rounded-lg px-2 text-sm font-semibold transition ${isListening ? "bg-rose-500/25 text-rose-100 hover:bg-rose-500/35" : "border border-slate-700/70 bg-slate-700/50 text-slate-200 hover:bg-slate-700/80"}`}
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
                    // The spinner is in the field, so this line is for screen
                    // readers only: a visible one pushed the results down.
                    <p className="sr-only" role="status">Searching movies…</p>
                ) : personView ? (
                    <p className="sr-only" role="status">
                        {discovery.credits.status === "loading"
                            ? `Loading ${possessive(personView.name)} movies…`
                            : discovery.credits.status === "ready"
                                ? `${possessive(personView.name)} movies: ${listMovies.length} of ${discovery.totalMovies} below — tap a movie for details, or + to add it.`
                                : ""}
                    </p>
                ) : searchResults.length > 0 || visiblePeople.length > 0 ? (
                    <p className="sr-only" role="status">
                        {visiblePeople.length > 0 &&
                            `${visiblePeople.length} ${visiblePeople.length === 1 ? "person" : "people"} and `}
                        {totalResults > searchResults.length
                            ? `${searchResults.length} of ${totalResults} results below`
                            : `${searchResults.length} ${searchResults.length === 1 ? "result" : "results"} below`}
                        {" — tap a movie for details, or + to add it."}
                    </p>
                ) : !inlineDetails && isVoiceSupported && !voiceStatusMessage && !voiceError ? (
                    <p className="mt-2 text-sm text-slate-400">Say a title or someone in it, or type to search.</p>
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
            {/* A grid, not a listbox: each result has two actions -- the row
                opens Details and + adds -- and a listbox option cannot hold
                two independently focusable buttons. The arrow keys still move
                a highlight from the field, and Enter still adds it. */}
            {personView && (
                // One line: whose movies these are, and -- only for someone
                // credited in both roles -- which role, as a compact switch.
                <div className="mt-2 flex min-h-9 items-center justify-between gap-2">
                    <p className="min-w-0 truncate font-semibold text-slate-100">
                        {possessive(personView.name)} movies
                    </p>
                    {discovery.roles.length > 1 && (
                        <div role="tablist" aria-label="Role" className="flex flex-shrink-0 rounded-full border border-slate-700 p-0.5">
                            {discovery.roles.map((roleName) => (
                                <button
                                    key={roleName}
                                    type="button"
                                    role="tab"
                                    aria-selected={discovery.role === roleName}
                                    aria-controls="movie-search-listbox"
                                    tabIndex={discovery.role === roleName ? 0 : -1}
                                    onClick={() => {
                                        switchRole(roleName);
                                        returnFocusToField();
                                    }}
                                    onKeyDown={(event) => {
                                        // Left and right move between the roles, as tabs do;
                                        // up and down leave the switch for the list, so a
                                        // D-pad that lands here is never stuck on it.
                                        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                                            event.preventDefault();
                                            const other = discovery.roles.find((name) => name !== roleName);
                                            if (!other) return;
                                            switchRole(other);
                                            event.currentTarget.parentElement
                                                ?.querySelector(`[data-role="${other}"]`)?.focus();
                                        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                                            event.preventDefault();
                                            inputRef.current?.focus();
                                        }
                                    }}
                                    data-role={roleName}
                                    className={`min-h-8 rounded-full px-3 text-xs font-semibold transition ${discovery.role === roleName ? "bg-rose-600/25 text-rose-100" : "text-slate-400 hover:text-slate-200"}`}
                                >
                                    {roleName === "acting" ? "Acting" : "Directing"}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            <div
                ref={gridRef}
                id="movie-search-listbox"
                role="grid"
                className="mt-2 space-y-1.5 sm:max-h-[60vh] sm:overflow-y-auto sm:pr-1"
                aria-label={personView ? `${possessive(personView.name)} movies` : "Search results"}
            >
                {visiblePeople.length > 0 && (
                    // People are navigation, never slips: a chip opens their
                    // movies and has no add action of its own.
                    <div role="row" aria-label="People" className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
                        {visiblePeople.map((person, index) => {
                            const profileUrl = getProfileUrl(person);
                            return (
                                <div
                                    key={person.id}
                                    id={`person-option-${person.id}`}
                                    role="gridcell"
                                    aria-selected={highlightedPerson === index}
                                    className="flex-shrink-0"
                                >
                                    <button
                                        type="button"
                                        onClick={() => showPerson(person)}
                                        disabled={isAdding}
                                        aria-label={`Show ${possessive(person.name)} movies`}
                                        aria-describedby={person.knownFor?.length ? `person-known-${person.id}` : undefined}
                                        className={`flex min-h-11 max-w-[16rem] items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 ${highlightedPerson === index ? "border-rose-500/70 bg-slate-800/90" : "border-slate-700/70 bg-slate-950/35 hover:bg-slate-800/60"}`}
                                    >
                                        {profileUrl ? (
                                            <img src={profileUrl} alt="" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
                                        ) : (
                                            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-slate-200" aria-hidden="true">
                                                {person.name?.charAt(0) || "?"}
                                            </span>
                                        )}
                                        <span className="flex min-w-0 flex-col">
                                            <span className="truncate text-sm font-semibold text-slate-100">{person.name}</span>
                                            {person.knownFor?.length > 0 && (
                                                <span id={`person-known-${person.id}`} className="truncate text-xs italic text-slate-400">
                                                    {person.knownFor.join(", ")}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
                {listMovies.map((movie, index) => {
                    const releaseLabel = getSearchReleaseLabel(movie);
                    const identityLabel = getMovieIdentityLabel(movie);
                    const characterLabel = personView && discovery.role === "acting" && movie.characters?.length
                        ? `as ${movie.characters.join(" / ")}`
                        : null;
                    const metaLabel = [releaseLabel, identityLabel, characterLabel].filter(Boolean).join(" · ");
                    const availability = describeResultAvailability(
                        providersByMovieId[movie.id],
                        userStreamingServices
                    );
                    const isAddingThis = isSubmitting && addingMovieId === movie.id;

                    return (
                        <div
                            id={`movie-option-${movie.id}`}
                            key={movie.id}
                            role="row"
                            aria-selected={highlightedPerson === null && index === highlightedIndex}
                            className={`flex items-center gap-2 rounded-2xl border border-slate-700/70 p-2 transition ${
                                highlightedPerson === null && index === highlightedIndex ? "bg-slate-800/90 ring-1 ring-rose-800/40" : "bg-slate-950/35 hover:bg-slate-800/60"
                            }`}
                        >
                            <div role="gridcell" className="min-w-0 flex-1">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        await openDetails(movie);
                                    }}
                                    className="flex w-full min-w-0 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70"
                                    aria-label={`Details for ${movie.title}`}
                                    aria-describedby={`movie-meta-${movie.id}`}
                                    disabled={isAdding}
                                >
                                    <img
                                        src={getPosterUrl(movie)}
                                        alt=""
                                        className="h-[66px] w-11 flex-shrink-0 rounded-lg object-cover shadow-md shadow-black/30"
                                    />
                                    <span className="flex min-w-0 flex-col gap-px">
                                        <span className="font-semibold leading-snug text-slate-100">{movie.title}</span>
                                        <span id={`movie-meta-${movie.id}`} className="flex min-w-0 flex-col gap-px">
                                            {metaLabel && (
                                                <span className="truncate text-sm text-slate-400">{metaLabel}</span>
                                            )}
                                            {availability?.tone === "loading" && (
                                                <span className="mt-1 block">
                                                    <span className="skeleton-block block h-2.5 w-24 rounded" aria-hidden="true" />
                                                    <span className="sr-only">Checking availability</span>
                                                </span>
                                            )}
                                            {availability?.tone === "mine" && (
                                                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-emerald-300">
                                                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                                                    <span className="truncate">{availability.text}</span>
                                                </span>
                                            )}
                                            {availability?.tone === "quiet" && (
                                                <span className="mt-0.5 truncate text-xs text-slate-500">{availability.text}</span>
                                            )}
                                        </span>
                                    </span>
                                </button>
                            </div>
                            <div role="gridcell" className="flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        await addMovie(movie);
                                    }}
                                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-rose-500/55 bg-rose-600/15 text-2xl font-medium leading-none text-rose-100 transition hover:bg-rose-600/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 disabled:opacity-45"
                                    aria-label={isAddingThis ? `Adding ${movie.title}` : `Add ${movie.title}`}
                                    disabled={isAdding}
                                >
                                    {isAddingThis ? (
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-rose-400" aria-hidden="true" />
                                    ) : (
                                        <span aria-hidden="true">+</span>
                                    )}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {personView && discovery.credits.status === "ready" && listMovies.length < discovery.totalMovies && (
                <div className="mt-4 flex justify-center">
                    <button type="button" className="btn btn-secondary" disabled={isAdding} onClick={discovery.showMore}>
                        Show more movies
                    </button>
                </div>
            )}
            {personView && discovery.credits.status === "ready" && discovery.totalMovies === 0 && (
                <p className="mt-2 text-sm text-slate-400">
                    No feature films found for {personView.name}.
                </p>
            )}
            {personView && discovery.credits.status === "failed" && (
                <div className="mt-2 flex flex-col gap-2.5 rounded-2xl border border-rose-900/70 bg-rose-950/45 p-3.5" role="alert">
                    <p className="font-semibold text-rose-100">Couldn&apos;t load {possessive(personView.name)} movies</p>
                    <button type="button" className="btn btn-secondary self-start px-4 py-2 text-sm" onClick={discovery.retryCredits}>
                        Try again
                    </button>
                </div>
            )}
            {!personView && searchResults.length > 0 && searchPage < totalPages && (
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
            {((isSearching && searchResults.length === 0 && !personView) || (personView && discovery.credits.status === "loading")) && (
              // The same height as a real row, so nothing moves when results land.
              <div className="mt-2 space-y-1.5" aria-hidden="true" data-testid="search-skeleton">
                {[0, 1, 2, 3].map((placeholder) => (
                  <div
                    key={placeholder}
                    className="flex items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/35 p-2"
                  >
                    <div className="skeleton-block h-[66px] w-11 flex-shrink-0 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton-block h-3 w-3/5 rounded" />
                      <div className="skeleton-block h-2.5 w-1/5 rounded" />
                      <div className="skeleton-block h-2.5 w-2/5 rounded" />
                    </div>
                    <div className="h-11 w-11 flex-shrink-0 rounded-xl bg-slate-800/70" />
                  </div>
                ))}
              </div>
            )}
            {searchError && (
              <div
                className="mt-2 rounded-lg border border-rose-900/60 bg-rose-950/50 px-3 py-2 text-sm text-rose-300"
                role="alert"
              >
                {searchError}
              </div>
            )}
            {searchFailure && !isSearching && !personView && (
              <div
                className="mt-2 flex flex-col gap-2.5 rounded-2xl border border-rose-900/70 bg-rose-950/45 p-3.5"
                role="alert"
              >
                <div>
                  {/* The line below says whether it is the connection or the
                      service; the heading must not blame either. */}
                  <p className="font-semibold text-rose-100">Couldn&apos;t search right now</p>
                  <p className="mt-0.5 text-sm text-rose-300">
                    <span>{searchFailure}</span> <span>Your search is still here.</span>
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary self-start px-4 py-2 text-sm"
                  onClick={() => handleSearch(searchTerm)}
                  disabled={isAdding}
                >
                  Try again
                </button>
              </div>
            )}
            {!personView && !searchFailure && !isSearching && searchTerm.trim() && searchResults.length === 0 && visiblePeople.length === 0 && (
              // Nothing matched, so the custom slip becomes the main action,
              // drawn as the paper it will be in the bowl. It stays beside an
              // add error, which is the only way to retry that add.
              <div className="mt-2 flex flex-col gap-3.5 px-0.5 py-2">
                <div>
                  <p className="font-semibold text-slate-100">
                    No movie or person matches &ldquo;{searchTerm.trim()}&rdquo;
                  </p>
                  <p className="mt-0.5 text-sm text-slate-400">
                    Check the spelling, or put it in as your own slip &mdash; titles and categories both work.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addCustomMovie}
                  className="flex max-w-full flex-col items-start gap-1.5 self-start rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70"
                  disabled={isAdding}
                  aria-label={isSubmitting ? "Adding…" : `Add "${searchTerm.trim()}"`}
                >
                  <span className="search-custom-slip" aria-hidden="true">{searchTerm.trim()}</span>
                  <span className="pl-0.5 text-sm font-bold text-rose-300" aria-hidden="true">
                    {isSubmitting ? "Adding…" : "Add it as a custom slip"}
                  </span>
                </button>
              </div>
            )}
            {/* A name that matched people and no titles still gets the slip:
                "something with Tom Hanks" is a slip people really make. It is
                never offered from a person's movies, so choosing a person can
                never leave a slip with their name on it. */}
            {!personView && searchTerm.trim() && !isSearching && (searchResults.length > 0 || searchFailure || visiblePeople.length > 0) && (
              <button
                type="button"
                onClick={addCustomMovie}
                className="mt-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-dashed border-slate-700 px-3.5 text-left text-sm text-slate-400 transition hover:border-slate-600 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 disabled:opacity-45"
                disabled={isAdding}
                aria-label={isSubmitting ? "Adding…" : `Add "${searchTerm.trim()}"`}
              >
                <span aria-hidden="true">
                  {isSubmitting ? "Adding…" : <>Not here? Add &ldquo;{searchTerm.trim()}&rdquo; as a custom slip</>}
                </span>
                <span className="font-bold text-rose-300" aria-hidden="true">+</span>
              </button>
            )}

            {searchFooter}
            </div>
            {!hideResults && alternateBody && <div className="bowl-add-scroll">{alternateBody}</div>}
          </div>
            {detailMovie && (
              <AddMovieModal
                inline={inlineDetails}
                inlineBackLabel={personView ? `Back to ${possessive(personView.name)} movies` : "Back to search"}
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
                    finishSuccessfulAdd();
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
