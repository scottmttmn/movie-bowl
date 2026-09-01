import { useMemo } from "react";
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
  autoOpenLastBowl = false,
}) {
  const navigate = useNavigate();
  const { bowls, isLoading, errorMessage, reload } = useTvBowls(userId);
  const lastBowlId = useMemo(() => getLastBowlId(userId), [userId]);
  const hasRememberedBowl = bowls.some((bowl) => bowl.id === lastBowlId);

  useTvSpatialNavigation({
    scopeKey: `picker:${isLoading}:${bowls.length}:${Boolean(errorMessage)}`,
    onBack: () => navigate("/"),
  });

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
    <main className="tv-page tv-picker-page">
      <header className="tv-topbar">
        <TvBrand />
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
        <section className="tv-bowl-grid" aria-label="Your bowls">
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
  );
}
