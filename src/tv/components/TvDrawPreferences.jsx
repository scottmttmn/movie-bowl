import { Fragment } from "react";
import { getDrawMethod } from "../../utils/drawMethods";
import { clampTheaterTrailerCount } from "../../utils/drawSettings";
import { getProviderLogoUrl } from "../../utils/getProviderLogoUrl";
import { getServiceLogoPath } from "../../utils/providerLogos";

// A row that reports a setting and changes it are the same row. On a D-pad,
// focus is already travelling down this column, so a separate settings screen
// would mean navigating away from the thing being described and back again.
function ToggleRow({ name, label, children, checked, isOverridden, onToggle }) {
  return (
    <li>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="tv-preference-toggle"
        data-tv-focusable
        data-tv-nav-group="tv-preferences"
        data-checked={checked ? "true" : undefined}
        onClick={() => onToggle(name, !checked)}
      >
        <span aria-hidden="true" className="tv-preference-mark">
          {checked ? "✓" : ""}
        </span>
        <span className="tv-preference-label">{children || label}</span>
        {isOverridden && (
          <>
            <span aria-hidden="true" className="tv-preference-diverged" />
            <span className="sr-only">set on this TV</span>
          </>
        )}
      </button>
    </li>
  );
}

// What the television cannot change still has to be visible, or someone hunts
// for the filter that is narrowing the draw and finds nothing.
function StaticRow({ label }) {
  return (
    <li className="tv-preference-static">
      <span aria-hidden="true" className="tv-preference-mark" />
      <span className="tv-preference-label">{label}</span>
    </li>
  );
}

// Ranking keeps only the highest-ranked service that actually matched, so an
// unmatched service falls through to the next one. That is a fallback order
// rather than a set, and the comma was claiming otherwise: with ranking on the
// draw never spans both services at once.
function describeFavoredServices(streamingServices, useServiceRank) {
  if (streamingServices.length > 1 && useServiceRank) {
    return `Favor ${streamingServices.join(", then ")}`;
  }
  return `Favor ${streamingServices.join(", ")}`;
}

function FavoredServices({ streamingServices, useServiceRank }) {
  const isOrdered = streamingServices.length > 1 && useServiceRank;

  return (
    <span className="tv-preference-services">
      {streamingServices.map((service, index) => {
        const logoUrl = getProviderLogoUrl(getServiceLogoPath(service), "w92");
        return (
          <Fragment key={service}>
            {index > 0 && (
              <span aria-hidden="true" className="tv-preference-service-sep">
                {isOrdered ? "›" : "·"}
              </span>
            )}
            {logoUrl ? (
              <img className="tv-preference-service-logo" src={logoUrl} alt="" />
            ) : (
              <span className="tv-preference-service-name">{service}</span>
            )}
          </Fragment>
        );
      })}
    </span>
  );
}

function describeGenres(selectedGenres) {
  if (!Array.isArray(selectedGenres) || selectedGenres.length === 0) return null;
  return selectedGenres.length <= 3
    ? `Genres: ${selectedGenres.join(", ")}`
    : `${selectedGenres.length} selected genres`;
}

export default function TvDrawPreferences({
  settings,
  streamingServices = [],
  drawMethod,
  overriddenSettings = {},
  hasOverrides = false,
  isPersisted = true,
  isLoading = false,
  onToggle,
  onReset,
}) {
  const isOverridden = (name) => Object.prototype.hasOwnProperty.call(overriddenSettings, name);
  const hasServices = streamingServices.length > 0;
  const ratings = settings.selectedRatings || [];
  // An escape hatch only earns a row while the filter it escapes is narrowing
  // something. Otherwise every bowl carries three rows that change nothing.
  const isRatingFilterNarrowed = ratings.length > 0 && ratings.length < 5;
  const genreLabel = describeGenres(settings.selectedGenres);
  const isRuntimeNarrowed =
    Number(settings.runtimeMinMinutes || 0) > 0 || Number(settings.runtimeMaxMinutes || 500) < 500;

  return (
    <aside className="tv-preference-panel">
      <h2>Draw settings</h2>
      {isLoading ? (
        <p>Loading preferences…</p>
      ) : (
        <ul>
          {hasServices && (
            <ToggleRow
              name="prioritizeStreaming"
              label={describeFavoredServices(
                streamingServices,
                Boolean(settings.useStreamingRank)
              )}
              checked={Boolean(settings.prioritizeStreaming)}
              isOverridden={isOverridden("prioritizeStreaming")}
              onToggle={onToggle}
            >
              <FavoredServices
                streamingServices={streamingServices}
                useServiceRank={Boolean(settings.useStreamingRank)}
              />
            </ToggleRow>
          )}
          {streamingServices.length > 1 && settings.prioritizeStreaming && (
            <ToggleRow
              name="useStreamingRank"
              label="Only my top matching service"
              checked={Boolean(settings.useStreamingRank)}
              isOverridden={isOverridden("useStreamingRank")}
              onToggle={onToggle}
            />
          )}
          <ToggleRow
            name="theaterModeEnabled"
            label={
              settings.theaterModeEnabled
                ? `Theater mode: ${clampTheaterTrailerCount(settings.theaterTrailerCount)} previews`
                : "Theater mode"
            }
            checked={Boolean(settings.theaterModeEnabled)}
            isOverridden={isOverridden("theaterModeEnabled")}
            onToggle={onToggle}
          />

          {isRatingFilterNarrowed && <StaticRow label={`Ratings: ${ratings.join(", ")}`} />}
          {isRatingFilterNarrowed && (
            <ToggleRow
              name="includeUnknownRatings"
              label="Include unrated titles"
              checked={Boolean(settings.includeUnknownRatings)}
              isOverridden={isOverridden("includeUnknownRatings")}
              onToggle={onToggle}
            />
          )}

          {genreLabel && <StaticRow label={genreLabel} />}
          {genreLabel && (
            <ToggleRow
              name="includeUnknownGenres"
              label="Include titles with no genre"
              checked={Boolean(settings.includeUnknownGenres)}
              isOverridden={isOverridden("includeUnknownGenres")}
              onToggle={onToggle}
            />
          )}

          {isRuntimeNarrowed && (
            <StaticRow
              label={`${Number(settings.runtimeMinMinutes || 0)}–${Number(
                settings.runtimeMaxMinutes || 500
              )} minutes`}
            />
          )}
          {isRuntimeNarrowed && (
            <ToggleRow
              name="includeUnknownRuntime"
              label="Include titles with no runtime"
              checked={Boolean(settings.includeUnknownRuntime)}
              isOverridden={isOverridden("includeUnknownRuntime")}
              onToggle={onToggle}
            />
          )}

          <StaticRow label={getDrawMethod(drawMethod).tvLabel} />
        </ul>
      )}

      {hasOverrides && (
        <button
          type="button"
          className="tv-preference-reset"
          data-tv-focusable
          data-tv-nav-group="tv-preferences"
          onClick={onReset}
        >
          Use my phone&apos;s settings
        </button>
      )}
      {!isPersisted && (
        <p className="tv-preference-note tv-preference-warning" role="status">
          This TV can&apos;t remember settings, so these last until it restarts.
        </p>
      )}
      <p className="tv-preference-note">
        Changes stay on this TV. Genres, runtime, and services are set on your phone.
      </p>
    </aside>
  );
}
