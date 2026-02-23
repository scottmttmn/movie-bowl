import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation, useNavigate, useParams } from "react-router-dom";
import MyBowlsScreen from "./screens/MyBowlsScreen";
import BowlDashboard from "./screens/BowlDashboard";
import useAuth from "./hooks/useAuth";
import LoginPage from "./screens/LoginPage";
import UserSettings from "./screens/UserSettings";
import BowlSettings from "./screens/BowlSettings";
import { supabase } from "./lib/supabase";

function Layout({ children }) {
  const { signOut } = useAuth();
  const { session } = useAuth();
  const location = useLocation();
  const isLoginRoute = location.pathname === "/login";
  const isSettingsRoute = location.pathname === "/settings";

  return (
    <div className="min-h-screen">
      {/* Global actions stay pinned to the top for quick access */}
      {!isLoginRoute && session && (
        <div className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
            <div className="text-sm font-semibold tracking-wide text-gray-700">Movie Bowl</div>
            <div className="flex items-center gap-2">
            <Link
              to="/settings"
              aria-label="Settings"
              title="Settings"
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 shadow-sm transition ${
                isSettingsRoute
                  ? "pointer-events-none bg-gray-100 text-gray-500"
                  : "hover:border-gray-400 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-200"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.591 1.066c1.527-.94 3.31.843 2.37 2.37a1.724 1.724 0 0 0 1.065 2.592c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.591c.94 1.527-.843 3.31-2.37 2.37a1.724 1.724 0 0 0-2.592 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.591-1.066c-1.527.94-3.31-.843-2.37-2.37a1.724 1.724 0 0 0-1.065-2.592c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.591c-.94-1.527.843-3.31 2.37-2.37.996.612 2.296.07 2.592-1.066Z" />
                <path d="M12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" />
              </svg>
            </Link>

            <button
              onClick={signOut}
              aria-label="Log out"
              title="Log out"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
            >
              <span aria-hidden="true" className="text-lg leading-none">↪</span>
            </button>
            </div>
          </div>
        </div>
      )}

      <div className={!isLoginRoute && session ? "pt-16" : ""}>{children}</div>
    </div>
  );
}

function RequireAuth({ children }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div>Loading...</div>;

  // If user is not logged in, redirect to /login
  // and preserve the page they were trying to access
  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading } = useAuth();

  const [status, setStatus] = React.useState("loading");
  const [message, setMessage] = React.useState("Processing invite…");

  React.useEffect(() => {
    const run = async () => {
      if (loading) return;

      // Must be logged in to accept an invite.
      if (!session?.user) {
        navigate("/login", { replace: true, state: { from: location } });
        return;
      }

      if (!token) {
        setStatus("error");
        setMessage("Missing invite token.");
        return;
      }

      try {
        const userEmail = (session.user.email || "").toLowerCase();

        const { data: invite, error: inviteError } = await supabase
          .from("bowl_invites")
          .select("id, bowl_id, invited_email, accepted_at")
          .eq("token", token)
          .single();

        if (inviteError || !invite) {
          console.error("[AcceptInvite] Failed to load invite", inviteError);
          setStatus("error");
          setMessage("Invite not found or no longer valid.");
          return;
        }

        if (invite.accepted_at) {
          setStatus("success");
          setMessage("Invite already accepted. Redirecting…");
          navigate(`/bowl/${invite.bowl_id}`, { replace: true });
          return;
        }

        const invitedEmail = (invite.invited_email || "").toLowerCase();
        if (!userEmail || userEmail !== invitedEmail) {
          setStatus("error");
          setMessage(
            `This invite was created for ${invite.invited_email}. You are signed in as ${session.user.email}.`
          );
          return;
        }

        // Add membership. If already a member, continue.
        const { error: memberError } = await supabase.from("bowl_members").insert([
          {
            bowl_id: invite.bowl_id,
            user_id: session.user.id,
            role: "Member",
          },
        ]);

        if (memberError) {
          const msg = (memberError.message || "").toLowerCase();
          if (!msg.includes("duplicate")) {
            console.error("[AcceptInvite] Failed to add member", memberError);
            setStatus("error");
            setMessage("Failed to add you to the bowl.");
            return;
          }
        }

        const { error: acceptError } = await supabase
          .from("bowl_invites")
          .update({ accepted_at: new Date().toISOString() })
          .eq("id", invite.id);

        if (acceptError) {
          console.error("[AcceptInvite] Failed to mark invite accepted", acceptError);
        }

        setStatus("success");
        setMessage("Invite accepted. Redirecting…");
        navigate(`/bowl/${invite.bowl_id}`, { replace: true });
      } catch (err) {
        console.error("[AcceptInvite] Unexpected error", err);
        setStatus("error");
        setMessage("Unexpected error accepting invite.");
      }
    };

    run();
  }, [loading, session, token, navigate, location]);

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-lg font-semibold mb-2">Accept Invite</h2>
      <div className={status === "error" ? "text-red-600" : "text-gray-700"}>{message}</div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
        <Route path="/settings" element={
          <RequireAuth><UserSettings />
          </RequireAuth>
        } />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/accept-invite/:token" element={<AcceptInvite />} />
          <Route path="/" element={
            <RequireAuth>
              <MyBowlsScreen />
            </RequireAuth>
          } />
          <Route path="/bowl/:bowlId" element={
            <RequireAuth>
              <BowlDashboard />
            </RequireAuth>
          } />
          <Route path="/bowl/:bowlId/settings" element={
            <RequireAuth>
              <BowlSettings />
            </RequireAuth>
          } />

        </Routes>
      </Layout>
    </Router>
  );
}


export default App;
