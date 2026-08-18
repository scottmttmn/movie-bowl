import useAuth from "../hooks/useAuth";
import TvPairingPage from "./screens/TvPairingPage";
import "./tv.css";

export default function TvAuthGate({ children }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="tv-app">
        <main className="tv-center-state" role="status">
          <p className="tv-kicker">Movie Bowl TV</p>
          <h1>Getting movie night ready…</h1>
        </main>
      </div>
    );
  }

  if (!session) {
    return <TvPairingPage />;
  }

  return children;
}
