import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import MyBowlsScreen from "./screens/MyBowlsScreen";
import BowlDashboard from "./screens/BowlDashboard";
import useAuth from "./hooks/useAuth";
import LoginPage from "./screens/LoginPage";

function Layout({ children }) {
  const { signOut } = useAuth();

  return (
    <div style={{ position: "relative" }}>
      <button 
        onClick={signOut} 
        style={{ position: "absolute", top: 10, right: 10 }}
      >
        Logout
      </button>
      {children}
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

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
              <div>Bowl Settings</div>
            </RequireAuth>
          } />
          <Route path="/settings" element={
            <RequireAuth>
              <div>User Settings</div>
            </RequireAuth>
          } />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;