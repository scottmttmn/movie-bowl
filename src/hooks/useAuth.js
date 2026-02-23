import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Custom hook to manage Supabase authentication state
// Handles session retrieval, auth state changes, and login/logout helpers

// Note: Supabase stores authenticated users in `auth.users`.
// Our app stores user preferences and app-specific data in `public.profiles`.
// We keep a `profiles` row in sync by upserting it whenever a session/user is available.

export default function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Ensure an app-level profile row exists for the signed-in user.
  // This is a lightweight safety net; the best long-term solution is a DB trigger.
  const ensureProfile = async (user) => {
    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email: user.email ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    if (error) {
      console.error("[useAuth.ensureProfile] Failed to upsert profile", error);
    }
  };

  // On mount:
  // 1. Fetch the current session (if user is already logged in)
  // 2. Subscribe to auth state changes (login, logout, token refresh)
  useEffect(() => {
    // Get the current session from Supabase.
    // IMPORTANT: always flip loading off, even if profile upsert fails.
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error("[useAuth] Failed to get session", error);
        }

        setSession(data?.session ?? null);

        // Fire-and-forget profile upsert; do not block the UI on this.
        ensureProfile(data?.session?.user).catch((err) => {
          console.error("[useAuth.ensureProfile] Unexpected error", err);
        });
      } catch (err) {
        console.error("[useAuth] Unexpected error while getting session", err);
        setSession(null);
      } finally {
        setLoading(false);
      }
    })();

    // Listen for authentication state changes
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);

        // If we get any auth event, we definitely have an answer about auth state.
        setLoading(false);

        // Keep profile row in sync on sign-in and token refresh.
        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "USER_UPDATED"
        ) {
          // Do not block UI updates on this.
          ensureProfile(session?.user).catch((err) => {
            console.error("[useAuth.ensureProfile] Unexpected error", err);
          });
        }
      }
    );

    // Cleanup subscription when component unmounts
    return () => {
      try {
        listener?.subscription?.unsubscribe();
      } catch (err) {
        console.error("[useAuth] Failed to unsubscribe auth listener", err);
      }
    };
  }, []);

  // Send magic link to user's email
  const signIn = async (email) => {
    return await supabase.auth.signInWithOtp({ email });
  };

  // Log the user out and clear session.
  // Return the Supabase response so callers can check for errors.
  const signOut = async () => {
    const res = await supabase.auth.signOut();

    // Clear local session immediately (onAuthStateChange should also fire).
    setSession(null);

    return res;
  };

  // Expose auth state and helper functions to components
  return { session, loading, signIn, signOut };
}