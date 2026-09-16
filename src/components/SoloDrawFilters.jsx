import { useState } from "react";
import { Link } from "react-router-dom";
import FilterChipSelect from "./FilterChipSelect";
import SoloDrawDialog from "./SoloDrawDialog";
import { MPAA_RATING_OPTIONS } from "../utils/movieRatings";
import { DEFAULT_DRAW_SETTINGS } from "../utils/drawSettings";

export default function SoloDrawFilters({ settings, setOverride, setOverrides, streamingServices, availableGenres, isPersisted, disabled, saveStatus, onRetry, readout, onClose }) {
  const chips = (key, options, unknownKey, label) => {
    const selected = settings[key] ?? options;
    return <FilterChipSelect options={options} selectedValues={selected} ariaLabel={`${label} controls`} optionAriaLabelPrefix={label}
      onToggle={(value) => setOverride(key, selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])}
      onOnly={(value) => setOverride(key, [value])} onSelectAll={() => setOverride(key, key === "selectedGenres" ? null : options)}
      onClear={() => setOverride(key, [])} unknownEnabled={settings[unknownKey]} onToggleUnknown={(value) => setOverride(unknownKey, value)} />;
  };
  const reset = () => {
    const { selectedRatings, includeUnknownRatings, selectedGenres, includeUnknownGenres, runtimeMinMinutes, runtimeMaxMinutes, includeUnknownRuntime, prioritizeStreaming, useStreamingRank } = DEFAULT_DRAW_SETTINGS;
    setOverrides({ selectedRatings, includeUnknownRatings, selectedGenres, includeUnknownGenres, runtimeMinMinutes, runtimeMaxMinutes, includeUnknownRuntime, prioritizeStreaming, useStreamingRank });
  };
  return <SoloDrawDialog title="Narrow the draw" onClose={onClose} className="solo-filters">
    <p className="mt-2 text-sm text-slate-400" role="status">{readout}</p>
    <fieldset disabled={disabled} className="solo-filter-controls mt-4 space-y-4 disabled:opacity-50">
      <FilterSection title="Rating filter"><div className="mt-3">{chips("selectedRatings", MPAA_RATING_OPTIONS, "includeUnknownRatings", "Draw rating")}</div></FilterSection>
      <FilterSection title="Genre filter"><div className="mt-3">{chips("selectedGenres", availableGenres, "includeUnknownGenres", "Draw genre")}</div></FilterSection>
      <FilterSection title="Runtime filter">
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-sm">Minimum minutes<input type="number" min="0" max={settings.runtimeMaxMinutes} value={settings.runtimeMinMinutes} className="input-field mt-1 w-full text-sm"
            onChange={(event) => setOverride("runtimeMinMinutes", Math.min(settings.runtimeMaxMinutes, Math.max(0, Number(event.target.value))))} /></label>
          <label className="text-sm">Maximum minutes<input type="number" min={settings.runtimeMinMinutes} max="500" value={settings.runtimeMaxMinutes} className="input-field mt-1 w-full text-sm"
            onChange={(event) => setOverride("runtimeMaxMinutes", Math.max(settings.runtimeMinMinutes, Math.min(500, Number(event.target.value))))} /></label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.includeUnknownRuntime} onChange={(event) => setOverride("includeUnknownRuntime", event.target.checked)} />Include unknown runtime</label>
      </FilterSection>
      <label className="flex items-center justify-between gap-3 text-sm font-semibold">Prioritize streaming services<input type="checkbox" checked={settings.prioritizeStreaming} disabled={!streamingServices.length} onChange={(event) => setOverrides({ prioritizeStreaming: event.target.checked, useStreamingRank: true })} /></label>
      {settings.prioritizeStreaming && streamingServices.length > 0 && <label className="flex items-center justify-between gap-3 text-sm">Use streaming service ranking<input type="checkbox" checked={settings.useStreamingRank} onChange={(event) => setOverride("useStreamingRank", event.target.checked)} /></label>}
      <Link to="/settings#streaming-services" className="block text-sm text-violet-300">{streamingServices.length ? "Edit streaming services" : "Choose streaming services"}</Link>
      {!isPersisted && <p className="text-sm text-amber-300" role="status">Filters apply for this session, but could not be saved on this device.</p>}
    </fieldset>
    {saveStatus === "error" && <p className="mt-3 text-sm text-amber-300" role="alert">Could not save your filters. <button type="button" className="underline" onClick={onRetry}>Retry filters</button></p>}
    <div className="mt-5 flex justify-between gap-3"><button type="button" className="btn btn-ghost" onClick={reset} disabled={disabled}>Reset</button><button type="button" className="btn btn-primary solo-primary" onClick={onClose}>Done</button></div>
  </SoloDrawDialog>;
}

function FilterSection({ title, children }) {
  const [isOpen, setIsOpen] = useState(false);
  return <div><button type="button" className="solo-filter-section" aria-expanded={isOpen} onClick={() => setIsOpen((value) => !value)}>{title}<span aria-hidden="true">{isOpen ? "−" : "+"}</span></button>{isOpen && children}</div>;
}
