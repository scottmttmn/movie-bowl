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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="panel w-full max-w-xl p-8">
        <h3 className="section-title mb-4">Create New Bowl</h3>
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
        <div className="flex justify-end space-x-3">
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
