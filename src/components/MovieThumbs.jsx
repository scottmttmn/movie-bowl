import { getMovieAttributionAccent } from "../utils/drawBuckets";
import { getDisplayInitial } from "../utils/profileIdentity";
import { RATING_NAMES, RATING_VALUES } from "../utils/thumbRatings";

const THUMB_PATH = "M7 10v11M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8a2 2 0 0 1-1.9 1.4H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9Z";

// Ups are gold and downs rose, so a column of thumbs reads at a glance.
function toneFor(value) {
  return value > 0 ? "#fcd34d" : "#fb7185";
}

function washFor(value) {
  return value > 0 ? "rgba(252, 211, 77, 0.12)" : "rgba(251, 113, 133, 0.12)";
}

// A double is two whole thumbs with a gap between them: overlapped, they read
// as one blurred hand.
export function ThumbGlyph({ value, filled = false, className = "h-5" }) {
  const isDouble = Math.abs(value) === 2;
  const flip = value < 0 ? "translate(0 24) scale(1 -1)" : undefined;
  const thumb = <path d={THUMB_PATH} fill={filled ? "currentColor" : "none"} />;

  return (
    <svg
      aria-hidden="true"
      viewBox={isDouble ? "0 0 38.5 24" : "0 0 24 24"}
      className={`${className} ${isDouble ? "w-auto" : "aspect-square"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {isDouble ? (
        <>
          <g transform="translate(0 2) scale(0.8)"><g transform={flip}>{thumb}</g></g>
          <g transform="translate(19 2) scale(0.8)"><g transform={flip}>{thumb}</g></g>
        </>
      ) : (
        <g transform={flip}>{thumb}</g>
      )}
    </svg>
  );
}

/** A thumb, small, for the corner of a poster. Nothing when unrated. */
export function RatingMark({ value, whose = "You", className = "" }) {
  if (value == null) return null;
  return (
    <span
      role="img"
      aria-label={`${whose} rated it: ${RATING_NAMES[value]}`}
      className={`flex h-6 items-center justify-center rounded-full border border-white/15 bg-slate-950/85 px-1.5 shadow-md ${className}`}
      style={{ color: toneFor(value) }}
    >
      <ThumbGlyph value={value} filled className="h-3.5" />
    </span>
  );
}

function PersonInitial({ person, faceDown = false, isSelf = false }) {
  const label = person.name || "Member";
  const initial = getDisplayInitial(label);

  if (faceDown) {
    return (
      <span
        className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-slate-500/80 text-[11px] font-bold text-slate-500"
        title={label}
      >
        {initial}
      </span>
    );
  }

  return (
    <span
      className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 text-xs font-bold text-white shadow-md"
      style={{
        backgroundColor: getMovieAttributionAccent({ added_by: person.userId }).avatarColor,
        boxShadow: isSelf ? "0 0 0 2px #0f172a, 0 0 0 3.5px #e2e8f0" : undefined,
      }}
      title={isSelf ? "You" : label}
    >
      {initial}
    </span>
  );
}

/**
 * The four thumbs. One tap picks; tapping the pick again clears it. There are
 * no words beside them -- the glyphs are the scale, and their names are for
 * screen readers.
 */
export default function MovieThumbs({
  title,
  value = null,
  onChange,
  size = "md",
  quiet = false,
  disabled = false,
  columns = null,
}) {
  const isSmall = size === "sm";

  return (
    <div
      role="group"
      aria-label={`Your rating for ${title}`}
      className={`flex items-start ${isSmall ? "gap-0.5" : "gap-1.5"}`}
    >
      {RATING_VALUES.map((thumb) => {
        const selected = value === thumb;
        const dim = value != null && !selected;

        return (
          <div key={thumb} className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              aria-label={RATING_NAMES[thumb]}
              aria-pressed={selected}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                onChange?.(selected ? null : thumb);
              }}
              className={`relative z-10 flex items-center justify-center rounded-full border transition disabled:cursor-wait ${
                isSmall ? "h-8 min-w-[2.25rem] px-1" : "h-11 min-w-[3.25rem] px-2"
              } ${
                selected
                  ? "border-transparent"
                  : quiet
                    ? "border-transparent text-slate-500 hover:text-slate-300"
                    : "border-slate-700/80 text-slate-400 hover:border-slate-500 hover:text-slate-200"
              } ${dim ? "opacity-50" : ""}`}
              style={selected ? { color: toneFor(thumb), backgroundColor: washFor(thumb) } : undefined}
            >
              <ThumbGlyph value={thumb} filled={selected} className={isSmall ? "h-[18px]" : "h-6"} />
            </button>
            {columns && (
              <div className="flex min-h-7 flex-col items-center gap-1">
                {(columns[thumb] || []).map((person) => (
                  <PersonInitial key={person.userId} person={person} isSelf={person.isSelf} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A bowl's watched movie: your thumbs and the bowl's. Rate to reveal -- until
 * you pick, the people who have rated sit face down under the thumbs, and the
 * database has not told this page what they picked. Your pick turns them over
 * into columns under the thumb each of them chose.
 */
export function BowlThumbs({ title, value = null, onChange, others = [], me = null, disabled = false }) {
  const revealed = value != null;
  const columns = revealed
    ? Object.fromEntries(RATING_VALUES.map((thumb) => [
        thumb,
        [
          ...(value === thumb && me ? [{ ...me, isSelf: true }] : []),
          ...others.filter((person) => person.rating === thumb),
        ],
      ]))
    : null;

  return (
    <div className="space-y-2">
      <MovieThumbs title={title} value={value} onChange={onChange} columns={columns} disabled={disabled} />
      {!revealed && others.length > 0 && (
        <div
          role="img"
          aria-label={`${others.length} in this bowl rated it. Rate to see.`}
          className="flex flex-wrap items-center gap-1.5"
        >
          {others.map((person) => (
            <PersonInitial key={person.userId} person={person} faceDown />
          ))}
        </div>
      )}
    </div>
  );
}
