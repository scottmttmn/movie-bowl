import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import bowlImage from "../../assets/movie-bowl.webp";
import FilmStripGlyph from "../../components/FilmStripGlyph";
import HomeGlyph from "../../components/HomeGlyph";
import PeopleGlyph from "../../components/PeopleGlyph";
import useUserStreamingServices from "../../hooks/useUserStreamingServices";
import { getDisplayInitial, getProfileDisplayName } from "../../utils/profileIdentity";
import TvBrand from "../components/TvBrand";
import TvFeedbackDialog from "../components/TvFeedbackDialog";
import { useTvBowls } from "../hooks/useTvBowls";
import useTvSpatialNavigation from "../hooks/useTvSpatialNavigation";

function getLastBowlStorageKey(userId) {
  return `movie-bowl:tv:last-bowl:${userId}`;
}

function getLastBowlId(userId) {
  if (!userId) return "";
  try {
    return window.localStorage.getItem(getLastBowlStorageKey(userId)) || "";
  } catch {
    return "";
  }
}

function rememberLastBowl(userId, bowlId) {
  if (!userId || !bowlId) return;
  try {
    window.localStorage.setItem(getLastBowlStorageKey(userId), bowlId);
  } catch {
    // The bowl picker still works when browser storage is unavailable.
  }
}

