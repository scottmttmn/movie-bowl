import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import useSoloDrawPool from "../hooks/useSoloDrawPool";
import useSoloDraw from "../hooks/useSoloDraw";
import useUserStreamingServices from "../hooks/useUserStreamingServices";
import useDeviceDrawSettings from "../hooks/useDeviceDrawSettings";
import useDrawPoolCount, { DRAW_POOL_STATUS } from "../hooks/useDrawPoolCount";
import DrawAnimationModal from "../components/DrawAnimationModal";
import HoldToDrawButton from "../components/HoldToDrawButton";
import ConfirmDialog from "../components/ConfirmDialog";
import { WEB_SURFACE_DEFAULTS } from "../utils/deviceDrawSettings";
import { buildDrawFiltersFromSettings } from "../utils/drawSettings";
import { filterSoloPoolByScope } from "../utils/soloDrawSelection";
import { getPosterUrl } from "../utils/getPosterUrl";

function getAvailableGenres(rows) {
  const genres = new Set();
  rows.forEach((row) => {
    if (!Array.isArray(row?.genres)) return;
    row.genres.forEach((genre) => {
      const value = typeof genre === "string" ? genre.trim() : genre?.name ? String(genre.name).trim() : "";
      if (value) genres.add(value);
    });
  });
  return [...genres].sort((left, right) => left.localeCompare(right));
}

