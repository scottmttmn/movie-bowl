import { Fragment } from "react";
import { describeStatLine } from "../utils/drawReadout";
import FilmStripGlyph from "./FilmStripGlyph";
import PeopleGlyph from "./PeopleGlyph";

// One quiet sentence under the bowl instead of a row of chips. Each segment is
// still a readout of what the draw is about to do, so the chip tone vocabulary
// carries over: idle = nothing is narrowing, active = a preference is narrowing
// the draw, warning = the narrowing should give you pause.
const TEXT_CLASSES = {
  idle: "text-slate-400",
  active: "text-rose-300",
  warning: "text-amber-300",
};

const COUNT_CLASSES = {
  idle: "font-semibold text-slate-100",
  active: "font-semibold text-rose-200",
  warning: "font-semibold text-amber-200",
};

const HOVER_CLASSES = {
  idle: "hover:text-slate-200",
  active: "hover:text-rose-200",
  warning: "hover:text-amber-200",
};

function Count({ tone = "idle", children }) {
  return <span className={COUNT_CLASSES[tone]}>{children}</span>;
}

// A segment that opens a panel stays a button even before its handler is
// wired, so the control does not pop in and out of the tab order.
function Segment({ as = "span", tone = "idle", onClick, ariaLabel, children }) {
  if (as === "button") {
    return (
      <button
        type="button"
        data-tone={tone}
        onClick={onClick}
        aria-label={ariaLabel}
        className={`rounded transition ${TEXT_CLASSES[tone]} ${HOVER_CLASSES[tone]} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/60`}
      >
        {children}
      </button>
    );
  }
  return (
    <span data-tone={tone} className={TEXT_CLASSES[tone]}>
      {children}
    </span>
  );
}

function PoolSegment({ count, service, tone, onOpenFilters }) {
  if (count === 0) {
    return (
      <Segment as="button" tone="warning" onClick={onOpenFilters} ariaLabel="Nothing is eligible to draw. Open draw filters.">
        Nothing to draw
      </Segment>
    );
  }
  const titles = count === 1 ? "1 title" : `${count} titles`;
  const label = service
    ? `Drawing from ${titles} on ${service}. Open draw filters.`
    : `Drawing from ${titles}. Open draw filters.`;
  return (
    <Segment as="button" tone={tone} onClick={onOpenFilters} ariaLabel={label}>
      <span className="inline-flex items-center gap-1">
        <FilmStripGlyph className="h-4 w-4" />
        <Count tone={tone}>{count}</Count>
        {service ? <span>on {service}</span> : null}
      </span>
    </Segment>
  );
}

// The bowl's people, with the same mark the picker and My Bowls count them
// with. When filters leave someone with nothing in the draw it turns amber and
// becomes a ratio: the one fact here that should stop someone.
function PeopleSegment({ memberCount, reach, onOpenMethodInfo }) {
  if (reach) {
    return (
      <Segment
        as="button"
        tone="warning"
        onClick={onOpenMethodInfo}
        ariaLabel={`Only ${reach.reachedCount} of ${reach.totalCount} people have a movie in the draw. How this bowl picks.`}
      >
        <span className="inline-flex items-center gap-1">
          <PeopleGlyph className="h-4 w-4" />
          <span><Count tone="warning">{reach.reachedCount}</Count>/{reach.totalCount}</span>
        </span>
      </Segment>
    );
  }
  if (!memberCount) return null;
  return (
    <span className="inline-flex items-center gap-1 text-slate-400" aria-label={memberCount === 1 ? "1 member" : `${memberCount} members`}>
      <PeopleGlyph className="h-4 w-4" />
      <Count>{memberCount}</Count>
    </span>
  );
}

export default function BowlStatLine({
  isPending = false,
  remembered = null,
  onRunPoolLookups,
  onOpenFilters,
  onOpenMethodInfo,
  memberCount = null,
  ...readoutInputs
}) {
  // While the answer is still being worked out, the line shows what it said
  // last time rather than each step on the way to the new one. With nothing
  // remembered it holds its place with a placeholder of the same height, so
  // the buttons under it do not move when the count arrives.
  const description = isPending ? remembered : describeStatLine(readoutInputs);
  const reach = description?.reach || null;
  const hasExcludedContributors = Boolean(reach);

  const segments = [];

  if (!description) {
    segments.push(
      <span key="pool" className="inline-flex items-center" aria-hidden="true">
        <span className="skeleton-block inline-block h-4 w-32 rounded" />
      </span>
    );
  } else if (description.pool.kind === "manual") {
    segments.push(
      <Segment key="pool" as="button" tone="active" onClick={onRunPoolLookups}>
        Preview filter matches
      </Segment>
    );
  } else {
    const { count, service, tone } = description.pool;
    segments.push(
      <PoolSegment key="pool" count={count} service={service} tone={tone} onOpenFilters={onOpenFilters} />
    );
  }

  if (description && (hasExcludedContributors || memberCount)) {
    segments.push(
      <PeopleSegment key="people" memberCount={memberCount} reach={reach} onOpenMethodInfo={onOpenMethodInfo} />
    );
  }

  return (
    <p
      className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm font-medium text-slate-400"
      aria-busy={isPending || undefined}
    >
      {segments.map((segment, index) => (
        <Fragment key={segment.key}>
          {index > 0 && <span aria-hidden="true" className="w-2" />}
          {segment}
        </Fragment>
      ))}
    </p>
  );
}
