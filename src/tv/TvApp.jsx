import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import TvBowlPicker from "./screens/TvBowlPicker";
import TvTonightScreen from "./screens/TvTonightScreen";
import "./tv.css";

function TvNotFound() {
  const navigate = useNavigate();

  return (
    <main className="tv-center-state">
      <p className="tv-kicker">Movie Bowl TV</p>
      <h1>That screen isn&apos;t available.</h1>
      <button
        type="button"
        className="tv-button tv-button-primary"
        data-tv-focusable
        data-tv-autofocus="true"
        onClick={() => navigate("/tv/bowls", { replace: true })}
      >
        Choose a bowl
      </button>
    </main>
  );
}

export default function TvApp() {
  const { session } = useAuth();
  const location = useLocation();

  return (
    <div className="tv-app" data-tv-route={location.pathname}>
      <Routes>
        <Route
          index
          element={
            <TvBowlPicker
              userId={session?.user?.id || ""}
              userEmail={session?.user?.email || ""}
              autoOpenLastBowl
            />
          }
        />
        <Route
          path="bowls"
          element={
            <TvBowlPicker
              userId={session?.user?.id || ""}
              userEmail={session?.user?.email || ""}
            />
          }
        />
        <Route
          path="bowl/:bowlId"
          element={
            <TvTonightScreen
              userId={session?.user?.id || ""}
              userEmail={session?.user?.email || ""}
            />
          }
        />
        <Route path="*" element={<TvNotFound />} />
      </Routes>
    </div>
  );
}
