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
// where the bowl's lengths sit, and which ones a range leaves out. Each title
// keeps its own length, so a 125-minute film in the two-hour column still
// goes grey under a two-hour limit.
function buildColumns(runtimes) {
  const columns = new Map();
  runtimes.forEach((runtime) => {
    const bucket = Math.min(RUNTIME_SCALE_MAX, Math.round(runtime / STEP) * STEP);
    if (!columns.has(bucket)) columns.set(bucket, []);
    columns.get(bucket).push(runtime);
  });
  return [...columns.entries()].map(([bucket, items]) => ({ bucket, runtimes: items.sort((a, b) => a - b) }));
}

// The same test the draw applies (filterCandidatesByRuntime), so a lit slip
// is one the draw keeps.
function isInRange(runtime, minMinutes, maxMinutes) {
  const min = Number(minMinutes);
  const max = Number(maxMinutes);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= 0) return true;
  return runtime >= Math.min(min, max) && runtime <= Math.max(min, max);
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
  // A limit saved by the old number boxes can sit past the end of the scale
  // (say 200 minutes). Its thumb rests at the end, but it is still a limit,
  // and it reads as one rather than as "No limit".
  const highIsOpen = maxMinutes >= RUNTIME_FILTER_MAX_MINUTES;

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
  const tallest = Math.max(1, ...columns.map((column) => column.runtimes.length), unknownCount);
  // A big bowl scales its stacks down rather than cutting the tall ones off,
  // so the shape stays true; any title still shows as at least one square.
  const squares = (count) => (count === 0 ? 0 : Math.max(1, Math.round((count * Math.min(tallest, MAX_STACK)) / tallest)));
  // When a big bowl shrinks a column, its squares split lit and grey in the
  // same proportion as its titles.
  const columnSquares = (items) => {
    const total = squares(items.length);
    const lit = items.filter((runtime) => isInRange(runtime, minMinutes, maxMinutes)).length;
    const litSquares = lit === 0 ? 0 : lit === items.length ? total : Math.min(total - 1, Math.max(1, Math.round((lit * total) / items.length)));
    // Short titles sit at the bottom of a column, so a minimum greys from
    // the bottom up and a maximum from the top down.
    const firstLit = items.findIndex((runtime) => isInRange(runtime, minMinutes, maxMinutes));
    const startsGrey = firstLit > 0 ? total - litSquares : 0;
    return Array.from({ length: total }, (_, index) => index >= startsGrey && index < startsGrey + litSquares);
  };

  return (
    <div className="runtime-range">
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          {known && (
            <div className="runtime-range-dots" aria-hidden="true" style={{ height: `${Math.min(tallest, MAX_STACK) * 0.625 + 0.25}rem` }}>
              {columns.map(({ bucket, runtimes: items }) => (
                <span key={bucket} className="runtime-range-column" style={{ left: `${percent(bucket)}%` }}>
                  {columnSquares(items).map((lit, index) => (
                    <span key={index} className={`runtime-range-dot ${lit ? "is-in" : ""}`} />
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
              // Where the thumbs meet, the one that can still move goes on top:
              // the lower thumb on the right half, the upper one on the left,
              // or a pair stacked at either end could not be pulled apart.
              style={{ zIndex: low > RUNTIME_SCALE_MAX / 2 ? 3 : 1 }}
            />
            <input
              id={`${idPrefix}-runtime-max`}
              type="range"
              aria-label="Longest length"
              aria-valuetext={highIsOpen ? "No limit" : formatMinutes(maxMinutes)}
              min={0}
              max={RUNTIME_SCALE_MAX}
              step={STEP}
              value={high}
              onChange={(event) => setHigh(event.target.value)}
              className="runtime-range-input"
              style={{ zIndex: 2 }}
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
