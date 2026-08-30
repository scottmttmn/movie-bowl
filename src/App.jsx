import React, { Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import useAuth from "./hooks/useAuth";
import useAppUpdate from "./hooks/useAppUpdate";
import usePendingInvites, { PendingInvitesProvider } from "./hooks/usePendingInvites";
import TopNav from "./components/TopNav";
import OfflineBanner from "./components/OfflineBanner";
import UpdateBanner from "./components/UpdateBanner";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { recoverFromStaleChunkError } from "./utils/appVersion";
import { supabase } from "./lib/supabase";

// Every screen is loaded on demand, which means every navigation can outlive
// the build it was compiled into: a deploy replaces the hashed chunks, and an
// open tab asks for a file that is no longer there. Reload once on that failure
// -- the fresh document points at chunks that do exist -- and leave anything
// the reload cannot fix to the error boundary.
function lazyScreen(importScreen) {
  return React.lazy(() =>
    importScreen().catch((error) => {
      if (recoverFromStaleChunkError(error)) {
        // The reload is already in flight. Never settling keeps the Suspense
        // fallback up instead of flashing an error on the way out.
        return new Promise(() => {});
      }

      throw error;
    })
  );
}

const MyBowlsScreen = lazyScreen(() => import("./screens/MyBowlsScreen"));
const BowlDashboard = lazyScreen(() => import("./screens/BowlDashboard"));
const LoginPage = lazyScreen(() => import("./screens/LoginPage"));
const UserSettings = lazyScreen(() => import("./screens/UserSettings"));
const BowlSettings = lazyScreen(() => import("./screens/BowlSettings"));
const AboutPage = lazyScreen(() => import("./screens/AboutPage"));
const PublicAddLinkPage = lazyScreen(() => import("./screens/PublicAddLinkPage"));
const WatchListPage = lazyScreen(() => import("./screens/WatchListPage"));
const InvitesPage = lazyScreen(() => import("./screens/InvitesPage"));
const HomeRedirect = lazyScreen(() => import("./screens/HomeRedirect"));
const TvApp = lazyScreen(() => import("./tv/TvApp"));
const TvAuthGate = lazyScreen(() => import("./tv/TvAuthGate"));
const TvActivationPage = lazyScreen(() => import("./screens/TvActivationPage"));

function AppShell({ children }) {
  const { session, signOut } = useAuth();
  const { pendingInviteCount } = usePendingInvites();
  // App-wide, so the reloads it takes on its own reach the TV too. Only the
  // notice below is phone-and-desktop: a TV screen is sized to the viewport and
  // driven by a D-pad, so a strip that pushes it down and offers a button no
  // remote can reach would be worse than waiting for the automatic reload.
  const { updateReady } = useAppUpdate();
  const location = useLocation();
  const isLoginRoute = location.pathname === "/login";
  const isSettingsRoute = location.pathname === "/settings";
  const isAboutRoute = location.pathname === "/about";
  const isWatchListRoute = location.pathname === "/watch-list";
  const isInvitesRoute = location.pathname === "/invites";
  const isBowlsRoute = location.pathname === "/bowls";
  const isPublicAddRoute = location.pathname.startsWith("/add-to-bowl/");
  const isTvRoute = location.pathname === "/tv" || location.pathname.startsWith("/tv/");
  const shouldShowTopNav =
    !isLoginRoute &&
    !isPublicAddRoute &&
    !isTvRoute &&
    (Boolean(session) || isAboutRoute);
  const userEmail = session?.user?.email ?? "";

  return (
    <div className={`app-shell ${isTvRoute ? "app-shell-tv" : ""}`}>
      {/* Global actions stay pinned to the top for quick access */}
      {shouldShowTopNav && (
        <TopNav
          isSettingsRoute={isSettingsRoute}
          isWatchListRoute={isWatchListRoute}
          isInvitesRoute={isInvitesRoute}
          isBowlsRoute={isBowlsRoute}
          onSignOut={signOut}
          userEmail={userEmail}
          isAuthenticated={Boolean(session)}
          pendingInviteCount={pendingInviteCount}
        />
      )}

      <div className={shouldShowTopNav ? "pt-16" : ""}>
        {updateReady && !isTvRoute && <UpdateBanner />}
        {children}
      </div>

      {/* Global, so no screen has to explain a dropped connection on its own */}
      <OfflineBanner />
    </div>
  );
}

function Layout({ children }) {
  const { session } = useAuth();

  // Re-key on the signed-in user so invites reload on login, logout, and
  // account switches without the provider needing its own auth subscription.
  return (
    <PendingInvitesProvider key={session?.user?.id || "anonymous"}>
      <AppShell>{children}</AppShell>
    </PendingInvitesProvider>
  );
}

function RequireAuth({ children }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page-container py-10">
        <div className="panel mx-auto max-w-lg text-sm text-slate-400" role="status">
          Loading…
        </div>
      </div>
    );
  }

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
      <div className={status === "error" ? "text-rose-300" : "text-slate-300"}>{message}</div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Layout>
        <AppErrorBoundary>
          <Suspense
            fallback={
              <div className="page-container py-10">
                <div className="panel mx-auto max-w-lg text-sm text-slate-400" role="status">
                  Loading…
                </div>
              </div>
            }
          >
            <Routes>
              <Route path="/settings" element={
                <RequireAuth><UserSettings />
                </RequireAuth>
              } />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/activate-tv" element={<TvActivationPage />} />
              <Route path="/accept-invite/:token" element={<AcceptInvite />} />
              <Route path="/add-to-bowl/:token" element={<PublicAddLinkPage />} />
              <Route path="/watch-list" element={
                <RequireAuth>
                  <WatchListPage />
                </RequireAuth>
              } />
              <Route path="/invites" element={
                <RequireAuth>
                  <InvitesPage />
                </RequireAuth>
              } />
              <Route path="/tv/*" element={
                <TvAuthGate>
                  <TvApp />
                </TvAuthGate>
              } />
              <Route path="/" element={
                <RequireAuth>
                  <HomeRedirect />
                </RequireAuth>
              } />
              <Route path="/bowls" element={
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
        </AppErrorBoundary>
      </Layout>
    </Router>
  );
}


export default App;
