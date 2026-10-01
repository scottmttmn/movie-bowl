import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Who is in a bowl, read only while the people sheet is open: the roster with
// roles, the names the profile directory will share, and for the owner the
// invitations still waiting. A failed name or invite read degrades to fewer
// details rather than an empty sheet; only the roster itself is required.
export default function useBowlPeople(bowlId, { enabled = false, includeInvites = false } = {}) {
  const key = `${bowlId}|${includeInvites}`;
  const [state, setState] = useState({ key: null, status: "idle", members: [], invites: [], names: {} });

  useEffect(() => {
    if (!enabled || !bowlId) return undefined;
    let cancelled = false;

    const load = async () => {
      const [membersResult, profilesResult, invitesResult] = await Promise.all([
        supabase.from("bowl_members").select("user_id, role").eq("bowl_id", bowlId),
        supabase.rpc("get_bowl_profile_directory", { p_bowl_id: bowlId }),
        includeInvites
          ? supabase
            .from("bowl_invites")
            .select("id, invited_email, created_at")
            .eq("bowl_id", bowlId)
            .is("accepted_at", null)
            .order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (cancelled) return;

      if (membersResult.error) {
        console.error("[useBowlPeople] Failed to load members", membersResult.error);
        setState({ key, status: "error", members: [], invites: [], names: {} });
        return;
      }
      if (profilesResult.error) {
        console.error("[useBowlPeople] Failed to load member names", profilesResult.error);
      }
      if (invitesResult.error) {
        console.error("[useBowlPeople] Failed to load pending invites", invitesResult.error);
      }

      const nameByUserId = new Map(
        (profilesResult.data || []).map((row) => [row.user_id, row.display_name || null])
      );
      setState({
        key,
        status: "ready",
        members: (membersResult.data || [])
          .filter((row) => row?.user_id)
          .map((row) => ({
            userId: row.user_id,
            role: row.role,
            displayName: nameByUserId.get(row.user_id) || null,
          })),
        invites: (invitesResult.data || []).filter((row) => row?.invited_email),
        // Older bowls can have an owner with no bowl_members row; the
        // directory still names them, so the rows can add them back.
        names: Object.fromEntries(nameByUserId),
      });
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [bowlId, enabled, includeInvites, key]);

  // Reopening shows what the last read found while the next one runs; another
  // bowl's people are never shown for this one.
  if (state.key !== key) return { status: enabled ? "loading" : "idle", members: [], invites: [], names: {} };
  return state;
}
