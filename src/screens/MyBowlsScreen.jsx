import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import bowlImage from "../assets/movie-bowl.webp";
import BowlCard from "../components/BowlCard";
import NewBowlButton from "../components/NewBowlButton";
import CreateBowlModal from "../components/CreateBowlModal";
import useCreateBowl from "../hooks/useCreateBowl";
import useUserBowls from "../hooks/useUserBowls";
import { sortBowlsByRecentActivity } from "../utils/bowlOrdering";
import usePendingInvites from "../hooks/usePendingInvites";
import { MAX_BOWLS_PER_USER } from "../utils/appLimits";

export default function MyBowlsScreen() {
  const { bowls, defaultBowlId, loading: isLoading, error: loadError, refresh } = useUserBowls();
  const navigate = useNavigate();
  const {
    invites: pendingInvites,
    isLoading: isInvitesLoading,
  } = usePendingInvites();
  const ownedBowlCount = bowls.filter((b) => b.role === "Owner").length;
  const {
    actionMessage: createActionMessage,
    bowlName: newBowlName,
    close: handleCloseModal,
    create: handleCreateBowl,
    errorMessage: createErrorMessage,
    inviteEmails,
    isCreating,
    isLimitReached: isCreateBowlLimitReached,
    isOpen: isModalOpen,
    open: handleNewBowl,
    setBowlName: setNewBowlName,
    setInviteEmails,
  } = useCreateBowl({ ownedBowlCount, refresh });
  const ownedBowls = sortBowlsByRecentActivity(bowls.filter((b) => b.role === "Owner"));
  const sharedBowls = sortBowlsByRecentActivity(bowls.filter((b) => b.role !== "Owner"));
  // Only a first load with nothing to show is a loading state. A refresh over
  // rows we already have must not blank them.
  const hasNoTrustworthyList =
    bowls.length === 0
    && !loadError
    && (isLoading || isInvitesLoading);
  const shouldShowFirstRun =
    !isLoading &&
    !isInvitesLoading &&
    !loadError &&
    bowls.length === 0 &&
    pendingInvites.length === 0;

  useEffect(() => { void refresh(); }, [refresh]);


  const handleSelectBowl = (bowlId) => {
    navigate(`/bowl/${bowlId}`);
  };

  return (
    <div className="my-bowls-screen page-container py-6 sm:py-8">
      <header className="mb-8">
        <div className="mb-4 space-y-2" aria-live="polite">
          {createErrorMessage && !isModalOpen && !shouldShowFirstRun && <div className="status-error" role="alert">{createErrorMessage}</div>}
          {createActionMessage && <div className="status-success">{createActionMessage}</div>}
        </div>
        <div className="page-hero flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            {/* This page stopped being Home when / became the resolver, and the
                word now names one specific bowl. */}
            <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">My Bowls</h1>
          </div>
          {!shouldShowFirstRun && (
            <div className="flex justify-start md:justify-end">
              <NewBowlButton onClick={handleNewBowl} disabled={isCreateBowlLimitReached || isCreating} />
            </div>
          )}
        </div>
        {isCreateBowlLimitReached && (
          <div className="status-warning mt-3">
            Bowl limit reached ({MAX_BOWLS_PER_USER}).
          </div>
        )}
      </header>
      <div className="section-stack">
        {/* This route is where a failed Home resolution sends people, and it
            shares the very context whose failure sent them. So a refresh that
            fails keeps the rows it already had, with the error beside them --
            a recovery surface that goes blank under exactly the conditions that
            bring people to it is not a recovery surface. */}
        {loadError && bowls.length > 0 && (
          <div className="status-error" role="alert">
            {loadError} <button className="btn btn-secondary mt-3" onClick={() => refresh()}>Retry</button>
          </div>
        )}
        {hasNoTrustworthyList ? (
          <div className="panel text-sm text-slate-400" role="status">
            Loading bowls…
          </div>
        ) : loadError && bowls.length === 0 ? (
          <div className="status-error" role="alert">
            {loadError} <button className="btn btn-secondary mt-3" onClick={() => refresh()}>Retry</button>
          </div>
        ) : shouldShowFirstRun ? (
          // A first run is one thing to do: name a bowl. Services can wait for
          // the filters, and the empty bowl offers a starter pack itself.
          <section className="page-hero flex flex-col items-center py-8 text-center">
            <img src={bowlImage} alt="" aria-hidden="true" className="h-28 w-28 object-contain sm:h-36 sm:w-36" />
            <form
              className="mt-6 flex w-full max-w-md flex-col gap-3 sm:flex-row"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!newBowlName.trim() || isCreating) return;
                const result = await handleCreateBowl();
                if (result?.ok && result.bowl?.id) navigate(`/bowl/${result.bowl.id}`);
              }}
            >
              <label htmlFor="first-bowl-name" className="sr-only">Bowl name</label>
              <input
                id="first-bowl-name"
                type="text"
                className="input-field flex-1 text-center sm:text-left"
                placeholder="Name your bowl"
                value={newBowlName}
                disabled={isCreating}
                onChange={(event) => setNewBowlName(event.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={isCreating || !newBowlName.trim()}>
                {isCreating ? "Creating…" : "Create bowl"}
              </button>
            </form>
            {createErrorMessage && <div className="status-error mt-3" role="alert">{createErrorMessage}</div>}
          </section>
        ) : (
          <>
            {pendingInvites.length > 0 && (
              <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-sm text-slate-300">
                  You have {pendingInvites.length} pending invitation
                  {pendingInvites.length === 1 ? "" : "s"}.
                </p>
                <Link to="/invites" className="btn btn-secondary">Review invitations</Link>
              </div>
            )}
              <section className="space-y-3">
              <div className="mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">Owned by you</h3>
                  <p className="text-sm text-slate-400">Bowls you manage and can configure.</p>
                </div>
              </div>
              {ownedBowls.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/35 p-6 text-sm text-slate-400">
                  You have not created any bowls yet.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {ownedBowls.map((bowl) => (
                    <BowlCard key={bowl.id} bowl={bowl} onSelect={handleSelectBowl} isHome={bowl.id === defaultBowlId} />
                  ))}
                </div>
              )}
            </section>

              <section className="space-y-3">
              <div className="mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">Shared with you</h3>
                  <p className="text-sm text-slate-400">Bowls where you participate as a member.</p>
                </div>
              </div>
              {sharedBowls.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/35 p-6 text-sm text-slate-400">
                  No shared bowls yet.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {sharedBowls.map((bowl) => (
                    <BowlCard key={bowl.id} bowl={bowl} onSelect={handleSelectBowl} isHome={bowl.id === defaultBowlId} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <CreateBowlModal
        isOpen={isModalOpen}
        bowlName={newBowlName}
        inviteEmails={inviteEmails}
        onChangeBowlName={setNewBowlName}
        onChangeInviteEmails={setInviteEmails}
        onCreate={handleCreateBowl}
        onClose={handleCloseModal}
        isCreating={isCreating}
        errorMessage={createErrorMessage}
      />
    </div>
  );
}
