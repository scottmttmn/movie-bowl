import React, { Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import useAuth from "./hooks/useAuth";
import TopNav from "./components/TopNav";
import { supabase } from "./lib/supabase";

const MyBowlsScreen = React.lazy(() => import("./screens/MyBowlsScreen"));
const BowlDashboard = React.lazy(() => import("./screens/BowlDashboard"));
const LoginPage = React.lazy(() => import("./screens/LoginPage"));
const UserSettings = React.lazy(() => import("./screens/UserSettings"));
const BowlSettings = React.lazy(() => import("./screens/BowlSettings"));
const RokuPocScreen = React.lazy(() => import("./screens/RokuPocScreen"));
const AboutPage = React.lazy(() => import("./screens/AboutPage"));

function Layout({ children }) {
  const { session, signOut } = useAuth();
  const location = useLocation();
  const isLoginRoute = location.pathname === "/login";
  const isSettingsRoute = location.pathname === "/settings";
  const isRokuPocRoute = location.pathname === "/roku-poc";
  const isAboutRoute = location.pathname === "/about";
  const shouldShowTopNav = !isLoginRoute && !isRokuPocRoute && (Boolean(session) || isAboutRoute);
  const userEmail = session?.user?.email ?? "";

  return (
    <div className="min-h-screen">
      {/* Global actions stay pinned to the top for quick access */}
      {shouldShowTopNav && (
        <TopNav
          isSettingsRoute={isSettingsRoute}
          onSignOut={signOut}
          userEmail={userEmail}
          isAuthenticated={Boolean(session)}
        />
      )}

      <div className={shouldShowTopNav ? "pt-16" : ""}>{children}</div>
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
        <Suspense fallback={<div className="page-container py-6 text-sm text-slate-600">Loading…</div>}>
          <Routes>
            <Route path="/roku-poc" element={<RokuPocScreen />} />
            <Route path="/settings" element={
              <RequireAuth><UserSettings />
              </RequireAuth>
            } />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/about" element={<AboutPage />} />
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
        </Suspense>
      </Layout>
    </Router>
  );
}


export default App;
