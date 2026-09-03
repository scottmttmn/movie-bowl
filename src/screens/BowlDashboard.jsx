import { useEffect, useMemo, useRef, useState } from "react";
import HoldToDrawButton from "../components/HoldToDrawButton";
import BowlStatLine from "../components/BowlStatLine";
import WatchedMoviesStrip from "../components/WatchedMoviesStrip";
import MyMoviesStrip from "../components/MyMoviesStrip";
import AddMovieButton from "../components/AddMovieButton";
import FilterChipSelect from "../components/FilterChipSelect";
import BowlIllustration from "../components/BowlIllustration";
import DrawMethodInfoModal from "../components/DrawMethodInfoModal";
import BowlPicker from "../components/BowlPicker";
import CreateBowlModal from "../components/CreateBowlModal";
import useCreateBowl from "../hooks/useCreateBowl";
import useUserBowls from "../hooks/useUserBowls";
import useBowl from "../hooks/useBowl";
import useDrawProviderLinks from "../hooks/useDrawProviderLinks";
import useUserStreamingServices from "../hooks/useUserStreamingServices";
import useAutosave from "../hooks/useAutosave";
import AutosaveStatus from "../components/AutosaveStatus";
import { STREAMING_MATCH_STATUS } from "../utils/streamingMatchSummary";
import useDrawPoolCount, { DRAW_POOL_STATUS } from "../hooks/useDrawPoolCount";
import useMyMovieEligibility, { MY_MOVIE_ELIGIBILITY_STATUS } from "../hooks/useMyMovieEligibility";
import AddMovieModal from "../components/AddMovieModal";
import DrawAnimationModal from "../components/DrawAnimationModal";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getTmdbMovieDetails } from "../lib/tmdbApi";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { MAX_BOWLS_PER_USER, MAX_UNDRAWN_MOVIES_PER_BOWL } from "../utils/appLimits";
import { MPAA_RATING_OPTIONS } from "../utils/movieRatings";
import { matchUserServices } from "../utils/streamingServices";
import { resolvePreferredLaunchTarget } from "../utils/webLaunch";
import useBowlAdd from "../hooks/useBowlAdd";
import { notifyBowlChange } from "../lib/bowlChanges";
import {
  DEFAULT_DRAW_SETTINGS,
  RUNTIME_FILTER_MAX_MINUTES,
  RUNTIME_FILTER_MIN_MINUTES,
} from "../utils/drawSettings";
import { DEFAULT_DRAW_METHOD, getDrawMethod, normalizeDrawMethod } from "../utils/drawMethods";


