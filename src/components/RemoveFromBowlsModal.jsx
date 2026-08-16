import { useState } from "react";

function pluralizeBowls(count) {
  return count === 1 ? "1 bowl" : `${count} bowls`;
}

// Every control here is phrased as the action it performs ("Remove from Family
// Bowl") rather than as a state ("Family Bowl"), so a checked box can only read
// one way. The submit button repeats the count for the same reason.
export default function RemoveFromBowlsModal({
  title = "",
  matches = [],
  onKeep,
  onRemove,
  isRemoving = false,
  errorMessage = "",
}) {
  const [selectedIds, setSelectedIds] = useState(() => matches.map((match) => match.id));

  const isSingle = matches.length === 1;
  const selectedCount = isSingle ? matches.length : selectedIds.length;
  const canRemove = selectedCount > 0 && !isRemoving;

  const toggleMatch = (matchId, checked) => {
    setSelectedIds((previous) =>
      checked ? [...new Set([...previous, matchId])] : previous.filter((id) => id !== matchId)
    );
  };

  const handleRemove = () => {
    if (!canRemove) return;
    onRemove?.(isSingle ? matches.map((match) => match.id) : selectedIds);
  };

  return (
    <div className="modal-overlay z-[70]" role="presentation">
      <div
        className="modal-surface max-h-[92vh] max-w-lg overflow-y-auto p-5 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-from-bowls-title"
      >
        <h2
          id="remove-from-bowls-title"
          className="text-2xl font-semibold tracking-tight text-slate-100"
        >
          Take it out of your bowls?
        </h2>

        <p className="mt-2 text-sm text-slate-400">
          {isSingle ? (
            <>
              <span className="font-medium text-slate-200">{title}</span> is still waiting in{" "}
              <span className="font-medium text-slate-200">{matches[0].bowlName}</span>.
            </>
          ) : (
            <>
              <span className="font-medium text-slate-200">{title}</span> is still waiting in{" "}
              {pluralizeBowls(matches.length)} you added it to. Tick the ones to take it out of.
            </>
          )}
        </p>

        {!isSingle && (
          <div className="mt-4 space-y-1.5">
            {matches.map((match) => {
              const checkboxId = `remove-from-bowl-${match.id}`;

              return (
                <label
                  key={match.id}
                  htmlFor={checkboxId}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-slate-700 bg-slate-950/45 px-3 py-2.5 text-sm text-slate-100"
                >
                  <input
                    id={checkboxId}
                    name="remove_from_bowls"
                    type="checkbox"
                    checked={selectedIds.includes(match.id)}
                    onChange={(event) => toggleMatch(match.id, event.target.checked)}
                    disabled={isRemoving}
                  />
                  Remove from {match.bowlName}
                </label>
              );
            })}
          </div>
        )}

        <p className="mt-4 text-xs text-slate-500">
          This takes the movie out of the bowl for everyone in it. Your watch history entry stays
          either way.
        </p>

        {errorMessage && (
          <div className="status-error mt-4" role="alert">
            {errorMessage}
          </div>
        )}

        {!isSingle && selectedCount === 0 && (
          <p className="mt-4 text-sm text-slate-400">
            Nothing ticked — tick a bowl to remove it from, or leave it in every bowl.
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secondary" onClick={onKeep} disabled={isRemoving}>
            {isSingle ? "Leave it in the bowl" : "Leave it in every bowl"}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleRemove}
            disabled={!canRemove}
          >
            {isRemoving
              ? "Removing..."
              : isSingle
                ? `Remove from ${matches[0].bowlName}`
                : `Remove from ${pluralizeBowls(selectedCount)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