export default function SoloDrawPage() {
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const [searchParams] = useSearchParams();
  const requestedBowlId = searchParams.get("bowl");

  const { rows, bowls, bowlIds, isLoading, errorMessage: poolErrorMessage, reload } =
    useSoloDrawPool(userId);
  const { streamingServices, defaultDrawSettings } = useUserStreamingServices();
  const { settings } = useDeviceDrawSettings(userId, defaultDrawSettings, WEB_SURFACE_DEFAULTS);

  // Scope is derived until someone changes it, so a pool that arrives late
  // still gets the entry point's answer without an effect racing the render.
  const [scopeOverride, setScopeOverride] = useState(null);
  // Arriving from a bowl is a statement about context, but only while that bowl
  // is still one of yours -- otherwise the scope would start empty with nothing
  // on screen explaining why.
  const entryScope = useMemo(
    () =>
      requestedBowlId && bowlIds.includes(requestedBowlId) ? [requestedBowlId] : bowlIds,
    [bowlIds, requestedBowlId]
  );
  const activeBowlIds = useMemo(
    () => scopeOverride ?? entryScope,
    [scopeOverride, entryScope]
  );
  const scopedRows = useMemo(
    () => filterSoloPoolByScope(rows, activeBowlIds),
    [rows, activeBowlIds]
  );
  const availableGenres = useMemo(() => getAvailableGenres(rows), [rows]);
  const filters = useMemo(
    () =>
      buildDrawFiltersFromSettings(settings, {
        userStreamingServices: streamingServices,
        availableGenres,
      }),
    [settings, streamingServices, availableGenres]
  );

  const {
    status: poolStatus,
    poolCount,
    runLookups,
  } = useDrawPoolCount(scopedRows, filters);
  const {
    draw,
    retrySave,
    dismissResult,
    clearError,
    isDrawing,
    result,
    errorMessage: drawErrorMessage,
    canRetrySave,
  } = useSoloDraw();
  const [isConfirmingDraw, setIsConfirmingDraw] = useState(false);

  const toggleBowl = (bowlId) => {
    setScopeOverride((previous) => {
      const current = previous ?? entryScope;
      return current.includes(bowlId)
        ? current.filter((id) => id !== bowlId)
        : [...current, bowlId];
    });
  };

  const emptyMessage = (() => {
    if (isLoading || poolErrorMessage) return "";
    if (bowls.length === 0 || rows.length === 0) {
      return "You have no movies to draw. Add a movie to a bowl to get started.";
    }
    if (activeBowlIds.length === 0) return "Choose at least one bowl.";
    if (scopedRows.length === 0) {
      return "You have no movies in these bowls. Choose another bowl or add a movie.";
    }
    return "";
  })();
  const canDraw = !isDrawing && !emptyMessage && !poolErrorMessage && scopedRows.length > 0;
  const runDraw = () => {
    if (!canDraw) return;
    draw(scopedRows, filters);
  };

  return (
    <div className="page-container py-6 sm:py-8">
      <section className="page-hero mx-auto max-w-3xl">
        <div className="border-b border-slate-800 pb-6">
          <p className="eyebrow">Watching alone</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
            Solo Draw
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Draws one of your own titles and adds it straight to your watch history. Your bowls
            keep their copies.
          </p>
        </div>

        <div className="section-stack mt-6">
          {poolErrorMessage && (
            <div className="panel-muted status-error flex items-center justify-between gap-3">
              <span>{poolErrorMessage}</span>
              <button type="button" className="btn btn-secondary" onClick={reload}>
                Retry
              </button>
            </div>
          )}

          {isLoading && (
            <div className="panel-muted text-sm text-slate-400" role="status">
              Loading your movies…
            </div>
          )}

          {!isLoading && !poolErrorMessage && bowls.length > 0 && (
            <section>
              <h2 className="section-title">Drawing from</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {bowls.map((bowl) => {
                  const isSelected = activeBowlIds.includes(bowl.id);
                  return (
                    <button
                      key={bowl.id}
                      type="button"
                      onClick={() => toggleBowl(bowl.id)}
                      aria-pressed={isSelected}
                      aria-label={`${bowl.name}, ${bowl.titleCount} ${
                        bowl.titleCount === 1 ? "title" : "titles"
                      }`}
                      className={`btn ${isSelected ? "btn-primary" : "btn-ghost"}`}
                    >
                      {bowl.name}
                      <span className="ml-2 text-xs opacity-80">{bowl.titleCount}</span>
                    </button>
                  );
                })}
              </div>
              {bowls.length > 1 && (
                <button
                  type="button"
                  className="btn btn-ghost mt-3"
                  onClick={() => setScopeOverride(bowlIds)}
                  disabled={activeBowlIds.length === bowlIds.length}
                >
                  All bowls
                </button>
              )}
            </section>
          )}

          {!isLoading && !poolErrorMessage && (
            <section>
              {emptyMessage ? (
                <p className="panel-muted text-sm text-slate-300">{emptyMessage}</p>
              ) : (
                <p className="text-sm text-slate-400" role="status">
                  {poolStatus === DRAW_POOL_STATUS.manual
                    ? `${scopedRows.length} titles in scope. Your filters need a lookup for each one.`
                    : poolStatus === DRAW_POOL_STATUS.counting
                      ? "Checking which titles match your filters…"
                      : poolStatus === DRAW_POOL_STATUS.ready
                        ? `${poolCount} of ${scopedRows.length} titles match your filters.`
                        : `${scopedRows.length} titles ready to draw.`}
                </p>
              )}
              {poolStatus === DRAW_POOL_STATUS.manual && !emptyMessage && (
                <button type="button" className="btn btn-secondary mt-3" onClick={runLookups}>
                  Check filter matches
                </button>
              )}
            </section>
          )}

          {drawErrorMessage && (
            <div className="panel-muted status-error flex items-center justify-between gap-3">
              <span>{drawErrorMessage}</span>
              {canRetrySave ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={retrySave}
                  disabled={isDrawing}
                >
                  Retry
                </button>
              ) : (
                <button type="button" className="btn btn-ghost" onClick={clearError}>
                  Dismiss
                </button>
              )}
            </div>
          )}

          <div className="flex justify-center pt-2">
            <HoldToDrawButton
              onHoldComplete={runDraw}
              onKeyboardActivate={() => {
                if (!canDraw) return;
                setIsConfirmingDraw(true);
              }}
              disabled={!canDraw}
              isLoading={isDrawing}
            />
          </div>
        </div>
      </section>

      {isDrawing && <DrawAnimationModal />}

      <ConfirmDialog
        isOpen={isConfirmingDraw}
        title="Draw a movie for yourself?"
        body="It goes straight to your watch history. Your bowls keep their copies."
        confirmLabel="Draw"
        onKeep={() => setIsConfirmingDraw(false)}
        onConfirm={() => {
          setIsConfirmingDraw(false);
          runDraw();
        }}
      />

      {result && <SoloDrawResult movie={result} onClose={dismissResult} />}
    </div>
  );
}

/**
 * The reveal. It carries no accept, redraw or removal controls: the draw is
 * already in your history by the time this renders, which is the same bargain
 * the group draw makes when it shows you a movie.
 */
function SoloDrawResult({ movie, onClose }) {
  const posterUrl = getPosterUrl(movie, "w342");

  return (
    <div className="modal-overlay z-[70]" role="presentation">
      <div
        className="modal-surface max-w-md p-6 text-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="solo-draw-result-title"
      >
        <p className="eyebrow">Tonight</p>
        <h2
          id="solo-draw-result-title"
          className="mt-2 text-2xl font-semibold tracking-tight text-slate-50"
        >
          {movie.title}
        </h2>
        {posterUrl && (
          <img
            src={posterUrl}
            alt=""
            className="mx-auto mt-4 w-40 rounded-lg shadow-lg"
            loading="lazy"
          />
        )}
        <p className="status-success mt-4 text-sm">Saved to your watch history.</p>
        <div className="mt-5 flex justify-center gap-3">
          <Link to="/watch-list" className="btn btn-secondary">
            Watch history
          </Link>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
