export default function AvailabilityAttribution({ tv = false }) {
  return (
    <p className={tv ? "tv-provider-attribution" : "text-xs text-slate-400"}>
      Availability data by{" "}
      <a
        href="https://www.justwatch.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
        data-tv-focusable={tv ? "true" : undefined}
        data-tv-nav-group={tv ? "reveal-actions" : undefined}
      >
        JustWatch
      </a>{" "}
      via TMDB.
    </p>
  );
}
