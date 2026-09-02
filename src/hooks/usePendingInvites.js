import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  const [error, setError] = useState(null);
  // Loads overlap -- a mount load, a page entry, a foreground -- and the slowest
  // must not be the one that wins. Only the newest request may write.
  const generation = useRef(0);

  const load = useCallback(async () => {
    const request = ++generation.current;
    const isCurrent = () => request === generation.current;
    setIsLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const userEmail = String(authData?.session?.user?.email || "").trim().toLowerCase();

      if (authError) {
        console.error("[usePendingInvites] Failed to read the session", authError);
        // A session read that failed says nothing about the inbox. Only a
        // successful read showing no user means there is nothing to show.
        if (isCurrent()) setError("Could not check for invitations. Try again.");
        return;
      }

      if (!userEmail) {
        if (!isCurrent()) return;
        setInvites([]);
        setError(null);
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
        // Keep the last good rows and the badge that goes with them. Reporting
        // zero here would tell someone an invitation had vanished, and the
        // navigation badge would quietly drop to nothing.
        if (isCurrent()) setError("Could not check for invitations. Try again.");
        return;
      }

      const rows = inviteRows || [];
      const detailed = rows.length === 0 ? [] : await loadInviteDetails(rows);
      if (!isCurrent()) return;
      setInvites(detailed);
      setError(null);
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, []);

  // The badge is app-wide, so the refresh that keeps it honest belongs here
  // rather than on the Invitations page: coming back to any screen should not
  // leave a stale count behind.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => { if (!cancelled) void load(); };
    const onForeground = () => {
      if (document.visibilityState !== "hidden") refresh();
    };
    void Promise.resolve().then(refresh);
    window.addEventListener("focus", onForeground);
    document.addEventListener("visibilitychange", onForeground);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onForeground);
      document.removeEventListener("visibilitychange", onForeground);
    };
  }, [load]);

  // Acting on an invitation has to invalidate reads that started before it.
  // Those reads carry a list that still contains this row, and without the bump
  // they are still the newest request and would write it straight back. The
  // loading flag is cleared here because the read we just discarded is the one
  // that would otherwise have cleared it.
  const dropInvite = useCallback((inviteId) => {
    generation.current += 1;
    setInvites((previous) => previous.filter((row) => row.id !== inviteId));
    setIsLoading(false);
  }, []);

  const acceptInvite = useCallback(async (invite) => {
    const result = await acceptBowlInvite(invite?.token);

    if (!result.ok) {
      return { error: result.message };
    }

    dropInvite(invite.id);
    return { error: null };
  }, [dropInvite]);

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

    dropInvite(invite.id);
    return { error: null };
  }, [dropInvite]);

  const value = useMemo(
    () => ({
      invites,
      pendingInviteCount: invites.length,
      isLoading,
      error,
      reloadInvites: load,
      acceptInvite,
      declineInvite,
    }),
    [invites, isLoading, error, load, acceptInvite, declineInvite]
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
