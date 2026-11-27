import { RUNTIME_FILTER_MAX_MINUTES, RUNTIME_FILTER_MIN_MINUTES } from "../utils/drawSettings";
import { formatMinutes } from "../utils/filterSummaries";

// One track, two thumbs, on a fixed three-hour scale. The far right end means
// "no limit" rather than 180 minutes, so a three-and-a-half-hour epic is never
// cut by leaving the filter alone. Two overlaid native range inputs keep the
// keyboard, touch and screen-reader behaviour the browser already gets right;
// only the thumbs take pointer events, so each drags its own end.
export const RUNTIME_SCALE_MAX = 180;
const STEP = 15;
const MAX_STACK = 6;
const TICKS = [60, 120];

function toScale(minutes, fallback) {
  const value = Number(minutes);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(RUNTIME_SCALE_MAX, value));
}

function percent(value) {
  return (value / RUNTIME_SCALE_MAX) * 100;
}

// Stacks the bowl's titles into fifteen-minute columns so the track shows
// where the bowl's lengths sit, and which ones a range leaves out.
function buildColumns(runtimes) {
  const columns = new Map();
  runtimes.forEach((runtime) => {
    const bucket = Math.min(RUNTIME_SCALE_MAX, Math.round(runtime / STEP) * STEP);
    columns.set(bucket, (columns.get(bucket) || 0) + 1);
  });
  return [...columns.entries()].map(([bucket, count]) => ({ bucket, count }));
}

export default function RuntimeRangeSlider({
  idPrefix,
  minMinutes,
  maxMinutes,
  includeUnknown,
  onChange,
  onToggleUnknown,
  runtimes = null,
}) {
  const low = toScale(minMinutes, 0);
  const high = maxMinutes >= RUNTIME_FILTER_MAX_MINUTES ? RUNTIME_SCALE_MAX : toScale(maxMinutes, RUNTIME_SCALE_MAX);
  const highIsOpen = high >= RUNTIME_SCALE_MAX;

  const setLow = (value) => {
    const next = Math.min(Number(value), high);
    onChange({ minMinutes: Math.max(RUNTIME_FILTER_MIN_MINUTES, next), maxMinutes });
  };
  const setHigh = (value) => {
    const next = Math.max(Number(value), low);
    onChange({ minMinutes, maxMinutes: next >= RUNTIME_SCALE_MAX ? RUNTIME_FILTER_MAX_MINUTES : next });
  };

  const known = Array.isArray(runtimes) ? runtimes.filter((value) => Number(value) > 0).map(Number) : null;
  const unknownCount = Array.isArray(runtimes) ? runtimes.length - known.length : 0;
  const columns = known ? buildColumns(known) : [];
  const tallest = Math.max(1, ...columns.map((column) => column.count), unknownCount);
  // A big bowl scales its stacks down rather than cutting the tall ones off,
  // so the shape stays true; any title still shows as at least one square.
  const squares = (count) => (count === 0 ? 0 : Math.max(1, Math.round((count * Math.min(tallest, MAX_STACK)) / tallest)));
  const inRange = (bucket) => bucket >= low && (highIsOpen || bucket <= high);

  return (
    <div className="runtime-range">
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          {known && (
            <div className="runtime-range-dots" aria-hidden="true" style={{ height: `${Math.min(tallest, MAX_STACK) * 0.625 + 0.25}rem` }}>
              {columns.map(({ bucket, count }) => (
                <span key={bucket} className="runtime-range-column" style={{ left: `${percent(bucket)}%` }}>
                  {Array.from({ length: squares(count) }, (_, index) => (
                    <span key={index} className={`runtime-range-dot ${inRange(bucket) ? "is-in" : ""}`} />
                  ))}
                </span>
              ))}
            </div>
          )}
          <div className="runtime-range-track">
            <span className="runtime-range-fill" style={{ left: `${percent(low)}%`, right: `${100 - percent(high)}%` }} />
            <input
              id={`${idPrefix}-runtime-min`}
              type="range"
              aria-label="Shortest length"
              aria-valuetext={low === 0 ? "No minimum" : formatMinutes(low)}
              min={0}
              max={RUNTIME_SCALE_MAX}
              step={STEP}
              value={low}
              onChange={(event) => setLow(event.target.value)}
              className="runtime-range-input"
              // The lower thumb sits on top only when both meet at the right
              // end, or it could never be dragged back out from under the other.
              style={{ zIndex: low >= RUNTIME_SCALE_MAX - STEP ? 3 : 2 }}
            />
            <input
              id={`${idPrefix}-runtime-max`}
              type="range"
              aria-label="Longest length"
              aria-valuetext={highIsOpen ? "No limit" : formatMinutes(high)}
              min={0}
              max={RUNTIME_SCALE_MAX}
              step={STEP}
              value={high}
              onChange={(event) => setHigh(event.target.value)}
              className="runtime-range-input"
            />
          </div>
          <div className="runtime-range-ticks" aria-hidden="true">
            {TICKS.map((tick) => (
              <span key={tick} style={{ left: `${percent(tick)}%` }}>{tick / 60} hr</span>
            ))}
            <span style={{ left: "100%" }}>3 hr+</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center">
          {known && unknownCount > 0 && (
            <span className="runtime-range-column is-static mb-1" aria-hidden="true">
              {Array.from({ length: squares(unknownCount) }, (_, index) => (
                <span key={index} className={`runtime-range-dot is-unknown ${includeUnknown ? "is-in" : ""}`} />
              ))}
            </span>
          )}
          <button
            type="button"
            aria-pressed={includeUnknown}
            aria-label="Unknown length"
            title="Unknown length"
            onClick={() => onToggleUnknown(!includeUnknown)}
            className={`runtime-range-unknown ${includeUnknown ? "is-on" : ""}`}
          >
            ?
          </button>
          <span className="runtime-range-ticks-spacer" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
