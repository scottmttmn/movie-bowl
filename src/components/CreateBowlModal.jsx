export default function CreateBowlModal({
  isOpen,
  bowlName,
  inviteEmails,
  onChangeBowlName,
  onChangeInviteEmails,
  onCreate,
  onClose,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay z-50" role="presentation">
      <div className="modal-surface max-w-xl p-5 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="create-bowl-title">
        <h3 id="create-bowl-title" className="section-title mb-4 text-xl">Create New Bowl</h3>
        <input
          id="new-bowl-name"
          name="new_bowl_name"
          type="text"
          className="input-field mb-4"
          placeholder="Bowl Name"
          value={bowlName}
          onChange={(e) => onChangeBowlName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCreate();
          }}
          autoFocus
        />
        <label htmlFor="new-bowl-invites" className="mb-1 block text-sm font-medium text-slate-300">
          Invite emails (optional)
        </label>
        <textarea
          id="new-bowl-invites"
          name="new_bowl_invites"
          className="input-field mb-4 min-h-20"
          placeholder="friend1@example.com, friend2@example.com"
          value={inviteEmails}
          onChange={(e) => onChangeInviteEmails(e.target.value)}
        />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onCreate}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
