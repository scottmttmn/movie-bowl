import { useState } from "react";
import { useNavigate } from "react-router-dom";
import FilterChipSelect from "./FilterChipSelect";
import FilterRow from "./FilterRow";
import RuntimeRangeSlider from "./RuntimeRangeSlider";
import StreamingPreferenceRows from "./StreamingPreferenceRows";
import { describeGenres, describeRatings, describeRuntime } from "../utils/filterSummaries";
import SoloDrawDialog from "./SoloDrawDialog";
import { MPAA_RATING_OPTIONS } from "../utils/movieRatings";
import { DEFAULT_DRAW_SETTINGS } from "../utils/drawSettings";

export default function SoloDrawFilters({ settings, setOverride, setOverrides, streamingServices, availableGenres, runtimes, isPersisted, disabled, saveStatus, onRetry, readout, onClose }) {
  const navigate = useNavigate();
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
    <fieldset disabled={disabled} className="solo-filter-controls mt-4 disabled:opacity-50">
      <FilterSection title="Rating" value={describeRatings(settings.selectedRatings ?? MPAA_RATING_OPTIONS, settings.includeUnknownRatings)}><div className="mt-3">{chips("selectedRatings", MPAA_RATING_OPTIONS, "includeUnknownRatings", "Draw rating")}</div></FilterSection>
      <FilterSection title="Genre" value={describeGenres(settings.selectedGenres, availableGenres, settings.includeUnknownGenres)}><div className="mt-3">{chips("selectedGenres", availableGenres, "includeUnknownGenres", "Draw genre")}</div></FilterSection>
      <FilterSection title="Length" value={describeRuntime(settings.runtimeMinMinutes, settings.runtimeMaxMinutes, settings.includeUnknownRuntime)}>
        <div className="mt-3">
          <RuntimeRangeSlider idPrefix="solo" minMinutes={settings.runtimeMinMinutes} maxMinutes={settings.runtimeMaxMinutes} includeUnknown={settings.includeUnknownRuntime}
            onChange={({ minMinutes, maxMinutes }) => setOverrides({ runtimeMinMinutes: minMinutes, runtimeMaxMinutes: maxMinutes })}
            onToggleUnknown={(value) => setOverride("includeUnknownRuntime", value)} runtimes={runtimes} />
        </div>
      </FilterSection>
      <StreamingPreferenceRows idSuffix="solo" services={streamingServices} prioritize={settings.prioritizeStreaming} useRank={settings.useStreamingRank}
        onPrioritizeChange={(checked) => setOverrides({ prioritizeStreaming: checked, useStreamingRank: true })}
        onUseRankChange={(checked) => setOverride("useStreamingRank", checked)}
        onChangeServices={() => navigate("/settings#streaming-services")} disabled={disabled} />
      {!isPersisted && <p className="text-sm text-amber-300" role="status">Filters apply for this session, but could not be saved on this device.</p>}
    </fieldset>
    {saveStatus === "error" && <p className="mt-3 text-sm text-amber-300" role="alert">Could not save your filters. <button type="button" className="underline" onClick={onRetry}>Retry filters</button></p>}
    <div className="mt-5 flex justify-between gap-3"><button type="button" className="btn btn-ghost" onClick={reset} disabled={disabled}>Reset</button><button type="button" className="btn btn-primary solo-primary" onClick={onClose}>Done</button></div>
  </SoloDrawDialog>;
}

function FilterSection({ title, value, children }) {
  const [isOpen, setIsOpen] = useState(false);
  return <div className="filter-row"><FilterRow label={title} value={value} isOpen={isOpen} onToggle={() => setIsOpen((open) => !open)} />{isOpen && <div className="pb-3">{children}</div>}</div>;
}
