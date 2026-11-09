import FilmStripGlyph from "./FilmStripGlyph";
import ForkKnifeGlyph from "./ForkKnifeGlyph";

export default function CreateBowlModal({
  isOpen,
  bowlName,
  inviteEmails,
  onChangeBowlName,
  onChangeInviteEmails,
  onCreate,
  onClose,
  isCreating = false,
  errorMessage = null,
  // Offered only to accounts that turned restaurant bowls on in Settings.
  offerKinds = false,
  kind = "movies",
  onChangeKind,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay z-50" role="presentation">
      <div className="modal-surface max-w-xl p-5 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="create-bowl-title">
        <h3 id="create-bowl-title" className="section-title mb-4 text-xl">Create New Bowl</h3>
        {errorMessage && <div className="status-error mb-4" role="alert">{errorMessage}</div>}
        <input
          id="new-bowl-name"
          name="new_bowl_name"
          type="text"
          className="input-field mb-4"
          placeholder="Bowl Name"
          value={bowlName}
          disabled={isCreating}
          onChange={(e) => onChangeBowlName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isCreating) onCreate();
          }}
          autoFocus
        />
        {offerKinds && (
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-slate-700 bg-slate-900 p-1" role="radiogroup" aria-label="Kind of bowl">
            {[
              { value: "movies", label: "Movies", glyph: <FilmStripGlyph className="h-4 w-4" /> },
              { value: "restaurants", label: "Restaurants", glyph: <ForkKnifeGlyph className="h-4 w-4" /> },
            ].map(({ value, label, glyph }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                disabled={isCreating}
                onClick={() => onChangeKind?.(value)}
                className={`flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${
                  kind === value ? "bg-rose-700 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {glyph}
                {label}
              </button>
            ))}
          </div>
        )}
        <label htmlFor="new-bowl-invites" className="mb-1 block text-sm font-medium text-slate-300">
          Invite emails (optional)
        </label>
        <textarea
          id="new-bowl-invites"
          name="new_bowl_invites"
          className="input-field mb-4 min-h-20"
          placeholder="friend1@example.com, friend2@example.com"
          value={inviteEmails}
          disabled={isCreating}
          onChange={(e) => onChangeInviteEmails(e.target.value)}
        />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onCreate} disabled={isCreating}>
            {isCreating ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
