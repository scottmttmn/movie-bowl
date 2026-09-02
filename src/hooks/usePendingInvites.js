import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { acceptBowlInvite } from "../lib/bowlInvites";
import { supabase } from "../lib/supabase";

// Pending bowl invites are shared state: the top nav shows a count badge while
// the invites page and My Bowls both list and act on the same rows. Keeping the
// data in one provider means accepting an invite updates every surface at once.

const PendingInvitesContext = createContext(null);

async function loadInviteDetails(invites) {
  const bowlIds = [...new Set(invites.map((row) => row.bowl_id).filter(Boolean))];
  const inviterIds = [...new Set(invites.map((row) => row.invited_by).filter(Boolean))];

  const [bowlLookup, inviterLookup] = await Promise.all([
    bowlIds.length > 0
      ? supabase.from("bowls").select("id, name").in("id", bowlIds)
      : Promise.resolve({ data: [], error: null }),
    inviterIds.length > 0
      ? supabase.rpc("get_my_invite_sender_directory")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (bowlLookup.error) {
    console.error("[usePendingInvites] Failed to load invite bowl names", bowlLookup.error);
  }
  if (inviterLookup.error) {
    console.error("[usePendingInvites] Failed to load invite sender emails", inviterLookup.error);
  }

  const bowlNameById = new Map((bowlLookup.data || []).map((row) => [row.id, row.name]));
  const inviterEmailById = new Map(
    (inviterLookup.data || []).map((row) => [row.user_id, row.email])
  );

  return invites.map((invite) => ({
    ...invite,
    bowl_name: bowlNameById.get(invite.bowl_id) || "Movie Bowl Invite",
    invited_by_email: inviterEmailById.get(invite.invited_by) || null,
  }));
}

export function PendingInvitesProvider({ children }) {
  const [invites, setInvites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const userEmail = String(authData?.session?.user?.email || "").trim().toLowerCase();

      if (authError || !userEmail) {
        setInvites([]);
        return;
      }

      const { data: inviteRows, error: inviteError } = await supabase
        .from("bowl_invites")
        .select("id, bowl_id, invited_email, invited_by, created_at, token")
        .is("accepted_at", null)
        .ilike("invited_email", userEmail)
        .order("created_at", { ascending: false });

      if (inviteError) {
        console.error("[usePendingInvites] Failed to load pending invites", inviteError);
        setInvites([]);
        return;
      }

      const rows = inviteRows || [];
      setInvites(rows.length === 0 ? [] : await loadInviteDetails(rows));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const acceptInvite = useCallback(async (invite) => {
    const result = await acceptBowlInvite(invite?.token);

    if (!result.ok) {
      return { error: result.message };
    }

    setInvites((prev) => prev.filter((row) => row.id !== invite.id));
    return { error: null };
  }, []);

  const declineInvite = useCallback(async (invite) => {
    const { data: authData, error: authError } = await supabase.auth.getSession();
    const user = authData?.session?.user;
    const userEmail = String(user?.email || "").trim().toLowerCase();

    if (authError || !user || !userEmail) {
      return { error: "You must be signed in to manage invites." };
    }

    const { error: deleteError } = await supabase
      .from("bowl_invites")
      .delete()
      .eq("id", invite.id)
      .ilike("invited_email", userEmail);

    if (deleteError) {
      console.error("[usePendingInvites] Failed to decline invite", deleteError);
      return { error: "Failed to decline invite." };
    }

    setInvites((prev) => prev.filter((row) => row.id !== invite.id));
    return { error: null };
  }, []);

  const value = useMemo(
    () => ({
      invites,
      pendingInviteCount: invites.length,
      isLoading,
      reloadInvites: load,
      acceptInvite,
      declineInvite,
    }),
    [invites, isLoading, load, acceptInvite, declineInvite]
  );

  return createElement(PendingInvitesContext.Provider, { value }, children);
}

export default function usePendingInvites() {
  const context = useContext(PendingInvitesContext);
  if (!context) {
    throw new Error("usePendingInvites must be used within a PendingInvitesProvider");
  }
  return context;
}
