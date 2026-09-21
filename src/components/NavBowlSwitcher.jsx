import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import BowlPicker from "./BowlPicker";
import CreateBowlModal from "./CreateBowlModal";
import useUserBowls from "../hooks/useUserBowls";
import useCreateBowl from "../hooks/useCreateBowl";
import { MAX_BOWLS_PER_USER } from "../utils/appLimits";
import bowlImage from "../assets/movie-bowl.webp";

// Settings, Watch History and Invitations belong to the account rather than to
// any one bowl, so they have no picker in the page and the wordmark was the only
// way back. The header carries the picker on those pages instead. It names the
// home bowl because that is the one answer that does not depend on how you
// arrived; every other bowl is one tap inside it.
//
// Nothing here moves the home designation: BowlPicker renders that command only
// for the bowl being viewed, and away from a bowl there is none.
export default function NavBowlSwitcher({ homeBowlName }) {
  const navigate = useNavigate();
  const { bowls, defaultBowlId, loading, error, refresh } = useUserBowls();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const ownedBowlCount = bowls.filter((bowl) => bowl.role === "Owner").length;
  const {
    actionMessage: createActionMessage,
    bowlName: newBowlName,
    close: closeCreateBowl,
    create: submitCreateBowl,
    errorMessage: createErrorMessage,
    inviteEmails: createInviteEmails,
    isCreating: isCreatingBowl,
    isLimitReached: isCreateLimitReached,
    isOpen: isCreateBowlOpen,
    open: openCreateBowl,
    setBowlName: setNewBowlName,
    setInviteEmails: setCreateInviteEmails,
  } = useCreateBowl({ ownedBowlCount, refresh });

  // Opening a bowl is a visit, so push: browser Back returns to the page the
  // person left, which is the same contract the dashboard picker keeps.
  const handleSelectBowl = (bowlId) => {
    setIsOpen(false);
    navigate(`/bowl/${bowlId}`);
  };

  const handleCreateFromPicker = () => {
    setIsOpen(false);
    openCreateBowl();
  };

  const handleCreateBowl = async () => {
    const result = await submitCreateBowl();
    if (result?.ok && result.bowl?.id) navigate(`/bowl/${result.bowl.id}`);
  };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Switch bowl. Home bowl: ${homeBowlName}`}
        className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl pr-2 text-lg min-[360px]:text-xl font-semibold tracking-tight text-slate-100 transition hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/60 sm:text-2xl"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center">
          <img
            src={bowlImage}
            alt=""
            aria-hidden="true"
            className="h-8 w-8 object-contain"
          />
        </span>
        <span className="min-w-0 truncate">{homeBowlName}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`h-4 w-4 shrink-0 text-slate-400 motion-safe:transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {/* Both of these cover the viewport, and the header they are mounted in
          carries a backdrop filter -- which makes it the containing block for
          anything fixed inside it, so the sheet would be laid out against a
          64px strip and hang off the screen. The body is the right parent. */}
      {createPortal(<>
      <BowlPicker
        isOpen={isOpen}
        bowls={bowls}
        currentBowlId={null}
        homeBowlId={defaultBowlId}
        currentBowlName=""
        isLoading={loading}
        loadError={error}
        onRetry={() => refresh({ force: true })}
        onSelectBowl={handleSelectBowl}
        onMakeHome={() => {}}
        onCreateBowl={handleCreateFromPicker}
        isCreateLimitReached={isCreateLimitReached}
        createLimitMessage={`You can create up to ${MAX_BOWLS_PER_USER} bowls.`}
        triggerRef={triggerRef}
        onClose={() => setIsOpen(false)}
      />
      <CreateBowlModal
        isOpen={isCreateBowlOpen}
        bowlName={newBowlName}
        inviteEmails={createInviteEmails}
        onChangeBowlName={setNewBowlName}
        onChangeInviteEmails={setCreateInviteEmails}
        onCreate={handleCreateBowl}
        onClose={closeCreateBowl}
        isCreating={isCreatingBowl}
        errorMessage={createErrorMessage}
      />
      {createActionMessage && !isCreateBowlOpen && (
        <p className="sr-only" role="status">{createActionMessage}</p>
      )}
      </>, document.body)}
    </>
  );
}
