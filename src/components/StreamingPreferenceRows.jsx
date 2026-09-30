import ServiceLogo from "./ServiceLogo";
import { getProviderLogoUrl } from "../utils/getProviderLogoUrl";
import { getServiceLogoPath } from "../utils/providerLogos";

function Switch({ id, label, checked, onChange, disabled }) {
  return (
    <label htmlFor={id} className="relative inline-flex cursor-pointer items-center">
      <input
        id={id}
        aria-label={label}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="h-6 w-11 rounded-full bg-slate-700 transition peer-checked:bg-rose-600" />
      <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-slate-900 shadow transition peer-checked:translate-x-5" />
    </label>
  );
}

const MAX_LOGOS = 6;
const ARROW = <path d="M9 6l6 6-6 6" />;

// The streaming rows of a filter sheet, shared by the bowl and solo draw so
// both read the same. With no services there is nothing to favor, so the row
// becomes the way to choose them rather than a switch that cannot turn on.
export default function StreamingPreferenceRows({
  idSuffix,
  services,
  prioritize,
  useRank,
  onPrioritizeChange,
  onUseRankChange,
  onChangeServices,
  disabled = false,
}) {
  if (!services.length) {
    return (
      <div className="filter-row text-left">
        <button type="button" className="filter-row-button" onClick={onChangeServices} disabled={disabled}>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-slate-100">Favor my services</span>
            <span className="mt-0.5 block text-sm text-slate-400">Choose your services</span>
          </span>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="filter-row-chevron" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ARROW}</svg>
        </button>
      </div>
    );
  }

  return (
    <div className="filter-row text-left">
      <div className="flex min-h-14 items-center gap-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-slate-100">Favor my services</p>
          {/* The services themselves say which ones, and tapping them is how
              you change the list. */}
          <button
            type="button"
            aria-label="Change your streaming services"
            className="mt-1 flex max-w-full flex-wrap items-center gap-1.5 rounded-md py-0.5 text-slate-500 hover:text-slate-300"
            onClick={onChangeServices}
            disabled={disabled}
          >
            {/* A service with no logo is named instead, and any past six are
                counted, so the row never looks like fewer services than the
                draw is using. */}
            {services.slice(0, MAX_LOGOS).map((service) => (
              getProviderLogoUrl(getServiceLogoPath(service), "w92")
                ? <ServiceLogo key={service} service={service} className="h-6 w-6" />
                : <span key={service} className="shrink-0 rounded-md border border-slate-700/70 bg-slate-800/60 px-1.5 py-0.5 text-xs font-semibold text-slate-300">{service}</span>
            ))}
            {services.length > MAX_LOGOS && (
              <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-400">+{services.length - MAX_LOGOS}</span>
            )}
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ARROW}</svg>
          </button>
        </div>
        <Switch id={`prioritize-streaming-${idSuffix}`} label="Favor my services" checked={prioritize} onChange={onPrioritizeChange} disabled={disabled} />
      </div>
      {prioritize && (
        <div className="flex min-h-12 items-center gap-3 border-t border-slate-800 py-2 pl-4">
          <p className="min-w-0 flex-1 text-sm font-medium text-slate-200">Top service first</p>
          <Switch id={`use-streaming-rank-${idSuffix}`} label="Top service first" checked={useRank} onChange={onUseRankChange} disabled={disabled} />
        </div>
      )}
    </div>
  );
}
