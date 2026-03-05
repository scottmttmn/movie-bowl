import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BowlCard from "../components/BowlCard";
import NewBowlButton from "../components/NewBowlButton";
import CreateBowlModal from "../components/CreateBowlModal";
import useUserStreamingServices from "../hooks/useUserStreamingServices";
import { sendInviteEmails } from "../lib/inviteEmails";
import { supabase } from "../lib/supabase";
import { MAX_BOWLS_PER_USER } from "../utils/appLimits";
import { parseInviteEmails } from "../utils/parseInviteEmails";

// Supabase client is centralized in src/lib/supabase.js

export default function MyBowlsScreen() {
  // Bowls shown on the home screen. Loaded from Supabase for the logged-in user.
  const [bowls, setBowls] = useState([]);

  // Simple loading flag so we can avoid flashing mock content.
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newBowlName, setNewBowlName] = useState("");
  const [inviteEmails, setInviteEmails] = useState("");
  const [newBowlMaxContributionLead, setNewBowlMaxContributionLead] = useState("");
  const [createErrorMessage, setCreateErrorMessage] = useState(null);
  const [createActionMessage, setCreateActionMessage] = useState(null);
  const navigate = useNavigate();
  const {
    streamingServices,
    loading: isStreamingServicesLoading,
  } = useUserStreamingServices();
  const ownedBowlCount = bowls.filter((b) => b.role === "Owner").length;
  const isCreateBowlLimitReached = ownedBowlCount >= MAX_BOWLS_PER_USER;
  const ownedBowls = bowls.filter((b) => b.role === "Owner");
  const sharedBowls = bowls.filter((b) => b.role !== "Owner");
  const hasStreamingServices = streamingServices.length > 0;
  const shouldShowGuidedSetup = !isLoading && !isStreamingServicesLoading && bowls.length === 0;

  useEffect(() => {
    // Load bowls the user owns, plus bowls they are a member of.
    const loadBowls = async () => {
      setIsLoading(true);

      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;

      if (authError || !user) {
        // If the user is not authenticated, show an empty list.
        setBowls([]);
        setIsLoading(false);
        return;
      }

      // Determine access from authoritative ownership + membership tables.
      const [{ data: ownedRows, error: ownedError }, { data: memberRows, error: memberError }] =
        await Promise.all([
          supabase.from("bowls").select("id").eq("owner_id", user.id),
          supabase.from("bowl_members").select("bowl_id").eq("user_id", user.id),
        ]);

      if (ownedError || memberError) {
        console.error("Failed to load user bowl access", ownedError || memberError);
        setBowls([]);
        setIsLoading(false);
        return;
      }

      const allowedBowlIds = new Set([
        ...(ownedRows || []).map((row) => row.id),
        ...(memberRows || []).map((row) => row.bowl_id),
      ]);

      if (allowedBowlIds.size === 0) {
        setBowls([]);
        setIsLoading(false);
        return;
      }

      // Load bowl cards + counts from RPC, then filter to only accessible bowls.
      const { data: rows, error: bowlsError } = await supabase.rpc(
        "get_my_bowls_with_counts"
      );

      if (bowlsError) {
        console.error("Failed to load bowls", bowlsError);
        setBowls([]);
        setIsLoading(false);
        return;
      }

      setBowls(
        (rows || [])
          .filter((b) => allowedBowlIds.has(b.id))
          .map((b) => ({
            id: b.id,
            name: b.name,
            remainingCount: Number(b.remaining_count || 0),
            memberCount: Number(b.member_count || 0),
            role: b.owner_id === user.id ? "Owner" : "Member",
          }))
      );

      setIsLoading(false);
      return;
    };

    loadBowls();
  }, []);

  const handleSelectBowl = (bowlId) => {
    navigate(`/bowl/${bowlId}`);
  };

  const handleNewBowl = () => {
    if (isCreateBowlLimitReached) {
      setCreateErrorMessage(`You can create up to ${MAX_BOWLS_PER_USER} bowls.`);
      setCreateActionMessage(null);
      return;
    }
    setCreateErrorMessage(null);
    setCreateActionMessage(null);
    setIsModalOpen(true);
  };

  const handleGoToStreamingServices = () => {
    navigate("/settings#streaming-services");
  };

  const handleCreateBowl = async () => {
    setCreateErrorMessage(null);
    setCreateActionMessage(null);

    if (isCreateBowlLimitReached) {
      setCreateErrorMessage(`You can create up to ${MAX_BOWLS_PER_USER} bowls.`);
      return;
    }

    const bowlName = newBowlName.trim();
    if (!bowlName) {
      setCreateErrorMessage("Bowl name is required.");
      return;
    }

    const { validEmails, invalidEmails } = parseInviteEmails(inviteEmails);
    if (invalidEmails.length > 0) {
      setCreateErrorMessage(`Invalid email(s): ${invalidEmails.join(", ")}`);
      return;
    }

    const leadInput = newBowlMaxContributionLead.trim();
    let maxContributionLead = null;
    if (leadInput !== "") {
      const parsedLead = Number(leadInput);
      if (!Number.isInteger(parsedLead) || parsedLead < 1) {
        setCreateErrorMessage("Max contribution lead must be a whole number 1 or greater.");
        return;
      }
      maxContributionLead = parsedLead;
    }

    const { data: authData, error: userError } = await supabase.auth.getSession();
    const user = authData?.session?.user;
    if (userError || !user) {
      console.error("Not authenticated", userError);
      setCreateErrorMessage("You must be signed in to create a bowl.");
      return;
    }

    // Insert new bowl into Supabase
    let { data: newBowl, error: bowlError } = await supabase
      .from("bowls")
      .insert([{
        owner_id: user.id,
        name: bowlName,
        max_contribution_lead: maxContributionLead,
        draw_access_mode: "all_members",
      }])
      .select()
      .single();

    if (bowlError && String(bowlError?.message || "").toLowerCase().includes("draw_access_mode")) {
      const fallback = await supabase
        .from("bowls")
        .insert([{
          owner_id: user.id,
          name: bowlName,
          max_contribution_lead: maxContributionLead,
        }])
        .select()
        .single();
      newBowl = fallback.data;
      bowlError = fallback.error;
    }

    if (bowlError || !newBowl) {
      console.error("Failed to create bowl", bowlError);
      setCreateErrorMessage("Failed to create bowl.");
      return;
    }

    // Insert bowl member as owner
    const { error: memberError } = await supabase
      .from("bowl_members")
      .insert([{ bowl_id: newBowl.id, user_id: user.id, role: "Owner" }]);

    if (memberError) {
      console.error("Failed to add owner membership", memberError);
      setCreateErrorMessage("Failed to add owner membership.");
      return;
    }

    if (validEmails.length > 0) {
      const inviteRows = validEmails.map((email) => ({
        bowl_id: newBowl.id,
        invited_email: email,
        invited_by: user.id,
        token: crypto.randomUUID(),
      }));

      const { error: inviteError } = await supabase
        .from("bowl_invites")
        .insert(inviteRows);

      if (inviteError) {
        console.error("Failed to create invites", inviteError);
        setCreateErrorMessage("Bowl created, but invites could not be created.");
      } else {
        const emailResult = await sendInviteEmails(
          validEmails.map((email, index) => ({
            bowlId: newBowl.id,
            bowlName: newBowl.name,
            invitedEmail: email,
            invitedByEmail: user.email || null,
            token: inviteRows[index].token,
          }))
        );

        if (!emailResult.error && emailResult.failed === 0) {
          setCreateActionMessage(
            `Bowl created and ${emailResult.sent} invite email${emailResult.sent === 1 ? "" : "s"} sent.`
          );
        } else if (emailResult.sent > 0) {
          setCreateActionMessage(
            `Bowl created, but only ${emailResult.sent} of ${validEmails.length} invite email${validEmails.length === 1 ? "" : "s"} sent.`
          );
        } else {
          setCreateActionMessage(
            "Bowl created, but invite emails could not be sent. You can still share the invite links from Bowl Settings."
          );
        }
      }
    }

    // Update local state with new bowl
    const bowlToAdd = {
      id: newBowl.id,
      name: newBowl.name,
      remainingCount: 0,
      memberCount: 1,
      role: "Owner",
    };
    setBowls((prev) => [...prev,bowlToAdd]);
    setNewBowlName("");
    setInviteEmails("");
    setNewBowlMaxContributionLead("");
    setIsModalOpen(false);
  };

  const handleCloseModal = () => {
    setNewBowlName("");
    setInviteEmails("");
    setNewBowlMaxContributionLead("");
    setCreateErrorMessage(null);
    setCreateActionMessage(null);
    setIsModalOpen(false);
  };

  return (
    <div className="my-bowls-screen page-container py-4">
      <header className="mb-6">
        {createErrorMessage && <div className="mb-3 text-sm text-red-600">{createErrorMessage}</div>}
        {createActionMessage && <div className="mb-3 text-sm text-green-700">{createActionMessage}</div>}
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-800">My Bowls</h2>
            <p className="mt-2 text-sm text-slate-600">
              Jump back into a bowl or create a new one.
            </p>
          </div>
          <div className="flex justify-start md:justify-end">
            <NewBowlButton onClick={handleNewBowl} disabled={isCreateBowlLimitReached} />
          </div>
        </div>
        {isCreateBowlLimitReached && (
          <div className="mt-3 text-xs text-slate-500">
            Bowl limit reached ({MAX_BOWLS_PER_USER}).
          </div>
        )}
      </header>
      <div className="space-y-8">
        {isLoading || isStreamingServicesLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-gray-600 shadow-sm">
            Loading bowls…
          </div>
        ) : shouldShowGuidedSetup ? (
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="max-w-2xl">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
                  First steps
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-slate-900">
                  Start your first movie bowl
                </h3>
                <p className="mt-3 text-sm text-slate-600">
                  Pick your streaming services, then create a bowl for yourself or your group.
                </p>
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button className="btn btn-primary" onClick={handleNewBowl}>
                  Create your first bowl
                </button>
                <button className="btn btn-secondary" onClick={handleGoToStreamingServices}>
                  Set up streaming services
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-50/75 p-4 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                Guided setup
              </h3>
              <div className="mt-4 space-y-3">
                <article className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Step 1
                      </p>
                      <h4 className="mt-1 text-base font-semibold text-slate-800">
                        Set up your streaming services
                      </h4>
                      <p className="mt-1 text-sm text-slate-600">
                        This helps prioritize movies you can actually watch.
                      </p>
                    </div>
                    <span
                      className={[
                        "inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                        hasStreamingServices
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-600",
                      ].join(" ")}
                    >
                      {hasStreamingServices ? "Done" : "Recommended"}
                    </span>
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleGoToStreamingServices}
                      className={hasStreamingServices ? "text-sm font-medium text-blue-600 hover:text-blue-700" : "btn btn-secondary"}
                    >
                      {hasStreamingServices ? "Edit" : "Set up services"}
                    </button>
                  </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Step 2
                      </p>
                      <h4 className="mt-1 text-base font-semibold text-slate-800">
                        Create your first bowl
                      </h4>
                      <p className="mt-1 text-sm text-slate-600">
                        Add a bowl now and start collecting movies to draw from.
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      Next
                    </span>
                  </div>
                  <div className="mt-4">
                    <button type="button" onClick={handleNewBowl} className="btn btn-secondary">
                      Create bowl
                    </button>
                  </div>
                </article>
              </div>
            </section>
          </div>
        ) : (
          <>
            <section>
              <div className="mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Owned by you</h3>
                  <p className="text-sm text-slate-500">Bowls you manage and can configure.</p>
                </div>
              </div>
              {ownedBowls.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm text-slate-600">
                  You have not created any bowls yet.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {ownedBowls.map((bowl) => (
                    <BowlCard key={bowl.id} bowl={bowl} onSelect={handleSelectBowl} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Shared with you</h3>
                  <p className="text-sm text-slate-500">Bowls where you participate as a member.</p>
                </div>
              </div>
              {sharedBowls.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm text-slate-600">
                  No shared bowls yet.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {sharedBowls.map((bowl) => (
                    <BowlCard key={bowl.id} bowl={bowl} onSelect={handleSelectBowl} />
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
        maxContributionLead={newBowlMaxContributionLead}
        onChangeBowlName={setNewBowlName}
        onChangeInviteEmails={setInviteEmails}
        onChangeMaxContributionLead={setNewBowlMaxContributionLead}
        onCreate={handleCreateBowl}
        onClose={handleCloseModal}
      />
    </div>
  );
}