export default function TvBowlPicker({
  userId,
  onSignOut,
  autoOpenLastBowl = false,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { bowls, homeBowlId, isLoading, errorMessage, reload } = useTvBowls(userId);
  const { displayName } = useUserStreamingServices();
  const identityLabel = getProfileDisplayName({ display_name: displayName }, userId);
  const lastBowlId = useMemo(() => getLastBowlId(userId), [userId]);
  const hasRememberedBowl = bowls.some((bowl) => bowl.id === lastBowlId);
  const [showSignOut, setShowSignOut] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [focusSignOut, setFocusSignOut] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const signOutPending = useRef(false);
  const shouldFocusSolo = location.state?.focus === "solo";

  const closeSignOut = () => {
    if (signOutPending.current) return;
    setFocusSignOut(true);
    setShowSignOut(false);
  };

  // Leaving /tv is what exiting TV mode means, and Back is deliberately the only
  // way to ask for it. The Google TV shell reads the departure as "close the
  // app" and finishes the activity, so there is nothing for a screen control to
  // label: on a television the remote's Back key already says it, and in a
  // browser so does the back button. A control that said "exit" and then landed
  // on the phone UI would be lying on the one surface that cannot use it.
  useTvSpatialNavigation({
    scopeKey: showSignOut ? "picker-sign-out" : showFeedback ? "picker-feedback" : `picker:${isLoading}:${bowls.length}:${Boolean(errorMessage)}:${shouldFocusSolo}`,
    onBack: () => {
      if (showSignOut) closeSignOut();
      else if (showFeedback) setShowFeedback(false);
      else navigate("/");
    },
  });

  useEffect(() => {
    if (!focusSignOut) return undefined;

    const consumeRestore = window.setTimeout(() => setFocusSignOut(false), 0);
    return () => window.clearTimeout(consumeRestore);
  }, [focusSignOut]);

  const confirmSignOut = async () => {
    if (signOutPending.current) return;
    signOutPending.current = true;
    setIsSigningOut(true);
    setSignOutError("");
    try {
      const result = await onSignOut();
      if (result.error) throw result.error;
      navigate("/tv/bowls", { replace: true });
    } catch {
      setSignOutError("Couldn’t sign out. Check your connection and try again.");
    } finally {
      signOutPending.current = false;
      setIsSigningOut(false);
    }
  };

  const openBowl = (bowlId) => {
    rememberLastBowl(userId, bowlId);
    navigate(`/tv/bowl/${bowlId}`);
  };

  if (
    autoOpenLastBowl &&
    !isLoading &&
    !errorMessage &&
    hasRememberedBowl
  ) {
    return <Navigate to={`/tv/bowl/${lastBowlId}`} replace />;
  }

  return (
    <>
      <main className="tv-page tv-picker-page" aria-hidden={showSignOut || showFeedback || undefined} inert={showSignOut || showFeedback || undefined}>
        <header className="tv-topbar" data-tv-nav-region="picker-header">
          <TvBrand context="TV" />
          <div className="tv-account">
            <span className="tv-account-value"><span className="sr-only">Watching as </span>{identityLabel}</span>
            <button
              type="button"
              className="tv-text-button tv-sign-out-button"
              data-tv-focusable
              data-tv-autofocus={focusSignOut ? "true" : undefined}
              onClick={() => {
                setSignOutError("");
                setShowSignOut(true);
              }}
            >
              Sign out of this TV
            </button>
            <button
              type="button"
              className="tv-text-button tv-sign-out-button"
              data-tv-focusable
              onClick={() => setShowFeedback(true)}
            >
              Feedback
            </button>
          </div>
        </header>

        <section className="tv-picker-intro" aria-labelledby="tv-picker-heading">
          <h1 id="tv-picker-heading">Choose a bowl</h1>
        </section>

        {isLoading && (
          <div className="tv-loading-card" role="status">
            <span className="tv-loading-dot" aria-hidden="true" />
            Loading your bowls…
          </div>
        )}

        {!isLoading && errorMessage && (
          <section className="tv-message-card tv-message-error" role="alert">
            <div>
              <p className="tv-message-title">We couldn&apos;t load your bowls.</p>
              <p>{errorMessage}</p>
            </div>
            <button
              type="button"
              className="tv-button tv-button-secondary"
              data-tv-focusable
              data-tv-autofocus="true"
              onClick={reload}
            >
              Try again
            </button>
          </section>
        )}

        {!isLoading && !errorMessage && bowls.length === 0 && (
          <section className="tv-empty-state">
            <p className="tv-kicker">Nothing to draw yet</p>
            <h2>No bowls found</h2>
            {/* No button: the only next step is on a phone, and a television
                that offered one could only open the phone app on itself. */}
            <p>Create or join a bowl on your phone, then come back to the TV.</p>
          </section>
        )}

        {!isLoading && !errorMessage && bowls.length > 0 && (
          <section className="tv-solo-entry-section" aria-label="Solo draw" data-tv-nav-region="solo-entry">
            <button
              type="button"
              className="tv-solo-entry"
              data-tv-focusable
              data-tv-autofocus={shouldFocusSolo ? "true" : undefined}
              onClick={() => navigate("/tv/solo")}
            >
              <span className="tv-solo-entry-mark" aria-hidden="true">
                {getDisplayInitial(identityLabel)}
              </span>
              <span className="tv-solo-entry-copy">
                <strong>Draw from my movies</strong>
              </span>
              <span className="tv-solo-entry-arrow" aria-hidden="true">→</span>
            </button>
          </section>
        )}

        {!isLoading && !errorMessage && bowls.length > 0 && (
          <section className="tv-bowl-grid" aria-label="Your bowls" data-tv-nav-region="bowl-grid">
            {bowls.map((bowl, index) => {
              const isLastBowl = bowl.id === lastBowlId;
              const isHome = bowl.id === homeBowlId;
              // The same card My Bowls draws, at television size: the bowl,
              // its name, and two counts as marks. Owner, date and "open"
              // were words for things the card already shows by being one.
              const label = [
                bowl.name,
                isHome ? "home bowl" : null,
                `${bowl.remainingCount} ${bowl.remainingCount === 1 ? "title" : "titles"} to draw`,
                `${bowl.memberCount} ${bowl.memberCount === 1 ? "member" : "members"}`,
              ].filter(Boolean).join(", ");

              return (
                <button
                  type="button"
                  key={bowl.id}
                  className="tv-bowl-card"
                  aria-label={label}
                  data-tv-focusable
                  data-tv-nav-group="bowl-grid"
                  data-tv-autofocus={
                    !shouldFocusSolo && (isLastBowl || (!hasRememberedBowl && index === 0))
                      ? "true"
                      : undefined
                  }
                  onClick={() => openBowl(bowl.id)}
                >
                  <img className="tv-bowl-card-bowl" src={bowlImage} alt="" aria-hidden="true" />
                  <span className="tv-bowl-card-body" aria-hidden="true">
                    <span className="tv-bowl-name">
                      {isHome && <HomeGlyph className="tv-bowl-home" />}
                      {bowl.name}
                    </span>
                    <span className="tv-bowl-card-meta">
                      <span><FilmStripGlyph />{bowl.remainingCount}</span>
                      <span><PeopleGlyph />{bowl.memberCount}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </section>
        )}

      </main>
      {showFeedback && <TvFeedbackDialog onClose={() => setShowFeedback(false)} />}
      {showSignOut && (
        <div className="tv-dialog-backdrop" role="presentation">
          <section
            className="tv-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tv-sign-out-title"
            aria-describedby="tv-sign-out-description"
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              event.preventDefault();
              const buttons = Array.from(event.currentTarget.querySelectorAll("button"));
              const index = buttons.indexOf(document.activeElement);
              buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
            }}
          >
            <h2 id="tv-sign-out-title">Sign out of this TV?</h2>
            <p id="tv-sign-out-description">You’ll need your phone to pair it again.</p>
            {signOutError && <p className="tv-dialog-error" role="alert">{signOutError}</p>}
            <div className="tv-dialog-actions">
              <button
                type="button"
                className="tv-button tv-button-primary"
                data-tv-focusable
                data-tv-nav-group="sign-out-dialog"
                data-tv-autofocus="true"
                aria-disabled={isSigningOut}
                onClick={closeSignOut}
              >
                Cancel
              </button>
              <button
                type="button"
                className="tv-button tv-button-quiet"
                data-tv-focusable
                data-tv-nav-group="sign-out-dialog"
                aria-disabled={isSigningOut}
                onClick={confirmSignOut}
              >
                {isSigningOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
