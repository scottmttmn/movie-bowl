import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import { approveTvPairing } from "../lib/tvPairing";
import bowlImage from "../assets/bowl-illustration-v3.webp";

const APPROVED_TV_PAIRING_CODES_KEY = "movie-bowl:approved-tv-pairing-codes";

function normalizeCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function formatCode(value) {
  const normalized = normalizeCode(value);

  return normalized.length > 4
    ? `${normalized.slice(0, 4)}-${normalized.slice(4)}`
    : normalized;
}

function readApprovedCodes() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(APPROVED_TV_PAIRING_CODES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    // Pairing still works when storage is unavailable; only revisit recognition degrades.
    return [];
  }
}

function wasCodeApproved(code) {
  const normalized = normalizeCode(code);
  return Boolean(normalized) && readApprovedCodes().includes(normalized);
}

function rememberApprovedCode(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return;

  const retained = readApprovedCodes().filter((value) => value !== normalized);
  try {
    window.localStorage.setItem(
      APPROVED_TV_PAIRING_CODES_KEY,
      JSON.stringify([normalized, ...retained])
    );
  } catch {
    // The successful approval is still valid when private browsing blocks storage.
  }
}

export default function TvActivationPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const initialCode = useMemo(
    () => formatCode(new URLSearchParams(location.search).get("code")),
    [location.search]
  );
  const isRememberedCode = useMemo(() => wasCodeApproved(initialCode), [initialCode]);
  const [code, setCode] = useState(initialCode);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const handleApprove = async (event) => {
    event.preventDefault();
    if (status === "submitting") return;

    setStatus("submitting");
    setMessage("");

    try {
      const result = await approveTvPairing({
        code,
        accessToken: session.access_token,
      });
      rememberApprovedCode(code);
      setStatus("success");
      setMessage(
        result.alreadyApproved
          ? "This TV was already approved. It should connect momentarily."
          : "Connected. Your TV will continue automatically."
      );
      navigate(location.pathname, { replace: true });
    } catch (error) {
      setStatus("error");
      setMessage(error?.message || "Could not connect the TV.");
    }
  };

  const handleSignIn = () => {
    navigate("/login", { state: { from: location } });
  };

  return (
    <div className="page-container flex min-h-screen items-center py-10">
      <main className="page-hero mx-auto w-full max-w-lg text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center">
          <img src={bowlImage} alt="" aria-hidden="true" className="h-16 w-16 object-contain" />
        </div>
        <p className="eyebrow text-rose-300">Movie Bowl TV</p>
        <h1 className="mb-3 mt-2 text-3xl font-semibold tracking-tight text-slate-50">
          Connect your television
        </h1>
        <p className="mx-auto mb-6 max-w-md text-sm text-slate-400">
          Confirm the code shown on your TV. The television will remember this account until you
          sign out there.
        </p>

        {status === "success" ? (
          <div className="status-success text-left" role="status">
            <p className="font-semibold">TV connected</p>
            <p className="mt-1">{message}</p>
          </div>
        ) : isRememberedCode ? (
          <div className="status-warning text-left" role="status">
            <p className="font-semibold">TV pairing completed</p>
            <p className="mt-1">
              This pairing code has already been completed or expired. Request a new code on your
              TV if you need to connect again.
            </p>
          </div>
        ) : loading ? (
          <p className="status-info text-left" role="status">Checking your account…</p>
        ) : !session ? (
          <div className="space-y-4 text-left">
            {code ? (
              <p className="text-center font-mono text-2xl font-bold tracking-[0.18em] text-slate-100">
                {code}
              </p>
            ) : null}
            <button type="button" className="btn btn-primary w-full" onClick={handleSignIn}>
              Sign in to connect TV
            </button>
            <p className="text-center text-xs text-slate-500">
              You&apos;ll return to this confirmation after signing in.
            </p>
          </div>
        ) : (
          <form onSubmit={handleApprove} className="space-y-4 text-left">
            <label htmlFor="tv-pairing-code" className="block text-sm font-semibold text-slate-200">
              Code shown on TV
            </label>
            <input
              id="tv-pairing-code"
              name="code"
              type="text"
              required
              autoCapitalize="characters"
              autoComplete="one-time-code"
              spellCheck="false"
              inputMode="text"
              value={code}
              onChange={(event) => setCode(formatCode(event.target.value))}
              placeholder="ABCD-EFGH"
              className="input-field text-center font-mono text-xl font-bold uppercase tracking-[0.16em]"
            />
            <p className="text-sm text-slate-400">
              Connecting as <span className="text-slate-200">{session.user.email}</span>
            </p>
            <button
              type="submit"
              disabled={status === "submitting" || code.replace(/-/g, "").length !== 8}
              className="btn btn-primary w-full disabled:opacity-50"
            >
              {status === "submitting" ? "Connecting…" : "Connect this TV"}
            </button>
            {status === "error" ? (
              <p className="status-error" role="alert">{message}</p>
            ) : null}
          </form>
        )}
      </main>
    </div>
  );
}
