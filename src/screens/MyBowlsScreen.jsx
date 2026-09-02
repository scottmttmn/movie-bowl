import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BowlCard from "../components/BowlCard";
import NewBowlButton from "../components/NewBowlButton";
import CreateBowlModal from "../components/CreateBowlModal";
import PendingInviteList from "../components/PendingInviteList";
import useCreateBowl from "../hooks/useCreateBowl";
import useUserBowls from "../hooks/useUserBowls";
import { sortBowlsByRecentActivity } from "../utils/bowlOrdering";
import usePendingInvites from "../hooks/usePendingInvites";
import useUserStreamingServices from "../hooks/useUserStreamingServices";
import { MAX_BOWLS_PER_USER } from "../utils/appLimits";

export default function MyBowlsScreen() {
  const { bowls, defaultBowlId, loading: isLoading, error: loadError, refresh,
    setDefaultBowl, savingDefault } = useUserBowls();
  const [defaultMessage, setDefaultMessage] = useState(null);
  const [defaultError, setDefaultError] = useState(null);
  const [inviteActionMessage, setInviteActionMessage] = useState(null);
  const [inviteErrorMessage, setInviteErrorMessage] = useState(null);
  const navigate = useNavigate();
  const {
    streamingServices,
    loading: isStreamingServicesLoading,
  } = useUserStreamingServices();
  const {
    invites: pendingInvites,
    isLoading: isInvitesLoading,
    acceptInvite,
    declineInvite,
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
  const hasStreamingServices = streamingServices.length > 0;
  const shouldShowGuidedSetup =
    !isLoading &&
    !isStreamingServicesLoading &&
    !isInvitesLoading &&
    bowls.length === 0 &&
    pendingInvites.length === 0;

  useEffect(() => { void refresh(); }, [refresh]);

  const handleDefault = async (bowl) => {
    if (savingDefault || bowl.id === defaultBowlId) return;
    setDefaultMessage(null);
    setDefaultError(null);
    if (await setDefaultBowl(bowl.id)) setDefaultMessage(`${bowl.name} is now your home bowl`);
    else setDefaultError("Could not change your home bowl. Please try again.");
  };

  const handleAcceptInvite = async (invite) => {
    setInviteActionMessage(null);
    setInviteErrorMessage(null);

    const { error } = await acceptInvite(invite);
    if (error) {
      setInviteErrorMessage(error);
      return;
    }

    setInviteActionMessage("Invite accepted.");
    navigate(`/bowl/${invite.bowl_id}`);
  };

  const handleDeclineInvite = async (invite) => {
    setInviteActionMessage(null);
    setInviteErrorMessage(null);

    const { error } = await declineInvite(invite);
    if (error) {
      setInviteErrorMessage(error);
      return;
    }

    setInviteActionMessage("Invite declined.");
  };

  const handleSelectBowl = (bowlId) => {
    navigate(`/bowl/${bowlId}`);
  };

  const handleGoToStreamingServices = () => {
    navigate("/settings#streaming-services");
  };

  return (
    <div className="my-bowls-screen page-container py-6 sm:py-8">
      <header className="mb-8">
        <div className="mb-4 space-y-2" aria-live="polite">
          {defaultMessage && <div className="status-success" role="status">{defaultMessage}</div>}
          {defaultError && <div className="status-error" role="alert">{defaultError}</div>}
          {createErrorMessage && !isModalOpen && <div className="status-error" role="alert">{createErrorMessage}</div>}
          {createActionMessage && <div className="status-success">{createActionMessage}</div>}
          {inviteErrorMessage && <div className="status-error">{inviteErrorMessage}</div>}
          {inviteActionMessage && <div className="status-success">{inviteActionMessage}</div>}
        </div>
        <div className="page-hero flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="eyebrow">Home</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">My Bowls</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400 sm:text-base">
              Open an existing bowl or start a new one.
            </p>
          </div>
          <div className="flex justify-start md:justify-end">
            <NewBowlButton onClick={handleNewBowl} disabled={isCreateBowlLimitReached || isCreating} />
          </div>
        </div>
        {isCreateBowlLimitReached && (
          <div className="status-warning mt-3">
            Bowl limit reached ({MAX_BOWLS_PER_USER}).
          </div>
        )}
      </header>
      <div className="section-stack">
        {isLoading || isStreamingServicesLoading || isInvitesLoading ? (
          <div className="panel text-sm text-slate-400" role="status">
            Loading bowls…
          </div>
        ) : loadError ? (
          <div className="status-error" role="alert">
            {loadError} <button className="btn btn-secondary mt-3" onClick={() => refresh()}>Retry</button>
          </div>
        ) : shouldShowGuidedSetup ? (
          <div className="space-y-4">
            <section className="page-hero">
              <div className="max-w-2xl">
                <p className="eyebrow">
                  First steps
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
                  Start your first movie bowl
                </h2>
                <p className="mt-3 text-sm text-slate-400 sm:text-base">
                  Pick your streaming services, then create a bowl for yourself or your group.
                </p>
              </div>
              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <button className="btn btn-primary" onClick={handleNewBowl} disabled={isCreating}>
                  Create your first bowl
                </button>
                <button className="btn btn-ghost px-3 py-2 text-sm" onClick={handleGoToStreamingServices}>
                  Set up streaming services
                </button>
              </div>
            </section>

            <section className="panel-muted">
              <h3 className="eyebrow">
                Guided setup
              </h3>
              <div className="mt-4 space-y-3">
                <article className="surface-card p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Step 1
                      </p>
                      <h4 className="mt-1 text-base font-semibold text-slate-100">
                        Set up your streaming services
                      </h4>
                      <p className="mt-1 text-sm text-slate-400">
                        This helps prioritize movies you can actually watch.
                      </p>
                    </div>
                    <span
                      className={[
                        "inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                        hasStreamingServices
                          ? "bg-emerald-100 text-emerald-300"
                          : "bg-slate-700 text-slate-400",
                      ].join(" ")}
                    >
                      {hasStreamingServices ? "Done" : "Recommended"}
                    </span>
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleGoToStreamingServices}
                      className={hasStreamingServices ? "text-sm font-medium text-rose-300 hover:text-rose-300" : "btn btn-secondary"}
                    >
                      {hasStreamingServices ? "Edit" : "Set up services"}
                    </button>
                  </div>
                </article>

                <article className="surface-card p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Step 2
                      </p>
                      <h4 className="mt-1 text-base font-semibold text-slate-100">
                        Create your first bowl
                      </h4>
                      <p className="mt-1 text-sm text-slate-400">
                        Add a bowl now and start collecting movies to draw from.
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 rounded-full bg-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-400">
                      Next
                    </span>
                  </div>
                  <div className="mt-4">
                    <button type="button" onClick={handleNewBowl} className="btn btn-secondary" disabled={isCreating}>
                      Create bowl
                    </button>
                  </div>
                </article>
              </div>
            </section>
          </div>
        ) : (
          <>
            <PendingInviteList
              invites={pendingInvites}
              onAccept={handleAcceptInvite}
              onDecline={handleDeclineInvite}
            />
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
                    <BowlCard key={bowl.id} bowl={bowl} onSelect={handleSelectBowl} isDefault={bowl.id === defaultBowlId} onMakeDefault={() => handleDefault(bowl)} defaultDisabled={savingDefault} />
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
                    <BowlCard key={bowl.id} bowl={bowl} onSelect={handleSelectBowl} isDefault={bowl.id === defaultBowlId} onMakeDefault={() => handleDefault(bowl)} defaultDisabled={savingDefault} />
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
