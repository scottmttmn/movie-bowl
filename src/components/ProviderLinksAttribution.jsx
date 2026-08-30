export default function ProviderLinksAttribution({ tv = false }) {
  return (
    <p className={tv ? "tv-provider-attribution" : "text-xs text-slate-400"}>
      Streaming links by{" "}
      <a
        href="https://www.watchmode.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
        data-tv-focusable={tv ? "true" : undefined}
        data-tv-nav-group={tv ? "reveal-actions" : undefined}
      >
        Watchmode
      </a>
    </p>
  );
}
