import { useEffect, useRef, useState } from "react";
import { fetchTitleDepartures } from "../lib/titleDepartures";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { normalizeStreamingServices } from "../utils/streamingServices";
import {
  departureLabel,
  matchDepartureServices,
  relevantDepartures,
} from "../utils/titleDepartures";

export default function DepartureNotice({
  tmdbId,
  bowlId = null,
  providers = null,
  userStreamingServices = [],
  compact = false,
  fetchProviders = fetchStreamingProviders,
}) {
  const element = useRef(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  const [snapshot, setSnapshot] = useState(null);
  const servicesKey = normalizeStreamingServices(userStreamingServices).sort().join("|");
  const providersKey =
    providers === null ? null : normalizeStreamingServices(providers).sort().join("|");
  const key = `${tmdbId}:${bowlId}:${servicesKey}:${providersKey}`;

  useEffect(() => {
    if (!element.current) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    if (
      !visible ||
      !servicesKey ||
      matchDepartureServices(servicesKey.split("|"), servicesKey.split("|")).length === 0 ||
      !Number.isSafeInteger(Number(tmdbId)) ||
      Number(tmdbId) <= 0
    )
      return undefined;
    if (
      providersKey !== null &&
      matchDepartureServices(providersKey.split("|"), servicesKey.split("|")).length === 0
    )
      return undefined;
    (async () => {
      try {
        const available =
          providersKey === null
            ? (await fetchProviders(Number(tmdbId), { region: "US" }))?.providers || []
            : providersKey.split("|");
        if (!active || matchDepartureServices(available, servicesKey.split("|")).length === 0)
          return;
        const result = await fetchTitleDepartures(tmdbId, servicesKey, { bowlId });
        const checkedAt = Date.now();
        if (active && Date.parse(result.validUntil) > checkedAt)
          setSnapshot({ key, available, checkedAt, ...result });
      } catch {
        /* Departure hints never interrupt browsing or adding. */
      }
    })();
    return () => {
      active = false;
    };
  }, [visible, key, tmdbId, bowlId, servicesKey, providersKey, fetchProviders]);

  const departures =
    snapshot?.key === key
      ? relevantDepartures(
          snapshot.departures,
          snapshot.available,
          userStreamingServices,
          snapshot.checkedAt,
        )
      : [];
  const labels = departures.map(departureLabel);

  useEffect(() => {
    if (snapshot?.key !== key) return undefined;
    const deadline = Math.min(
      Date.parse(snapshot.validUntil),
      ...snapshot.departures
        .map((departure) => Date.parse(departure.expiresOn))
        .filter((timestamp) => Number.isFinite(timestamp) && timestamp > snapshot.checkedAt),
    );
    if (!Number.isFinite(deadline)) return undefined;
    const timer = setTimeout(
      () => {
        const checkedAt = Date.now();
        setSnapshot((current) =>
          current?.key === key && Date.parse(current.validUntil) > checkedAt
            ? { ...current, checkedAt }
            : null,
        );
      },
      Math.min(2147483647, Math.max(0, deadline - Date.now())),
    );
    return () => clearTimeout(timer);
  }, [snapshot, key]);

  return (
    <span
      ref={element}
      className={labels.length ? "block" : "pointer-events-none absolute h-px w-px"}
    >
      {labels.length > 0 &&
        (compact ? (
          <span
            className="mt-1 inline-flex items-center gap-1 rounded bg-amber-950/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200"
            title={labels.join("; ")}
          >
            <span aria-hidden="true">◷</span>
            <span aria-hidden="true">Leaving soon</span>
            <span className="sr-only">
              {labels.join("; ")}. Departure data by Movie of the Night.
            </span>
          </span>
        ) : (
          <span className="mt-1 block text-xs text-amber-200">
            {labels.map((label) => (
              <span className="block" key={label}>
                {label}
              </span>
            ))}
            <a
              href="https://www.movieofthenight.com/about/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-slate-400 underline"
              onClick={(event) => event.stopPropagation()}
            >
              Movie of the Night
            </a>
          </span>
        ))}
    </span>
  );
}