export default function BowlDashboard() {
    const DRAW_ACCESS_MODE_ALL = "all_members";
    const DRAW_ACCESS_MODE_SELECTED = "selected_members";
    
    const { bowlId } = useParams();
    const [drawMethod, setDrawMethod] = useState(DEFAULT_DRAW_METHOD);
    const {
      bowl,
      isLoading,
      errorMessage,
      handleDraw,
      handleUpdateMovieNote,
      handleSetMoviePin,
      handleDeleteMovie,
      handleReaddMovie,
      filterMetadataFetchers,
    } = useBowl(bowlId, { drawMethod });

    const bowlAdd = useBowlAdd();
    const [accessError, setAccessError] = useState(null);
    const [accessAttempt, setAccessAttempt] = useState(0);
    const [drawnMovie, setDrawnMovie] = useState(null);
    const { providerLinks, startLookup: startProviderLookup } = useDrawProviderLinks(bowlId, drawnMovie);
    const [selectedDetailMovie, setSelectedDetailMovie] = useState(null);
    const [selectedDetailContext, setSelectedDetailContext] = useState(null);
    const [showWatched, setShowWatched] = useState(false);
    const [prioritizeStreaming, setPrioritizeStreaming] = useState(false);
    const [useStreamingRank, setUseStreamingRank] = useState(true);
    const [selectedRatings, setSelectedRatings] = useState(MPAA_RATING_OPTIONS);
    const [includeUnknownRatings, setIncludeUnknownRatings] = useState(true);
    const [selectedGenres, setSelectedGenres] = useState(null);
    const [includeUnknownGenres, setIncludeUnknownGenres] = useState(true);
    const [runtimeMinMinutes, setRuntimeMinMinutes] = useState(RUNTIME_FILTER_MIN_MINUTES);
    const [runtimeMaxMinutes, setRuntimeMaxMinutes] = useState(RUNTIME_FILTER_MAX_MINUTES);
    const [includeUnknownRuntime, setIncludeUnknownRuntime] = useState(true);
    const [showDrawFilters, setShowDrawFilters] = useState(false);
    const filterDialogRef = useRef(null);
    const [showRatingFilters, setShowRatingFilters] = useState(false);
    const [showGenreFilters, setShowGenreFilters] = useState(false);
    const [showRuntimeFilters, setShowRuntimeFilters] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawAnimationTitle, setDrawAnimationTitle] = useState("");
    const [showDrawConfirm, setShowDrawConfirm] = useState(false);
    const [showMethodInfo, setShowMethodInfo] = useState(false);
    const [bowlName, setBowlName] = useState("");
    const [bowlOwnerId, setBowlOwnerId] = useState(null);
    const [drawAccessMode, setDrawAccessMode] = useState(DRAW_ACCESS_MODE_ALL);
    const [drawAllowedUserIds, setDrawAllowedUserIds] = useState([]);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [memberIds, setMemberIds] = useState([]);
    const [addGuardMessage, setAddGuardMessage] = useState(null);
    const [myMoviesErrorMessage, setMyMoviesErrorMessage] = useState(null);
    const [readdErrorMessage, setReaddErrorMessage] = useState(null);
    const [pendingReaddMovie, setPendingReaddMovie] = useState(null);
    const [isReadding, setIsReadding] = useState(false);
    const [didApplyDefaultDrawSettings, setDidApplyDefaultDrawSettings] = useState(false);
    const {
      streamingServices: userStreamingServices,
      defaultDrawSettings,
      loading: isLoadingUserPreferences,
      loadError: preferencesLoadError,
      reloadStreamingServices: reloadUserPreferences,
      saveDefaultDrawSettings,
    } = useUserStreamingServices();

    const rememberedFilters = useMemo(() => ({
      prioritizeStreaming,
      useStreamingRank,
      selectedRatings,
      includeUnknownRatings,
      selectedGenres,
      includeUnknownGenres,
      runtimeMinMinutes,
      runtimeMaxMinutes,
      includeUnknownRuntime,
    }), [prioritizeStreaming, useStreamingRank, selectedRatings, includeUnknownRatings,
      selectedGenres, includeUnknownGenres, runtimeMinMinutes, runtimeMaxMinutes, includeUnknownRuntime]);
    const { status: filterSaveStatus, retry: retryFilterSave } = useAutosave({
      value: rememberedFilters,
      save: saveDefaultDrawSettings,
      enabled: didApplyDefaultDrawSettings && !isLoadingUserPreferences && !preferencesLoadError,
    });

    useEffect(() => {
      if (!showDrawFilters) return;
      const dialog = filterDialogRef.current;
      const previousFocus = document.activeElement;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      dialog?.focus();
      const handleKeyDown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setShowDrawFilters(false);
        }
        if (event.key !== "Tab") return;
        const controls = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href], select:not(:disabled)')];
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      };
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = previousOverflow;
        document.removeEventListener("keydown", handleKeyDown);
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      };
    }, [showDrawFilters]);

    const isDrawFilteredByServices = prioritizeStreaming && userStreamingServices.length > 0;

    const navigate = useNavigate();

    // The account-wide bowl context already loads app-wide for the nav and
    // global Add; the picker is another reader of it, never a second query.
    const {
      bowls: accountBowls,
      defaultBowlId,
      loading: isBowlContextLoading,
      error: bowlContextError,
      refresh: refreshBowlContext,
      setDefaultBowl,
      savingDefault,
    } = useUserBowls();
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const pickerTriggerRef = useRef(null);
    const [homeMessage, setHomeMessage] = useState(null);
    const [homeError, setHomeError] = useState(null);
    const ownedBowlCount = accountBowls.filter((entry) => entry.role === "Owner").length;
    const {
      actionMessage: createActionMessage,
      bowlName: newBowlName,
      close: closeCreateBowl,
      create: submitCreateBowl,
      errorMessage: createErrorMessage,
      inviteEmails: createInviteEmails,
      isCreating: isCreatingBowl,
      isLimitReached: isCreateBowlLimitReached,
      isOpen: isCreateBowlOpen,
      open: openCreateBowl,
      setBowlName: setNewBowlName,
      setInviteEmails: setCreateInviteEmails,
    } = useCreateBowl({ ownedBowlCount, refresh: refreshBowlContext });
    const isCurrentBowlHome = Boolean(defaultBowlId) && defaultBowlId === bowlId;
    const knownBowlName = accountBowls.find((entry) => entry.id === bowlId)?.name || "";
    const displayBowlName = bowlName || knownBowlName;

    // Opening a bowl is a visit; it never moves the home designation. Push so
    // browser Back returns to the bowl the person came from -- the header no
    // longer has a Back button, so history is the only way back.
    const handleSelectBowl = (nextBowlId) => {
      setIsPickerOpen(false);
      if (nextBowlId !== bowlId) navigate(`/bowl/${nextBowlId}`);
    };

    const handleMakeHome = async () => {
      setHomeMessage(null);
      setHomeError(null);
      const context = await setDefaultBowl(bowlId);
      if (context?.defaultBowlId === bowlId) {
        setHomeMessage(`${displayBowlName} is now your home bowl.`);
      } else {
        setHomeError("Could not change your home bowl. Please try again.");
      }
    };

    const handleCreateFromPicker = () => {
      setIsPickerOpen(false);
      openCreateBowl();
    };

    const handleCreateBowl = async () => {
      const result = await submitCreateBowl();
      if (result?.ok && result.bowl?.id) navigate(`/bowl/${result.bowl.id}`);
    };

    const isAddBlockedByUndrawnLimit = (bowl.remaining || []).length >= MAX_UNDRAWN_MOVIES_PER_BOWL;
    const isAddBlocked = isAddBlockedByUndrawnLimit;
    const isCurrentUserOwner = Boolean(currentUserId && bowlOwnerId && currentUserId === bowlOwnerId);
    const isCurrentUserMember = Boolean(currentUserId && memberIds.includes(currentUserId));
    const canCurrentUserDraw = useMemo(() => {
      if (!currentUserId) return false;
      if (isCurrentUserOwner) return true;
      if (!isCurrentUserMember) return false;
      if (drawAccessMode === DRAW_ACCESS_MODE_SELECTED) {
        return drawAllowedUserIds.includes(currentUserId);
      }
      return true;
    }, [currentUserId, isCurrentUserOwner, isCurrentUserMember, drawAccessMode, drawAllowedUserIds]);
    const drawGuardMessage = useMemo(() => {
      if (!currentUserId || canCurrentUserDraw) return null;
      if (drawAccessMode === DRAW_ACCESS_MODE_SELECTED) {
        return "Only selected members can draw in this bowl. Ask the owner to update draw access.";
      }
      return "You do not have permission to draw from this bowl.";
    }, [currentUserId, canCurrentUserDraw, drawAccessMode]);
    const myRemainingAdds = useMemo(
      () => (bowl.remaining || []).filter((movie) => movie.added_by === currentUserId),
      [bowl.remaining, currentUserId]
    );
    const myMovies = useMemo(
      () => myRemainingAdds.map((movie) => ({
        ...movie,
        source: "added",
      })),
      [myRemainingAdds]
    );
    const availableDrawGenres = useMemo(() => {
      const genreSet = new Set();
      (bowl.remaining || []).forEach((movie) => {
        if (!Array.isArray(movie?.genres)) return;
        movie.genres.forEach((genre) => {
          const value =
            typeof genre === "string"
              ? genre.trim()
              : genre?.name
                ? String(genre.name).trim()
                : "";
          if (value) genreSet.add(value);
        });
      });
      return Array.from(genreSet).sort((a, b) => a.localeCompare(b));
    }, [bowl.remaining]);
    const selectedDrawGenres = useMemo(() => {
      if (!Array.isArray(selectedGenres)) return availableDrawGenres;
      const available = new Set(availableDrawGenres);
      return selectedGenres.filter((genre) => available.has(genre));
    }, [selectedGenres, availableDrawGenres]);
    const drawGenreOptions = useMemo(
      () => [...new Set([...availableDrawGenres, ...(selectedGenres || [])])].sort((a, b) => a.localeCompare(b)),
      [availableDrawGenres, selectedGenres]
    );
    const activeRatingSelections = useMemo(
      () =>
        selectedRatings.filter((rating) => MPAA_RATING_OPTIONS.includes(rating)),
      [selectedRatings]
    );
    const ratingSummary = useMemo(() => {
      const selectedCount = selectedRatings.length;
      if (selectedCount === MPAA_RATING_OPTIONS.length && includeUnknownRatings) return "All ratings";
      if (selectedCount === 0 && !includeUnknownRatings) return "No ratings selected";
      const parts = [];
      if (selectedCount === MPAA_RATING_OPTIONS.length) {
        parts.push("All rated");
      } else if (selectedCount > 0) {
        parts.push(selectedRatings.join(", "));
      }
      if (includeUnknownRatings) parts.push("Unknown");
      return parts.join(" • ");
    }, [selectedRatings, includeUnknownRatings]);
    const genreSummary = useMemo(() => {
      const activeGenres = Array.isArray(selectedGenres) ? selectedGenres : availableDrawGenres;
      if (activeGenres.length === 0 && !includeUnknownGenres) return "No genres selected";
      if (!Array.isArray(selectedGenres) && includeUnknownGenres) return "All genres";
      const parts = [];
      if (!Array.isArray(selectedGenres)) {
        parts.push("All listed genres");
      } else if (activeGenres.length <= 3) {
        parts.push(activeGenres.join(", "));
      } else {
        parts.push(`${activeGenres.length} genres`);
      }
      if (includeUnknownGenres) parts.push("Unknown");
      return parts.filter(Boolean).join(" • ");
    }, [selectedGenres, availableDrawGenres, includeUnknownGenres]);
    const runtimeSummary = useMemo(() => {
      const base = `${runtimeMinMinutes}-${runtimeMaxMinutes} min`;
      return includeUnknownRuntime ? `${base} • Unknown` : base;
    }, [runtimeMinMinutes, runtimeMaxMinutes, includeUnknownRuntime]);
    // One filter object for both the pool count and the draw itself, so the
    // number on screen cannot drift from what the draw actually applies.
    const drawFilters = useMemo(
      () => ({
        prioritizeByServices: isDrawFilteredByServices,
        prioritizeByServiceRank: useStreamingRank,
        userStreamingServices,
        ratingFilter: {
          allowedRatings: selectedRatings,
          includeUnknown: includeUnknownRatings,
        },
        genreFilter: {
          allowedGenres: selectedDrawGenres,
          includeUnknown: includeUnknownGenres,
        },
        runtimeFilter: {
          minMinutes: runtimeMinMinutes,
          maxMinutes: runtimeMaxMinutes,
          includeUnknown: includeUnknownRuntime,
        },
      }),
      [
        isDrawFilteredByServices,
        useStreamingRank,
        userStreamingServices,
        selectedRatings,
        includeUnknownRatings,
        selectedDrawGenres,
        includeUnknownGenres,
        runtimeMinMinutes,
        runtimeMaxMinutes,
        includeUnknownRuntime,
      ]
    );
    const {
      status: drawPoolStatus,
      poolCount: drawPoolCount,
      totalCount: drawPoolTotalCount,
      contributorReach: drawPoolContributorReach,
      streamingMatch: drawPoolStreamingMatch,
      eligibleMovieIds: drawPoolEligibleMovieIds,
      lookupProgress: drawPoolLookupProgress,
      runLookups: runDrawPoolLookups,
    } = useDrawPoolCount(bowl.remaining, drawFilters, filterMetadataFetchers);
    const drawPoolLookupCompleted = drawPoolLookupProgress?.completed || 0;
    const drawPoolLookupTotal = drawPoolLookupProgress?.total || 0;
    const drawPoolLookupPercent = drawPoolLookupTotal > 0
      ? Math.min(100, Math.round((drawPoolLookupCompleted / drawPoolLookupTotal) * 100))
      : 0;
    const {
      status: myMovieEligibilityStatus,
      eligibleMovieIds: eligibleMyMovieIds,
      runLookups: runMyMovieEligibilityLookups,
    } = useMyMovieEligibility(bowl.remaining, myMovies, drawFilters, {
      enabled: didApplyDefaultDrawSettings && myMovies.length > 0,
      ...filterMetadataFetchers,
      sharedEligibleMovieIds: drawPoolEligibleMovieIds,
      isSharedEligibilityPending: drawPoolStatus === DRAW_POOL_STATUS.counting,
    });
    const selectedOwnedMovie = selectedDetailContext === "myAdds"
      ? myMovies.find((movie) => movie.id === selectedDetailMovie?.id)
      : null;
    const canManageDetailPin = Boolean(
      selectedOwnedMovie && !selectedOwnedMovie.drawn_at &&
      !selectedOwnedMovie.added_by_name && !selectedOwnedMovie.added_via_link_id &&
      selectedOwnedMovie.local_status !== "syncing"
    );
    const detailPinExcluded = canManageDetailPin &&
      myMovieEligibilityStatus === MY_MOVIE_ELIGIBILITY_STATUS.ready &&
      !eligibleMyMovieIds.some((id) => String(id) === String(selectedOwnedMovie.id));
    const detailPinDisabledReason = !getDrawMethod(drawMethod).honorsPin
      ? getDrawMethod(drawMethod).pinNote
      : detailPinExcluded
        ? "This movie is outside tonight's filters, so its pin won't affect this draw. Change the filters to pin or unpin it."
        : "";
    const hasResolvedPrioritizedPool =
      isDrawFilteredByServices &&
      drawPoolTotalCount > 0 &&
      (drawPoolStatus === DRAW_POOL_STATUS.ready ||
        drawPoolStatus === DRAW_POOL_STATUS.unfiltered);
    // Streaming only says anything when it is narrowing the draw. With priority
    // off it changes nothing, so there is no readout and nothing to scan for.
    const displayedStreamingStatus = hasResolvedPrioritizedPool
      ? STREAMING_MATCH_STATUS.ready
      : STREAMING_MATCH_STATUS.unavailable;
    const displayedStreamingMatch = hasResolvedPrioritizedPool
      ? drawPoolStreamingMatch
      : { matchCount: 0, topService: null, topServiceCount: 0 };
    // "Engaged" means a selection that could narrow the draw exists, whether
    // or not it currently removes anything — the dot marks set state, not
    // effect, so it cannot flicker as the bowl's contents change.
    const isFilterEngaged = useMemo(
      () =>
        isDrawFilteredByServices ||
        selectedRatings.length < MPAA_RATING_OPTIONS.length ||
        !includeUnknownRatings ||
        Array.isArray(selectedGenres) ||
        !includeUnknownGenres ||
        runtimeMinMinutes > RUNTIME_FILTER_MIN_MINUTES ||
        runtimeMaxMinutes < RUNTIME_FILTER_MAX_MINUTES ||
        !includeUnknownRuntime,
      [
        isDrawFilteredByServices,
        selectedRatings,
        includeUnknownRatings,
        selectedGenres,
        includeUnknownGenres,
        runtimeMinMinutes,
        runtimeMaxMinutes,
        includeUnknownRuntime,
      ]
    );
    const resetDrawFilters = () => {
      setSelectedRatings(MPAA_RATING_OPTIONS);
      setIncludeUnknownRatings(true);
      setSelectedGenres(null);
      setIncludeUnknownGenres(true);
      setRuntimeMinMinutes(RUNTIME_FILTER_MIN_MINUTES);
      setRuntimeMaxMinutes(RUNTIME_FILTER_MAX_MINUTES);
      setIncludeUnknownRuntime(true);
      setPrioritizeStreaming(false);
      setUseStreamingRank(true);
    };
    const drawMethodBucketsByContributor = getDrawMethod(drawMethod).bucketsByContributor;
    const drawnMovieMatchingProviders = useMemo(
      () => (drawnMovie ? matchUserServices(drawnMovie.streamingProviders || [], userStreamingServices) : []),
      [drawnMovie, userStreamingServices]
    );
    const preferredWebLaunchCandidate = useMemo(() => {
      if (!drawnMovie || !defaultDrawSettings.enablePreferredWebLaunch) return null;
      if (drawnMovieMatchingProviders.length === 0) return null;

      return resolvePreferredLaunchTarget({
        providerLinks,
        userServices: userStreamingServices,
        movieProviders: drawnMovie.streamingProviders || [],
        title: drawnMovie.title || "",
      });
    }, [
      drawnMovie,
      defaultDrawSettings.enablePreferredWebLaunch,
      drawnMovieMatchingProviders,
      userStreamingServices,
      providerLinks,
    ]);

    useEffect(() => {
      if (didApplyDefaultDrawSettings || isLoadingUserPreferences || preferencesLoadError) return;

      const defaults = defaultDrawSettings || DEFAULT_DRAW_SETTINGS;
      setPrioritizeStreaming(Boolean(defaults.prioritizeStreaming));
      setUseStreamingRank(Boolean(defaults.useStreamingRank));
      setSelectedRatings(defaults.selectedRatings || MPAA_RATING_OPTIONS);
      setIncludeUnknownRatings(Boolean(defaults.includeUnknownRatings));
      setSelectedGenres(defaults.selectedGenres ?? null);
      setIncludeUnknownGenres(Boolean(defaults.includeUnknownGenres));
      setRuntimeMinMinutes(defaults.runtimeMinMinutes ?? DEFAULT_DRAW_SETTINGS.runtimeMinMinutes);
      setRuntimeMaxMinutes(defaults.runtimeMaxMinutes ?? DEFAULT_DRAW_SETTINGS.runtimeMaxMinutes);
      setIncludeUnknownRuntime(Boolean(defaults.includeUnknownRuntime));
      setDidApplyDefaultDrawSettings(true);
    }, [defaultDrawSettings, didApplyDefaultDrawSettings, isLoadingUserPreferences, preferencesLoadError]);

    useEffect(() => {
      let cancelled = false;

      const isMissingDrawAccessColumn = (error) =>
        String(error?.message || "").toLowerCase().includes("draw_access_mode");
      const isMissingDrawMethodColumn = (error) =>
        String(error?.message || "").toLowerCase().includes("draw_method");
      const isMissingDrawPermissionsTable = (error) => {
        const text = String(error?.message || "").toLowerCase();
        return text.includes("bowl_draw_permissions") && text.includes("does not exist");
      };

      const abandonBowl = (userId) => {
        if (cancelled) return;
        notifyBowlChange({ userId, bowlId });
        navigate("/bowls", { replace: true });
      };
      const failAccessRead = () => {
        if (!cancelled) setAccessError("Could not load this bowl. Please try again.");
      };

      const loadBowlName = async () => {
        if (!bowlId) return;
        if (!cancelled) setAccessError(null);

        const { data: authData, error: authError } = await supabase.auth.getSession();
        const userId = authData?.session?.user?.id;
        if (authError) { failAccessRead(); return; }
        if (!userId) {
          abandonBowl(userId);
          return;
        }
        if (!cancelled) setCurrentUserId(userId);

        // Frontend can reach users before the migration is applied, so each
        // optional column is dropped one at a time. Falling back past
        // draw_access_mode for a missing draw_method would quietly widen who
        // the screen thinks can draw.
        let { data, error } = await supabase
          .from("bowls")
          .select("name, owner_id, draw_access_mode, draw_method")
          .eq("id", bowlId)
          .single();

        if (error && isMissingDrawMethodColumn(error)) {
          const fallback = await supabase
            .from("bowls")
            .select("name, owner_id, draw_access_mode")
            .eq("id", bowlId)
            .single();
          data = fallback.data;
          error = fallback.error;
        }

        if (error && isMissingDrawAccessColumn(error)) {
          const fallback = await supabase
            .from("bowls")
            .select("name, owner_id")
            .eq("id", bowlId)
            .single();
          data = fallback.data;
          error = fallback.error;
        }

        if (cancelled) return;
        if (error && error.code !== "PGRST116") { failAccessRead(); return; }
        if (!data) {
          abandonBowl(userId);
          return;
        }

        const isOwner = data.owner_id === userId;
        if (!isOwner) {
          const { data: memberRow, error: memberError } = await supabase
            .from("bowl_members")
            .select("user_id")
            .eq("bowl_id", bowlId)
            .eq("user_id", userId)
            .maybeSingle();

          if (memberError) { failAccessRead(); return; }
          if (!memberRow) {
            abandonBowl(userId);
            return;
          }
        }

        const { data: memberRows, error: membersError } = await supabase
          .from("bowl_members")
          .select("user_id")
          .eq("bowl_id", bowlId);

        if (membersError) {
          if (!cancelled) {
            setMemberIds([]);
          }
        } else if (!cancelled) {
          setMemberIds((memberRows || []).map((row) => row.user_id).filter(Boolean));
        }

        const { data: drawPermissionRows, error: drawPermissionsError } = await supabase
          .from("bowl_draw_permissions")
          .select("user_id")
          .eq("bowl_id", bowlId);

        if (drawPermissionsError) {
          if (!isMissingDrawPermissionsTable(drawPermissionsError)) {
            console.error("[BowlDashboard] Failed to load draw permissions", drawPermissionsError);
          }
          if (!cancelled) setDrawAllowedUserIds([]);
        } else if (!cancelled) {
          setDrawAllowedUserIds((drawPermissionRows || []).map((row) => row.user_id).filter(Boolean));
        }

        setBowlName(data?.name || "");
        setBowlOwnerId(data?.owner_id || null);
        setDrawAccessMode(
          data?.draw_access_mode === DRAW_ACCESS_MODE_SELECTED
            ? DRAW_ACCESS_MODE_SELECTED
            : DRAW_ACCESS_MODE_ALL
        );
        setDrawMethod(normalizeDrawMethod(data?.draw_method));
      };

      loadBowlName();

      return () => {
        cancelled = true;
      };
    }, [bowlId, navigate, accessAttempt]);

    const buildDetailMovie = async (movie) => {
      const tmdbId = Number(movie?.tmdb_id ?? movie?.id);
      const shouldFetchTmdbDetails = Number.isInteger(tmdbId) && tmdbId > 0;

      if (!shouldFetchTmdbDetails) {
        return {
          ...movie,
          streamingProviders: movie.streamingProviders || [],
          streamingRegion: movie.streamingRegion || "US",
          streamingFetchedAt: movie.streamingFetchedAt || null,
        };
      }

      const [detailsResult, providersResult] = await Promise.allSettled([
        getTmdbMovieDetails(tmdbId),
        filterMetadataFetchers?.fetchProviders
          ? filterMetadataFetchers.fetchProviders(tmdbId)
          : fetchStreamingProviders(tmdbId, { region: "US" }),
      ]);

      if (detailsResult.status === "rejected") {
        console.error("[BowlDashboard] Failed to load TMDB detail enrichment", detailsResult.reason);
      }
      if (providersResult.status === "rejected") {
        console.error("[BowlDashboard] Failed to load streaming provider enrichment", providersResult.reason);
      }

      const details = detailsResult.status === "fulfilled" ? detailsResult.value : null;
      const providerData =
        providersResult.status === "fulfilled"
          ? providersResult.value
          : { providers: [], region: "US", fetchedAt: null };

      return {
        ...(details || {}),
        ...movie,
        drawEventId: movie?.drawEventId ?? movie?.id ?? null,
        bowlMovieId: movie?.bowlMovieId ?? null,
        streamingProviders: providerData.providers || [],
        streamingRegion: providerData.region || "US",
        streamingFetchedAt: providerData.fetchedAt || null,
      };
    };

    // Fired by a completed hold on the draw button, or by the keyboard path's
    // confirm dialog — both arrive here with intent already established.
    const runDraw = async () => {
      if (isDrawing || !canCurrentUserDraw || bowl.remaining.length === 0) return;
      setShowDrawConfirm(false);
      setDrawAnimationTitle("");
      setIsDrawing(true);

      try {
        const minAnimationDelay = new Promise((resolve) => setTimeout(resolve, 1500));
        const drawPromise = handleDraw({
          prioritizeByServices: prioritizeStreaming,
          prioritizeByServiceRank: useStreamingRank,
          userStreamingServices,
          ...drawFilters,
        }).then((movie) => {
          startProviderLookup(movie);
          if (movie?.title) {
            setDrawAnimationTitle(movie.title);
          }
          return movie;
        });

        const [movie] = await Promise.all([drawPromise, minAnimationDelay]);
        if (movie) {
          const detailMovie = await buildDetailMovie(movie);
          setDrawnMovie(detailMovie);
        }
      } finally {
        setIsDrawing(false);
        setDrawAnimationTitle("");
      }
    };

    if (accessError) return <div className="page-container py-8"><div className="status-error" role="alert">
      {accessError}
      <button className="btn btn-secondary ml-3" onClick={() => setAccessAttempt((attempt) => attempt + 1)}>Retry</button>
      <Link className="btn btn-ghost ml-2" to="/bowls">Browse bowls</Link>
    </div></div>;

