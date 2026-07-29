import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

function getActivityTime(bowl) {
  const time = new Date(bowl?.lastActivityAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortBowlsByActivity(bowls) {
  return [...bowls].sort((a, b) => {
    const activityDifference = getActivityTime(b) - getActivityTime(a);
    if (activityDifference !== 0) return activityDifference;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });
}

export function useTvBowls(userId) {
  const [bowls, setBowls] = useState([]);
  const [isLoading, setIsLoading] = useState(Boolean(userId));
  const [errorMessage, setErrorMessage] = useState(null);

  const loadBowls = useCallback(async () => {
    if (!userId) {
      setBowls([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [
        { data: ownedRows, error: ownedError },
        { data: memberRows, error: memberError },
      ] = await Promise.all([
        supabase.from("bowls").select("id").eq("owner_id", userId),
        supabase.from("bowl_members").select("bowl_id").eq("user_id", userId),
      ]);

      if (ownedError || memberError) {
        throw ownedError || memberError;
      }

      const allowedBowlIds = new Set([
        ...(ownedRows || []).map((row) => row.id),
        ...(memberRows || []).map((row) => row.bowl_id),
      ]);

      if (allowedBowlIds.size === 0) {
        setBowls([]);
        return;
      }

      const { data: rows, error } = await supabase.rpc("get_my_bowls_with_counts");
      if (error) throw error;

      setBowls(
        sortBowlsByActivity(
          (rows || [])
            .filter((bowl) => allowedBowlIds.has(bowl.id))
            .map((bowl) => ({
              id: bowl.id,
              name: bowl.name || "Untitled bowl",
              remainingCount: Number(bowl.remaining_count || 0),
              memberCount: Number(bowl.member_count || 0),
              role: bowl.owner_id === userId ? "Owner" : "Member",
              lastActivityAt:
                bowl.last_activity_at || bowl.updated_at || bowl.created_at || null,
            }))
        )
      );
    } catch (error) {
      console.error("[useTvBowls] Failed to load bowls", error);
      setBowls([]);
      setErrorMessage("Movie Bowl could not load your bowls. Try again.");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadBowls();
  }, [loadBowls]);

  return {
    bowls,
    isLoading,
    errorMessage,
    reload: loadBowls,
  };
}

export function useTvBowlAccess(bowlId, userId) {
  const [bowlMeta, setBowlMeta] = useState({
    name: "Movie Bowl",
    ownerId: null,
    canDraw: false,
  });
  const [isLoading, setIsLoading] = useState(Boolean(bowlId && userId));
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadAccess = async () => {
      if (!bowlId || !userId) {
        if (!cancelled) {
          setIsLoading(false);
          setErrorMessage("Choose a bowl to continue.");
        }
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        let { data: bowlRow, error: bowlError } = await supabase
          .from("bowls")
          .select("name, owner_id, draw_access_mode")
          .eq("id", bowlId)
          .single();

        const missingAccessColumn = String(bowlError?.message || "")
          .toLowerCase()
          .includes("draw_access_mode");

        if (bowlError && missingAccessColumn) {
          const fallback = await supabase
            .from("bowls")
            .select("name, owner_id")
            .eq("id", bowlId)
            .single();
          bowlRow = fallback.data;
          bowlError = fallback.error;
        }

        if (bowlError || !bowlRow) {
          throw bowlError || new Error("Bowl not found");
        }

        const isOwner = bowlRow.owner_id === userId;
        let isMember = isOwner;

        if (!isOwner) {
          const { data: memberRow, error: memberError } = await supabase
            .from("bowl_members")
            .select("user_id")
            .eq("bowl_id", bowlId)
            .eq("user_id", userId)
            .maybeSingle();

          if (memberError) throw memberError;
          isMember = Boolean(memberRow);
        }

        if (!isMember) {
          throw new Error("This television no longer has access to that bowl.");
        }

        let canDraw = isOwner || bowlRow.draw_access_mode !== "selected_members";

        if (!canDraw) {
          const { data: permissionRow, error: permissionError } = await supabase
            .from("bowl_draw_permissions")
            .select("user_id")
            .eq("bowl_id", bowlId)
            .eq("user_id", userId)
            .maybeSingle();

          const missingPermissionTable =
            String(permissionError?.message || "").toLowerCase().includes("does not exist") &&
            String(permissionError?.message || "")
              .toLowerCase()
              .includes("bowl_draw_permissions");

          if (permissionError && !missingPermissionTable) throw permissionError;
          canDraw = Boolean(permissionRow);
        }

        if (!cancelled) {
          setBowlMeta({
            name: bowlRow.name || "Movie Bowl",
            ownerId: bowlRow.owner_id,
            canDraw,
          });
        }
      } catch (error) {
        console.error("[useTvBowlAccess] Failed to load bowl access", error);
        if (!cancelled) {
          setErrorMessage(
            error?.message === "This television no longer has access to that bowl."
              ? error.message
              : "Movie Bowl could not open this bowl."
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadAccess();

    return () => {
      cancelled = true;
    };
  }, [bowlId, userId]);

  return {
    bowlMeta,
    isLoading,
    errorMessage,
  };
}
