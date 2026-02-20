import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Custom hook to manage Supabase authentication state
// Handles session retrieval, auth state changes, and login/logout helpers

export default function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount:
  // 1. Fetch the current session (if user is already logged in)
  // 2. Subscribe to auth state changes (login, logout, token refresh)
  useEffect(() => {
    // Get the current session from Supabase
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Listen for authentication state changes
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    // Cleanup subscription when component unmounts
    return () => listener.subscription.unsubscribe();
  }, []);

  // Send magic link to user's email
  const signIn = async (email) => {
    return await supabase.auth.signInWithOtp({ email });
  };

  // Log the user out and clear session
  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // Expose auth state and helper functions to components
  return { session, loading, signIn, signOut };
}