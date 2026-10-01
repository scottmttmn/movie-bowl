import { useCallback, useRef } from "react";
import useModalFocus from "../hooks/useModalFocus";
import FilmStripGlyph from "./FilmStripGlyph";
import PeopleGlyph from "./PeopleGlyph";

// The owner's mark: a badge on the corner of their initial, the way the
// draw method's person badge sits on its slip.
function OwnerBadge() {
  return (
    <span
      aria-hidden="true"
      className="absolute -bottom-1 -right-1 grid h-[1.05rem] w-[1.05rem] place-items-center rounded-full bg-rose-600 text-white ring-2 ring-slate-900"
    >
      <svg viewBox="0 0 24 24" className="h-[0.7rem] w-[0.7rem]" fill="currentColor">
        <path d="M3 18h18l-1.5-9-4.5 4-3-7-3 7-4.5-4z" />
      </svg>
    </span>
  );
}

function Initial({ children, dashed = false, tone = "idle", badge = null }) {
  const tones = {
    idle: "border-slate-700 bg-slate-950/70 text-slate-300",
    invite: "border-rose-800 bg-transparent text-rose-300",
  };
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold uppercase ${
        dashed ? "border-dashed" : ""
      } ${tones[tone]}`}
    >
      {children}
      {badge}
    </span>
  );
}

function describeRow(row, showLeftOut, showCounts) {
  const role = row.isOwner ? ", owner" : "";
  const you = row.isYou ? " (you)" : "";
  if (!showCounts) return `${row.name}${you}${role}`;
  const movies = row.count === 1 ? "1 movie" : `${row.count} movies`;
  const leftOut = showLeftOut && row.isLeftOut ? ", left out by tonight's filters" : "";
  return `${row.name}${you}${role}: ${movies} in the draw${leftOut}`;
}

/**
 * The people behind the people count under the bowl: who is in it, how many of
 * their movies are in tonight's draw, and for the owner, who is still invited
 * and the way to invite more. When filters leave someone out the count turns
 * into a reached/total ratio and that person is dimmed with an amber zero.
 * Until the filters' pool is known the counts are left off, the way the stat
 * line offers "Preview filter matches" instead of a number.
 */
export default function BowlPeopleSheet({
  rows = [],
  invites = [],
  status = "ready",
  memberCount = null,
  reach = null,
  showLeftOut = false,
  showCounts = true,
  isOwner = false,
  onInvite,
  onClose,
}) {
  const leftOutCount = reach ? reach.totalCount - reach.reachedCount : 0;
  const showReach = showLeftOut && leftOutCount > 0;
  const shownCount = memberCount ?? rows.filter((row) => row.key.startsWith("user:")).length;
  const dialog = useRef(null);
  const invoker = useRef(document.activeElement);
  const getInvoker = useCallback(() => invoker.current, []);
  useModalFocus(dialog, { onEscape: onClose, getInvoker });

  return (
    <div className="modal-overlay z-[70]" role="presentation" onClick={onClose}>
      <div
        ref={dialog}
        tabIndex={-1}
        className="modal-surface max-h-[92dvh] max-w-md overflow-y-auto p-5 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bowl-people-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="bowl-people-title" className="flex items-center gap-2 text-lg font-semibold text-slate-100">
          <PeopleGlyph className={`h-5 w-5 ${showReach ? "text-amber-300" : "text-slate-400"}`} />
          {showReach ? (
            <span className="text-amber-200">
              {reach.reachedCount}/{reach.totalCount}
              <span className="sr-only"> people have a movie in tonight&apos;s draw</span>
            </span>
          ) : (
            <span>
              {shownCount}
              <span className="sr-only">{shownCount === 1 ? " person in this bowl" : " people in this bowl"}</span>
            </span>
          )}
        </h3>

        {status === "error" ? (
          <p className="mt-4 text-sm text-slate-400">Couldn&apos;t load who is in this bowl. Try again in a moment.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-800/80" aria-busy={status === "loading" || undefined}>
            {status === "loading" && rows.length === 0 && Array.from({ length: Math.min(shownCount || 3, 6) }, (_, index) => (
              <li key={`placeholder-${index}`} className="flex items-center gap-3 py-2.5" aria-hidden="true">
                <span className="skeleton-block h-9 w-9 rounded-full" />
                <span className="skeleton-block h-4 w-28 rounded" />
              </li>
            ))}
            {rows.map((row) => {
              const isLeftOut = showLeftOut && row.isLeftOut;
              return (
                <li
                  key={row.key}
                  className="flex items-center gap-3 py-2.5"
                  aria-label={describeRow(row, showLeftOut, showCounts)}
                  data-left-out={isLeftOut || undefined}
                >
                  <span className={isLeftOut ? "opacity-50" : undefined}>
                    <Initial badge={row.isOwner ? <OwnerBadge /> : null}>{row.initial}</Initial>
                  </span>
                  <span className={`min-w-0 flex-1 truncate font-medium ${isLeftOut ? "text-slate-500" : "text-slate-100"}`} aria-hidden="true">
                    {row.name}
                    {row.isYou && <span className="font-normal text-slate-500"> (you)</span>}
                  </span>
                  {showCounts && (
                    <span
                      aria-hidden="true"
                      className={`inline-flex items-center gap-1 text-sm font-semibold ${isLeftOut ? "text-amber-300" : "text-slate-400"}`}
                    >
                      <FilmStripGlyph className="h-4 w-4" />
                      {row.count}
                    </span>
                  )}
                </li>
              );
            })}
            {isOwner && invites.map((invite) => (
              <li key={invite.id} className="flex items-center gap-3 py-2.5">
                <Initial dashed>?</Initial>
                <span className="min-w-0 flex-1 truncate text-slate-400">{invite.invited_email}</span>
                <span className="text-sm text-slate-400">Invited</span>
              </li>
            ))}
          </ul>
        )}

        {isOwner && (
          <button
            type="button"
            onClick={onInvite}
            className="mt-2 flex w-full items-center gap-3 rounded-xl py-2.5 font-semibold text-rose-300 transition hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/60"
          >
            <Initial dashed tone="invite">
              <span className="text-xl font-normal leading-none">+</span>
            </Initial>
            Invite people
          </button>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