return (
    <div className="bowl-dashboard page-container overflow-hidden pb-12 pt-5 sm:pt-7">
        <header className="mb-5 flex min-w-0 items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="min-w-0">
                    <button
                      type="button"
                      ref={pickerTriggerRef}
                      onClick={() => setIsPickerOpen((prev) => !prev)}
                      aria-haspopup="dialog"
                      aria-expanded={isPickerOpen}
                      aria-label={`Switch bowl. Current bowl: ${displayBowlName}`}
                      className="mx-auto flex min-h-11 max-w-full items-center gap-2 rounded-xl px-2 text-2xl font-semibold tracking-tight text-slate-50 hover:bg-slate-800/60 sm:text-3xl"
                    >
                      <span className="min-w-0 truncate">{displayBowlName}</span>
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className={`h-4 w-4 shrink-0 motion-safe:transition-transform ${isPickerOpen ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                  </h1>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDrawFilters((prev) => !prev)}
                    className={`icon-btn relative ${showDrawFilters ? "border-rose-700 text-rose-300" : ""}`}
                    aria-label={showDrawFilters ? "Hide filters" : "Filters"}
                    title={showDrawFilters ? "Hide filters" : "Filters"}
                    aria-haspopup="dialog"
                    aria-expanded={showDrawFilters}
                    data-filter-active={isFilterEngaged ? "true" : undefined}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M4 6h16" />
                      <path d="M7 12h10" />
                      <path d="M10 18h4" />
                    </svg>
                    {isFilterEngaged && (
                      <span
                        aria-hidden="true"
                        className="absolute right-1 top-1 h-2 w-2 rounded-full border border-slate-950 bg-rose-500"
                      />
                    )}
                  </button>
                  <button onClick={() => navigate(`/bowl/${bowlId}/settings`)} className="icon-btn" aria-label="Bowl settings">⚙️</button>
                </div>
            </header>

            {isLoading && (
              <div className="panel mb-3 text-sm text-slate-400" role="status">Loading bowl…</div>
            )}
            {!isLoading && errorMessage && (
              <div className="status-error mb-3">{errorMessage}</div>
            )}
            {!showDrawFilters && (preferencesLoadError || filterSaveStatus === "error") && (
              <div className="status-error mb-3 flex flex-wrap items-center justify-between gap-3" role="alert">
                <p>{preferencesLoadError
                  ? "Couldn't load your saved filters. Retry before changing them."
                  : "Your filters work for this draw, but couldn't be saved for next time."}</p>
                <button type="button" className="btn btn-secondary" onClick={preferencesLoadError ? reloadUserPreferences : retryFilterSave}>
                  Retry
                </button>
              </div>
            )}

            <section className="page-hero relative my-3">
              {isCurrentBowlHome && (
                <span
                  className="absolute right-4 top-4 inline-flex text-rose-300"
                  title="Home bowl"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                    <path d="M12 3.2 2.8 11.1a1 1 0 0 0 .66 1.75H5v7.3a.9.9 0 0 0 .9.9h4.05v-5.2h4.1v5.2h4.05a.9.9 0 0 0 .9-.9v-7.3h1.54a1 1 0 0 0 .66-1.75Z" />
                  </svg>
                  <span className="sr-only">Home bowl</span>
                </span>
              )}
              <div className="mx-auto max-w-5xl">
                <div>
                  <BowlIllustration
                    drawTitle={drawAnimationTitle}
                    isDrawing={isDrawing}
                    className="mx-auto h-44 w-full max-w-2xl drop-shadow-2xl sm:h-48 md:h-52"
                  />
                </div>

                <BowlStatLine
                  poolStatus={drawPoolStatus}
                  poolCount={drawPoolCount}
                  poolTotalCount={drawPoolTotalCount}
                  contributorReach={drawPoolContributorReach}
                  showContributorReach={drawMethodBucketsByContributor}
                  onRunPoolLookups={runDrawPoolLookups}
                  streamingStatus={displayedStreamingStatus}
                  streamingMatchCount={displayedStreamingMatch.matchCount}
                  streamingTopService={displayedStreamingMatch.topService}
                  streamingTopServiceCount={displayedStreamingMatch.topServiceCount}
                  isPrioritized={isDrawFilteredByServices}
                  useServiceRank={useStreamingRank}
                  onOpenFilters={() => setShowDrawFilters(true)}
                  onOpenMethodInfo={() => setShowMethodInfo(true)}
                />

                <div className="mx-auto mt-4 flex w-full max-w-sm flex-col items-stretch gap-2.5">
                  <HoldToDrawButton
                    onHoldComplete={runDraw}
                    onKeyboardActivate={() => {
                      if (isDrawing || !canCurrentUserDraw || bowl.remaining.length === 0) return;
                      setShowDrawConfirm(true);
                    }}
                    isLoading={isDrawing}
                    disabled={!canCurrentUserDraw || bowl.remaining.length === 0}
                  />
                  <AddMovieButton
                    variant="secondary"
                    disabled={isAddBlocked}
                    onClick={() => {
                      setAddGuardMessage(null);
                      bowlAdd?.openBowlAdd(bowlId);
                    }}
                  />
                </div>
                {drawGuardMessage && (
                  <p className="mt-2 text-center text-sm text-amber-300">{drawGuardMessage}</p>
                )}

                {addGuardMessage && (
                  <p className="mt-2 text-center text-sm text-amber-300">{addGuardMessage}</p>
                )}
                {isAddBlockedByUndrawnLimit && (
                  <p className="mt-2 text-center text-sm text-amber-300">
                    Bowl is at the undrawn movie limit ({MAX_UNDRAWN_MOVIES_PER_BOWL}).
                  </p>
                )}
              </div>
            </section>

            {/* Anchored under the header rather than centered or bottom-sheeted:
                the filter icon lives up there, and the panel must be fully
                visible without scrolling the page. */}
            {showDrawFilters && (
              <div
                className="modal-overlay-top z-[70]"
                role="presentation"
                onClick={() => setShowDrawFilters(false)}
              >
                <div
                  className="modal-surface flex max-h-[calc(100dvh-5.5rem)] w-full max-w-xl flex-col overflow-clip rounded-t-none sm:max-w-md sm:rounded-3xl"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="draw-filters-title"
                  ref={filterDialogRef}
                  tabIndex={-1}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 px-4 py-3.5 sm:px-5">
                    <div>
                      <h3 id="draw-filters-title" className="text-lg font-semibold text-slate-100">
                        Narrow the draw
                      </h3>
                      {drawPoolStatus === DRAW_POOL_STATUS.manual ? (
                        <button
                          type="button"
                          onClick={runDrawPoolLookups}
                          className="mt-0.5 text-sm font-medium text-rose-300 hover:text-rose-200"
                        >
                          Preview filter matches
                        </button>
                      ) : (
                        <>
                          <p className="mt-0.5 text-sm text-slate-400">
                            {drawPoolStatus === DRAW_POOL_STATUS.counting
                              ? "Checking filter matches…"
                              : drawPoolStatus === DRAW_POOL_STATUS.ready
                                ? `${drawPoolCount} of ${drawPoolTotalCount} titles eligible`
                                : `All ${drawPoolTotalCount} titles eligible`}
                          </p>
                          {drawPoolStatus === DRAW_POOL_STATUS.counting && (
                            <div className="mt-2 w-full max-w-64">
                              <div
                                className="h-1.5 overflow-hidden rounded-full bg-slate-800"
                                role="progressbar"
                                aria-label="Filter lookup progress"
                                aria-valuemin={drawPoolLookupTotal > 0 ? 0 : undefined}
                                aria-valuemax={drawPoolLookupTotal > 0 ? drawPoolLookupTotal : undefined}
                                aria-valuenow={drawPoolLookupTotal > 0 ? drawPoolLookupCompleted : undefined}
                                aria-valuetext={
                                  drawPoolLookupTotal > 0
                                    ? `${drawPoolLookupCompleted} of ${drawPoolLookupTotal} titles checked`
                                    : "Applying local filters"
                                }
                              >
                                <span
                                  className={`block h-full rounded-full bg-rose-500 transition-[width] duration-200 ${
                                    drawPoolLookupTotal === 0 ? "w-1/3 animate-pulse" : ""
                                  }`}
                                  style={
                                    drawPoolLookupTotal > 0
                                      ? { width: `${drawPoolLookupPercent}%` }
                                      : undefined
                                  }
                                />
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                {drawPoolLookupTotal > 0
                                  ? `${drawPoolLookupCompleted} of ${drawPoolLookupTotal} titles checked`
                                  : "Applying local filters…"}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={resetDrawFilters}
                      className="btn btn-ghost px-3 py-1.5 text-sm text-rose-300"
                      disabled={!didApplyDefaultDrawSettings || isLoadingUserPreferences || Boolean(preferencesLoadError)}
                    >
                      Reset
                    </button>
                  </div>
                  <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
                    <fieldset
                      className="min-w-0 px-4 py-3.5 sm:px-5 disabled:opacity-50"
                      disabled={!didApplyDefaultDrawSettings || isLoadingUserPreferences || Boolean(preferencesLoadError)}
                      aria-label="Draw filters"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-left">
                          <p className="text-base font-semibold text-slate-100">Streaming Match Preferences</p>
                          <p className="text-sm text-slate-300">
                            Favor titles available on your selected services.
                          </p>
                        </div>
                        <label htmlFor="prioritize-streaming-draw" className="relative inline-flex items-center cursor-pointer">
                          <input
                            id="prioritize-streaming-draw"
                            name="prioritize_streaming_draw"
                            aria-label="Prioritize streaming services"
                            type="checkbox"
                            className="peer sr-only"
                            checked={prioritizeStreaming}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setPrioritizeStreaming(checked);
                              if (checked) setUseStreamingRank(true);
                            }}
                            disabled={userStreamingServices.length === 0}
                          />
                          <span className="h-6 w-11 rounded-full bg-slate-700 transition peer-checked:bg-rose-600 peer-disabled:bg-slate-800" />
                          <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-slate-900 shadow transition peer-checked:translate-x-5" />
                        </label>
                      </div>
                      {prioritizeStreaming && userStreamingServices.length > 0 && (
                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-700/70 pt-2.5">
                          <div className="text-left">
                            <p className="text-base font-semibold text-slate-100">Use my service ranking</p>
                            <p className="text-sm text-slate-300">If off, draw randomly from any matching service.</p>
                          </div>
                          <label htmlFor="use-streaming-rank-draw" className="relative inline-flex items-center cursor-pointer">
                            <input
                              id="use-streaming-rank-draw"
                              name="use_streaming_rank_draw"
                              aria-label="Use streaming service ranking"
                              type="checkbox"
                              className="peer sr-only"
                              checked={useStreamingRank}
                              onChange={(e) => setUseStreamingRank(e.target.checked)}
                            />
                            <span className="h-6 w-11 rounded-full bg-slate-700 transition peer-checked:bg-rose-600" />
                            <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-slate-900 shadow transition peer-checked:translate-x-5" />
                          </label>
                        </div>
                      )}
                      <div className="mt-2 text-left">
                        <button
                          type="button"
                          className="text-sm font-medium text-rose-300 hover:text-rose-200"
                          onClick={() => navigate("/settings#streaming-services")}
                        >
                          {userStreamingServices.length > 0 ? "Edit streaming service ranking" : "Choose streaming services"}
                        </button>
                      </div>
                      <div className="mt-3 border-t border-slate-700/70 pt-2.5 text-left">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-left"
                          onClick={() => setShowRatingFilters((prev) => !prev)}
                          aria-expanded={showRatingFilters}
                          aria-controls="draw-rating-filter-panel"
                        >
                          <div>
                            <p className="text-base font-semibold text-slate-100">Rating filter</p>
                            <p className="mt-0.5 text-sm text-slate-300">{ratingSummary}</p>
                          </div>
                          <span className="text-sm font-medium text-rose-300">
                            {showRatingFilters ? "Hide ratings" : "Edit ratings"}
                          </span>
                        </button>
                        {showRatingFilters && (
                          <div id="draw-rating-filter-panel" className="mt-2">
                            <FilterChipSelect
                              ariaLabel="Draw rating controls"
                              options={MPAA_RATING_OPTIONS}
                              selectedValues={activeRatingSelections}
                              optionAriaLabelPrefix="Draw rating"
                              onToggle={(rating) =>
                                setSelectedRatings((prev) =>
                                  prev.includes(rating)
                                    ? prev.filter((value) => value !== rating)
                                    : [...prev, rating]
                                )
                              }
                              onOnly={(rating) => setSelectedRatings([rating])}
                              onSelectAll={() => setSelectedRatings(MPAA_RATING_OPTIONS)}
                              onClear={() => setSelectedRatings([])}
                              unknownEnabled={includeUnknownRatings}
                              unknownLabel="Unrated/Unknown"
                              onToggleUnknown={setIncludeUnknownRatings}
                            />
                          </div>
                        )}
                      </div>
                      <div className="mt-3 border-t border-slate-700/70 pt-2.5 text-left">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-left"
                          onClick={() => setShowGenreFilters((prev) => !prev)}
                          aria-expanded={showGenreFilters}
                          aria-controls="draw-genre-filter-panel"
                        >
                          <div>
                            <p className="text-base font-semibold text-slate-100">Genre filter</p>
                            <p className="mt-0.5 text-sm text-slate-300">{genreSummary}</p>
                          </div>
                          <span className="text-sm font-medium text-rose-300">
                            {showGenreFilters ? "Hide genres" : "Edit genres"}
                          </span>
                        </button>
                        {showGenreFilters && (
                          <div id="draw-genre-filter-panel" className="mt-2">
                            {drawGenreOptions.length > 0 ? (
                              <FilterChipSelect
                                ariaLabel="Draw genre controls"
                                options={drawGenreOptions}
                                selectedValues={selectedGenres ?? availableDrawGenres}
                                optionAriaLabelPrefix="Draw genre"
                                onToggle={(genre) =>
                                  setSelectedGenres((prev) => {
                                    const base = Array.isArray(prev) ? prev : availableDrawGenres;
                                    return base.includes(genre)
                                      ? base.filter((value) => value !== genre)
                                      : [...base, genre];
                                  })
                                }
                                onOnly={(genre) => setSelectedGenres([genre])}
                                onSelectAll={() => setSelectedGenres(null)}
                                onClear={() => setSelectedGenres([])}
                                unknownEnabled={includeUnknownGenres}
                                unknownLabel="Uncategorized/Unknown"
                                onToggleUnknown={setIncludeUnknownGenres}
                              />
                            ) : (
                              <p className="text-xs text-slate-400">No genre data available for current bowl movies.</p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="mt-3 border-t border-slate-700/70 pt-2.5 text-left">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-left"
                          onClick={() => setShowRuntimeFilters((prev) => !prev)}
                          aria-expanded={showRuntimeFilters}
                          aria-controls="draw-runtime-filter-panel"
                        >
                          <div>
                            <p className="text-base font-semibold text-slate-100">Runtime filter</p>
                            <p className="mt-0.5 text-sm text-slate-300">{runtimeSummary}</p>
                          </div>
                          <span className="text-sm font-medium text-rose-300">
                            {showRuntimeFilters ? "Hide runtime" : "Edit runtime"}
                          </span>
                        </button>
                        {showRuntimeFilters && (
                          <div id="draw-runtime-filter-panel" className="mt-2 rounded-lg border border-slate-700 bg-slate-900 p-3">
                            <p className="text-sm text-slate-300">
                              Set the acceptable runtime range.
                            </p>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <label htmlFor="draw-runtime-min" className="text-sm text-slate-300">
                                Minimum minutes
                                <input
                                  id="draw-runtime-min"
                                  name="draw_runtime_min"
                                  aria-label="draw-runtime-min"
                                  type="number"
                                  min={RUNTIME_FILTER_MIN_MINUTES}
                                  max={runtimeMaxMinutes}
                                  value={runtimeMinMinutes}
                                  onChange={(event) => {
                                    const value = Number.parseInt(event.target.value || "0", 10);
                                    if (!Number.isFinite(value)) return;
                                    setRuntimeMinMinutes(Math.max(RUNTIME_FILTER_MIN_MINUTES, Math.min(runtimeMaxMinutes, value)));
                                  }}
                                  className="input-field mt-1 w-full text-sm"
                                />
                              </label>
                              <label htmlFor="draw-runtime-max" className="text-sm text-slate-300">
                                Maximum minutes
                                <input
                                  id="draw-runtime-max"
                                  name="draw_runtime_max"
                                  aria-label="draw-runtime-max"
                                  type="number"
                                  min={runtimeMinMinutes}
                                  max={RUNTIME_FILTER_MAX_MINUTES}
                                  value={runtimeMaxMinutes}
                                  onChange={(event) => {
                                    const value = Number.parseInt(event.target.value || "0", 10);
                                    if (!Number.isFinite(value)) return;
                                    setRuntimeMaxMinutes(Math.max(runtimeMinMinutes, Math.min(RUNTIME_FILTER_MAX_MINUTES, value)));
                                  }}
                                  className="input-field mt-1 w-full text-sm"
                                />
                              </label>
                            </div>
                            <div className="mt-3 space-y-3">
                              <label htmlFor="draw-runtime-min-slider" className="block text-xs text-slate-400">
                                Minimum runtime
                                <input
                                  id="draw-runtime-min-slider"
                                  name="draw_runtime_min_slider"
                                  aria-label="draw-runtime-min-slider"
                                  type="range"
                                  min={RUNTIME_FILTER_MIN_MINUTES}
                                  max={runtimeMaxMinutes}
                                  value={runtimeMinMinutes}
                                  onChange={(event) =>
                                    setRuntimeMinMinutes(
                                      Math.max(
                                        RUNTIME_FILTER_MIN_MINUTES,
                                        Math.min(runtimeMaxMinutes, Number.parseInt(event.target.value || "0", 10) || RUNTIME_FILTER_MIN_MINUTES)
                                      )
                                    )
                                  }
                                  className="mt-1 w-full"
                                />
                              </label>
                              <label htmlFor="draw-runtime-max-slider" className="block text-xs text-slate-400">
                                Maximum runtime
                                <input
                                  id="draw-runtime-max-slider"
                                  name="draw_runtime_max_slider"
                                  aria-label="draw-runtime-max-slider"
                                  type="range"
                                  min={runtimeMinMinutes}
                                  max={RUNTIME_FILTER_MAX_MINUTES}
                                  value={runtimeMaxMinutes}
                                  onChange={(event) =>
                                    setRuntimeMaxMinutes(
                                      Math.max(
                                        runtimeMinMinutes,
                                        Math.min(RUNTIME_FILTER_MAX_MINUTES, Number.parseInt(event.target.value || "0", 10) || RUNTIME_FILTER_MAX_MINUTES)
                                      )
                                    )
                                  }
                                  className="mt-1 w-full"
                                />
                              </label>
                            </div>
                            <label
                              htmlFor="draw-runtime-unknown"
                              className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-300"
                            >
                              <input
                                id="draw-runtime-unknown"
                                name="draw_runtime_unknown"
                                type="checkbox"
                                checked={includeUnknownRuntime}
                                onChange={(event) => setIncludeUnknownRuntime(event.target.checked)}
                              />
                              Include unknown runtime
                            </label>
                          </div>
                        )}
                      </div>
                      {userStreamingServices.length === 0 && (
                        <p className="mt-3 text-xs text-slate-400">
                          Add services in Settings to enable prioritized draw.
                        </p>
                      )}
                    </fieldset>
                  </div>
                  <div className="shrink-0 border-t border-slate-800 px-4 py-3 sm:px-5">
                    <div className="mb-3">
                      {preferencesLoadError ? (
                        <div role="alert" className="text-sm text-rose-300">
                          Couldn't load your saved filters.
                          <button type="button" className="ml-2 underline" onClick={reloadUserPreferences}>Retry</button>
                        </div>
                      ) : isLoadingUserPreferences ? (
                        <p role="status" className="text-sm text-slate-400">Loading saved filters…</p>
                      ) : (
                        <>
                          <AutosaveStatus status={filterSaveStatus} />
                          {filterSaveStatus === "error" ? (
                            <div role="alert" className="mt-1 text-sm text-rose-300">
                              These filters still work for this draw. Retry to remember them.
                              <button type="button" className="ml-2 underline" onClick={retryFilterSave}>Retry</button>
                            </div>
                          ) : (
                            <p className="mt-0.5 text-xs text-slate-400">Remembered across your bowls and TV.</p>
                          )}
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDrawFilters(false)}
                      className="btn btn-primary w-full"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}


            <section className="panel mt-5 w-full max-w-full min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div className="text-left">
                  <div className="flex items-baseline gap-2">
                    <h3 className="section-title text-base">My Movies</h3>
                    <span className="text-xs font-semibold text-slate-400">
                      {myMovies.length === 1 ? "1 movie" : `${myMovies.length} movies`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">Your undrawn picks in this bowl.</p>
                </div>
              </div>

              <div className="mt-3">
                {myMovies.length === 0 ? (
                  <p className="text-sm text-slate-400">You have no movies in this section.</p>
                ) : (
                  <MyMoviesStrip
                    movies={myMovies}
                    eligibilityStatus={myMovieEligibilityStatus}
                    eligibleMovieIds={eligibleMyMovieIds}
                    onRunEligibilityLookups={runMyMovieEligibilityLookups}
                    drawMethod={drawMethod}
                    onTogglePin={async (movie, pinned) => {
                      setMyMoviesErrorMessage(null);
                      const result = await handleSetMoviePin(movie.id, pinned);
                      if (!result.ok) {
                        setMyMoviesErrorMessage(result.message);
                      }
                    }}
                    onViewMovie={async (movie) => {
                      setSelectedDetailContext("myAdds");
                      setSelectedDetailMovie(await buildDetailMovie(movie));
                    }}
                    onDeleteMovie={async (movie) => {
                      setMyMoviesErrorMessage(null);
                      const shouldDelete = window.confirm(`Delete "${movie.title}" from this bowl?`);
                      if (!shouldDelete) return;
                      const deleted = await handleDeleteMovie(movie.id);
                      if (!deleted) {
                        setMyMoviesErrorMessage("Could not delete this movie. Please try again.");
                      }
                    }}
                  />
                )}
              </div>
              {myMoviesErrorMessage && <p className="mt-2 text-sm text-rose-300">{myMoviesErrorMessage}</p>}
            </section>

            <section className="panel mt-4 w-full max-w-full min-w-0 overflow-x-auto">
                <WatchedMoviesStrip
                  movies={bowl.watched}
                  isExpanded={showWatched}
                  onToggleExpanded={() => setShowWatched((prev) => !prev)}
                  onSelectMovie={async (movie) => {
                    setSelectedDetailContext("watched");
                    setSelectedDetailMovie(await buildDetailMovie(movie));
                  }}
                />
                {readdErrorMessage && (
                  <p className="mt-2 text-sm text-amber-300">{readdErrorMessage}</p>
                )}
            </section>
            

            {showMethodInfo && (
              <DrawMethodInfoModal
                drawMethod={drawMethod}
                contributorReach={drawPoolContributorReach}
                onClose={() => setShowMethodInfo(false)}
              />
            )}
            {showDrawConfirm && (
              <div className="modal-overlay z-[70]" role="presentation">
                <div className="modal-surface max-w-md p-5 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="draw-confirm-title">
                  <h3 id="draw-confirm-title" className="text-lg font-semibold text-slate-100">Reveal a movie?</h3>
                  <p className="mt-2 text-sm text-slate-400">
                    Drawing will reveal one hidden title from this bowl to everyone here.
                  </p>
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDrawConfirm(false)}
                      className="btn btn-secondary"
                      disabled={isDrawing}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={runDraw}
                      className="btn btn-danger"
                      disabled={isDrawing}
                    >
                      {isDrawing ? "Drawing..." : "Reveal Movie"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {drawnMovie && (
              <AddMovieModal
                movie={drawnMovie}
                userStreamingServices={userStreamingServices}
                webLaunchCandidate={
                  defaultDrawSettings.enablePreferredWebLaunch
                    ? preferredWebLaunchCandidate
                    : null
                }
                onClose={() => setDrawnMovie(null)}
              />
            )}
            {selectedDetailMovie && (
              <AddMovieModal
                movie={selectedDetailMovie}
                userStreamingServices={userStreamingServices}
                pinDisabledReason={detailPinDisabledReason}
                onTogglePin={canManageDetailPin
                  ? async (pinned) => {
                      const movieId = selectedDetailMovie.id;
                      const result = await handleSetMoviePin(movieId, pinned);
                      if (result?.ok) {
                        setSelectedDetailMovie((current) => current?.id === movieId
                          ? { ...current, is_pinned: result.movie?.is_pinned ?? pinned }
                          : current);
                      }
                      return result;
                    }
                  : null}
                detailPrimaryActionLabel={selectedDetailContext === "watched" ? "Move to Bowl" : null}
                onDetailPrimaryAction={
                  selectedDetailContext === "watched"
                    ? async (movie) => {
                        setReaddErrorMessage(null);
                        setSelectedDetailMovie(null);
                        setSelectedDetailContext(null);
                        setPendingReaddMovie(movie);
                      }
                    : null
                }
                onEditNote={
                  selectedDetailContext === "myAdds"
                    ? async (note) => {
                        const result = await handleUpdateMovieNote(
                          selectedDetailMovie.id,
                          note
                        );
                        if (result?.ok) {
                          setSelectedDetailMovie((current) => ({
                            ...current,
                            note: result?.movie?.note ?? null,
                          }));
                        }
                        return result;
                      }
                    : null
                }
                onClose={() => {
                  setSelectedDetailMovie(null);
                  setSelectedDetailContext(null);
                }}
              />
            )}
            {pendingReaddMovie && (
              <div className="modal-overlay z-[70]" role="presentation">
                <div className="modal-surface max-w-md p-5 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="readd-confirm-title">
                  <h3 id="readd-confirm-title" className="text-lg font-semibold text-slate-100">
                    Put movie back in bowl?
                  </h3>
                  <div className="mt-2 space-y-2 text-sm text-slate-400">
                    <p>
                      This puts "{pendingReaddMovie.title}" back into the bowl for everyone.
                    </p>
                    <p>
                      If it was picked within the last two hours, the Watch History entries
                      created by that pick will also be removed. Older Watch History stays intact.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingReaddMovie(null)}
                      className="btn btn-secondary"
                      disabled={isReadding}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (isReadding) return;
                        if ((bowl.remaining || []).length >= MAX_UNDRAWN_MOVIES_PER_BOWL) {
                          setReaddErrorMessage(
                            `Bowl is at the undrawn movie limit (${MAX_UNDRAWN_MOVIES_PER_BOWL}).`
                          );
                          setPendingReaddMovie(null);
                          return;
                        }
                        setIsReadding(true);
                        const drawEventId = pendingReaddMovie?.drawEventId ?? pendingReaddMovie?.id;
                        const result = await handleReaddMovie(drawEventId);
                        setIsReadding(false);
                        setPendingReaddMovie(null);
                        const ok = result === true || result?.ok === true;
                        if (!ok) {
                          setReaddErrorMessage(
                            result?.message || "Could not re-add this movie. Please try again."
                          );
                        }
                      }}
                      className="btn btn-primary"
                      disabled={isReadding}
                    >
                      {isReadding ? "Putting movie back..." : "Put movie back in bowl"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {isDrawing && <DrawAnimationModal />}
            <BowlPicker
              isOpen={isPickerOpen}
              bowls={accountBowls}
              currentBowlId={bowlId}
              homeBowlId={defaultBowlId}
              currentBowlName={displayBowlName}
              isLoading={isBowlContextLoading}
              loadError={bowlContextError}
              onRetry={() => refreshBowlContext({ force: true })}
              onSelectBowl={handleSelectBowl}
              onMakeHome={handleMakeHome}
              isSavingHome={savingDefault}
              homeError={homeError}
              homeMessage={homeMessage}
              onCreateBowl={handleCreateFromPicker}
              isCreateLimitReached={isCreateBowlLimitReached}
              createLimitMessage={`You can create up to ${MAX_BOWLS_PER_USER} bowls.`}
              triggerRef={pickerTriggerRef}
              onClose={() => setIsPickerOpen(false)}
            />
            <CreateBowlModal
              isOpen={isCreateBowlOpen}
              bowlName={newBowlName}
              inviteEmails={createInviteEmails}
              onChangeBowlName={setNewBowlName}
              onChangeInviteEmails={setCreateInviteEmails}
              onCreate={handleCreateBowl}
              onClose={closeCreateBowl}
              isCreating={isCreatingBowl}
              errorMessage={createErrorMessage}
            />
            {createActionMessage && !isCreateBowlOpen && (
              <div className="status-success mt-3" role="status">{createActionMessage}</div>
            )}
        </div>
    );
}
