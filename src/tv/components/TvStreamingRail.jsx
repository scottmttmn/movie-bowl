import { getProviderLogoUrl } from "../../utils/getProviderLogoUrl";
import { getServiceLogoPath } from "../../utils/providerLogos";
import { getStreamingModes } from "../utils/streamingMode";

const MODE_LABELS = { off: "Off", all: "All", top: "Top" };

// With nothing to rank against, "All" is simply on.
const SOLO_MODE_LABELS = { off: "Off", all: "On" };

function describeMode(mode, services) {
  if (mode === "off") return "Ignore streaming services when drawing";
  if (mode === "all" || services.length < 2) return `Favor ${services.join(", ")}`;
  return `Favor ${services.join(", then ")}`;
}

/**
 * The account's services in priority order, as this draw is actually using
 * them.
 *
 * `topService` is the service the draw landed on, not the first one listed.
 * They differ whenever nothing on the top-ranked service survived the filters:
 * the draw falls through to the next one down, and a rail that highlighted
 * rank 1 regardless would be pointing at a service the draw is not using. It
 * is the same value that makes the readout say "on Netflix", so the two cannot
 * disagree.
 */
export default function TvStreamingRail({
  services = [],
  mode = "off",
  topService = null,
  isOverridden = false,
  onChange,
}) {
  if (services.length === 0) return null;

  const modes = getStreamingModes(services);
  const labels = services.length > 1 ? MODE_LABELS : SOLO_MODE_LABELS;

  return (
    <div className="tv-rail" data-mode={mode} data-tv-nav-region="streaming">
      {isOverridden && (
        <>
          <span aria-hidden="true" className="tv-rail-diverged" />
          <span className="sr-only">set on this TV</span>
        </>
      )}
      {/* Deliberately not a data-tv-nav-group. A group holds a row at its
          ends, and this row's left end is the only way back to the draw
          button -- grouping it would make the rail somewhere you can arrow
          into and never leave. Three adjacent controls need no help from a
          group; plain geometry finds the neighbour. */}
      <div className="tv-rail-modes" role="radiogroup" aria-label="Streaming priority">
        {modes.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            aria-label={describeMode(value, services)}
            className="tv-rail-mode"
            data-active={mode === value ? "true" : undefined}
            data-tv-focusable
            onClick={() => onChange(value)}
          >
            {labels[value]}
          </button>
        ))}
      </div>

      <ol className="tv-rail-stack">
        {services.map((service, index) => {
          const logoUrl = getProviderLogoUrl(getServiceLogoPath(service), "w92");
          const isTop = mode === "top" && service === topService;
          return (
            <li key={service} className="tv-rail-item" data-top={isTop ? "true" : undefined}>
              {/* The ordinal is only true in "top" mode. With every service
                  weighted the same it would be claiming an order the draw is
                  not using, so it goes rather than lies. */}
              <span aria-hidden="true" className="tv-rail-rank">
                {index + 1}
              </span>
              {logoUrl ? (
                <img className="tv-rail-logo" src={logoUrl} alt={service} />
              ) : (
                <span className="tv-rail-logo tv-rail-logo-text">{service}</span>
              )}
              {isTop && <span className="sr-only">drawing from this service</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
