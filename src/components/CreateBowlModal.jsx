export default function CreateBowlModal({
  isOpen,
  bowlName,
  inviteEmails,
  maxContributionLead,
  onChangeBowlName,
  onChangeInviteEmails,
  onChangeMaxContributionLead,
  onCreate,
  onClose,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="panel w-full max-w-sm">
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
        <label htmlFor="new-bowl-invites" className="mb-1 block text-sm font-medium text-slate-700">
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
        <label htmlFor="new-bowl-max-contribution-lead" className="mb-1 block text-sm font-medium text-slate-700">
          Max contribution lead (optional)
        </label>
        <input
          id="new-bowl-max-contribution-lead"
          name="new_bowl_max_contribution_lead"
          type="number"
          min="1"
          step="1"
          className="input-field mb-4"
          placeholder="Leave blank for no limit"
          value={maxContributionLead}
          onChange={(e) => onChangeMaxContributionLead(e.target.value)}
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

