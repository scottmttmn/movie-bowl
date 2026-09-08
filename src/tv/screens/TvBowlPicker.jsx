import { useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { formatRelativeDateLabel } from "../../utils/formatRelativeDate";
import TvBrand from "../components/TvBrand";
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
  userEmail,
  onSignOut,
  autoOpenLastBowl = false,
}) {
  const navigate = useNavigate();
  const { bowls, isLoading, errorMessage, reload } = useTvBowls(userId);
  const lastBowlId = useMemo(() => getLastBowlId(userId), [userId]);
  const hasRememberedBowl = bowls.some((bowl) => bowl.id === lastBowlId);
  const [showSignOut, setShowSignOut] = useState(false);
  const [focusSignOut, setFocusSignOut] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const signOutPending = useRef(false);

  const closeSignOut = () => {
    if (signOutPending.current) return;
    setFocusSignOut(true);
    setShowSignOut(false);
  };

  useTvSpatialNavigation({
    scopeKey: showSignOut ? "picker-sign-out" : `picker:${isLoading}:${bowls.length}:${Boolean(errorMessage)}`,
    onBack: () => showSignOut ? closeSignOut() : navigate("/"),
  });

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
      <main className="tv-page tv-picker-page" aria-hidden={showSignOut || undefined} inert={showSignOut || undefined}>
        <header className="tv-topbar" data-tv-nav-region="picker-header">
          <TvBrand context="TV" />
          <div className="tv-account">
            <span className="tv-account-label">Watching as</span>
            <span className="tv-account-value">{userEmail || "Movie Bowl member"}</span>
            <button
              type="button"
              className="tv-text-button"
              data-tv-focusable
              data-tv-nav-group="picker-header"
              onClick={() => navigate("/")}
            >
              Exit TV mode
            </button>
            <button
              type="button"
              className="tv-text-button tv-sign-out-button"
              data-tv-focusable
              data-tv-nav-group="picker-header"
              data-tv-autofocus={focusSignOut ? "true" : undefined}
              onClick={() => {
                setSignOutError("");
                setShowSignOut(true);
              }}
            >
              Sign out of this TV
            </button>
          </div>
        </header>

        <section className="tv-picker-intro" aria-labelledby="tv-picker-heading">
          <p className="tv-kicker">Tonight starts here</p>
          <h1 id="tv-picker-heading">Choose a bowl</h1>
          <p>Pick the group you&apos;re watching with. This TV remembers you, not just one bowl.</p>
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
            <p>Create or join a bowl on your phone, then come back to the TV.</p>
            <button
              type="button"
              className="tv-button tv-button-primary"
              data-tv-focusable
              data-tv-autofocus="true"
              onClick={() => navigate("/")}
            >
              Open the full app
            </button>
          </section>
        )}

        {!isLoading && !errorMessage && bowls.length > 0 && (
          <section className="tv-bowl-grid" aria-label="Your bowls" data-tv-nav-region="bowl-grid">
            {bowls.map((bowl, index) => {
              const isLastBowl = bowl.id === lastBowlId;
              const activityLabel = bowl.lastActivityAt
                ? formatRelativeDateLabel(bowl.lastActivityAt)
                : "Ready when you are";

              return (
                <button
                  type="button"
                  key={bowl.id}
                  className="tv-bowl-card"
                  data-tv-focusable
                  data-tv-nav-group="bowl-grid"
                  data-tv-autofocus={
                    isLastBowl || (!hasRememberedBowl && index === 0) ? "true" : undefined
                  }
                  onClick={() => openBowl(bowl.id)}
                >
                  <span className="tv-bowl-card-topline">
                    <span className="tv-bowl-role">{bowl.role}</span>
                    {isLastBowl && <span className="tv-last-used">Last opened</span>}
                  </span>
                  <span className="tv-bowl-name">{bowl.name}</span>
                  <span className="tv-bowl-card-meta">
                    <span>
                      <strong>{bowl.remainingCount}</strong>
                      <small>{bowl.remainingCount === 1 ? "movie" : "movies"} ready</small>
                    </span>
                    <span>
                      <strong>{bowl.memberCount}</strong>
                      <small>{bowl.memberCount === 1 ? "member" : "members"}</small>
                    </span>
                  </span>
                  <span className="tv-bowl-activity">{activityLabel}</span>
                  <span className="tv-card-action">
                    Open tonight&apos;s bowl <span aria-hidden="true">→</span>
                  </span>
                </button>
              );
            })}
          </section>
        )}

      </main>
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
