import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useNavigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import { pollTvPairing, startTvPairing, TvPairingError } from "../../lib/tvPairing";
import TvBrand from "../components/TvBrand";
import useTvSpatialNavigation from "../hooks/useTvSpatialNavigation";
import "../tv.css";

function displayActivationUrl(value) {
  return String(value || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export default function TvPairingPage() {
  const { completeTvPairing } = useAuth();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [pairing, setPairing] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [stage, setStage] = useState("starting");
  const [message, setMessage] = useState("");
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const startPromiseRef = useRef(null);

  useTvSpatialNavigation({
    scopeKey: `tv-pairing-${stage}`,
    onBack: () => navigate("/", { replace: true }),
  });

  useEffect(() => {
    let active = true;

    if (!startPromiseRef.current) {
      startPromiseRef.current = startTvPairing();
    }

    startPromiseRef.current
      .then((nextPairing) => {
        if (!active) return;
        setPairing(nextPairing);
        setStage("ready");
        setMessage("");
      })
      .catch((error) => {
        if (!active) return;
        console.error("[TvPairingPage] Failed to start pairing", error);
        setStage("error");
        setMessage(error?.message || "Could not start TV pairing.");
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (!pairing?.verificationUriComplete) {
      setQrDataUrl("");
      return undefined;
    }

    let active = true;
    QRCode.toDataURL(pairing.verificationUriComplete, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 420,
      color: { dark: "#111827", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      })
      .catch((error) => {
        console.error("[TvPairingPage] Failed to render QR code", error);
      });

    return () => {
      active = false;
    };
  }, [pairing?.verificationUriComplete]);

  useEffect(() => {
    if (!pairing?.expiresAt || stage !== "ready") return undefined;

    const updateCountdown = () => {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(pairing.expiresAt).getTime() - Date.now()) / 1000)
      );
      setSecondsRemaining(remaining);
      if (remaining === 0) {
        setStage("expired");
        setMessage("That code expired before the TV was connected.");
      }
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [pairing?.expiresAt, stage]);

  useEffect(() => {
    if (!pairing || stage !== "ready") return undefined;

    let stopped = false;
    let completing = false;
    let timeoutId;
    let controller;
    const delay = Math.max(2, Number(pairing.pollIntervalSeconds) || 2) * 1000;

    const poll = async () => {
      controller = new AbortController();

      try {
        const result = await pollTvPairing({
          deviceId: pairing.deviceId,
          deviceSecret: pairing.deviceSecret,
          signal: controller.signal,
        });

        if (stopped) return;

        if (result.status === "approved" && result.tokenHash) {
          completing = true;
          setStage("connecting");
          const { error } = await completeTvPairing(
            result.tokenHash,
            result.verificationType || "magiclink"
          );

          if (error) {
            throw error;
          }

          return;
        }

        timeoutId = window.setTimeout(poll, delay);
      } catch (error) {
        if ((stopped && !completing) || error?.name === "AbortError") return;

        if (error instanceof TvPairingError && error.status === 410) {
          setStage("expired");
          setMessage("That code expired before the TV was connected.");
          return;
        }

        console.error("[TvPairingPage] Pairing poll failed", error);
        setStage("error");
        setMessage(error?.message || "Could not connect this TV.");
      }
    };

    // Waiting one interval also prevents React Strict Mode's development-only
    // effect replay from issuing two simultaneous claims.
    timeoutId = window.setTimeout(poll, delay);

    return () => {
      stopped = true;
      window.clearTimeout(timeoutId);
      controller?.abort();
    };
  }, [completeTvPairing, pairing, stage]);

  const retry = () => {
    startPromiseRef.current = null;
    setPairing(null);
    setQrDataUrl("");
    setMessage("");
    setStage("starting");
    setAttempt((value) => value + 1);
  };

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = String(secondsRemaining % 60).padStart(2, "0");

  return (
    <div className="tv-app">
      <main className="tv-pairing-page">
        <header className="tv-pairing-header">
          <TvBrand context="Connect this TV" />
        </header>

        {stage === "starting" ? (
          <section className="tv-pairing-status" role="status">
            <p className="tv-kicker">One moment</p>
            <h1>Creating a secure TV code…</h1>
          </section>
        ) : stage === "ready" || stage === "connecting" ? (
          <section className="tv-pairing-layout" aria-live="polite">
            <div className="tv-pairing-copy">
              <p className="tv-kicker">Sign in without typing</p>
              <h1>Connect Movie Bowl</h1>
              <ol className="tv-pairing-steps">
                <li>Scan the QR code with your phone.</li>
                <li>Sign in and approve this TV.</li>
                <li>Come back here. We&apos;ll take it from there.</li>
              </ol>

              <div className="tv-pairing-fallback">
                <span>Or visit</span>
                <strong>{displayActivationUrl(pairing?.verificationUri)}</strong>
                <span>and enter</span>
                <strong className="tv-pairing-code">{pairing?.userCode}</strong>
              </div>

              <p className="tv-pairing-expiry">
                {stage === "connecting"
                  ? "Approved — connecting your TV…"
                  : `Code expires in ${minutes}:${seconds}`}
              </p>
            </div>

            <div className="tv-pairing-qr" aria-label="QR code for connecting this TV">
              {qrDataUrl ? <img src={qrDataUrl} alt="Scan to connect this television" /> : null}
            </div>
          </section>
        ) : (
          <section className="tv-pairing-status" role="alert">
            <p className="tv-kicker">Let&apos;s try that again</p>
            <h1>{stage === "expired" ? "Your TV code expired." : "We couldn’t connect the TV."}</h1>
            <p>{message}</p>
            <button
              type="button"
              className="tv-button tv-button-primary"
              data-tv-focusable
              data-tv-autofocus="true"
              onClick={retry}
            >
              Get a new code
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
