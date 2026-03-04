import { useEffect, useMemo, useState } from "react";
import { getPosterUrl } from "../utils/getPosterUrl";
import { searchTmdbMovies } from "../lib/tmdbApi";
import { sendMovieToRoku } from "../lib/rokuApi";
import { useRokuDevice } from "../context/RokuDeviceContext";

function RokuSetupList({ steps }) {
  if (!steps.length) {
    return null;
  }

  return (
    <ul className="mt-3 space-y-2 text-sm text-slate-600">
      {steps.map((step) => (
        <li key={step} className="rounded-lg bg-slate-50 px-3 py-2">
          {step}
        </li>
      ))}
    </ul>
  );
}

export default function RokuPocScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [manualIp, setManualIp] = useState("");
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [status, setStatus] = useState(null);
  const [sendingMovieId, setSendingMovieId] = useState(null);
  const {
    devices,
    selectedRoku,
    selectedRokuIp,
    setSelectedRokuIp,
    setupSteps,
    deviceError,
    discoveryLoading,
    discoverDevices,
    validateManualIp,
  } = useRokuDevice();

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setResults([]);
      setSearchError("");
      return;
    }

    let active = true;
    const timeoutId = setTimeout(async () => {
      try {
        const data = await searchTmdbMovies(trimmed);
        if (!active) return;
        setResults(data.results || []);
        setSearchError("");
      } catch (error) {
        if (!active) return;
        setResults([]);
        setSearchError("Movie search is unavailable right now.");
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [query]);

  const canSend = Boolean(selectedRokuIp);

  const handleManualIpValidation = async () => {
    await validateManualIp(manualIp);
    setStatus(null);
  };

  const handleSend = async (movie) => {
    if (!selectedRokuIp) {
      setStatus({
        ok: false,
        action: "failed",
        message: "Choose or validate a Roku before sending a movie.",
        details: [],
      });
      return;
    }

    setSendingMovieId(movie.id);
    setSelectedMovie(movie);
    setStatus(null);

    try {
      const result = await sendMovieToRoku({
        rokuIp: selectedRokuIp,
        title: movie.title,
        year: movie.release_date ? movie.release_date.split("-")[0] : null,
        tmdbId: movie.id,
      });
      setStatus(result);
    } catch (error) {
      setStatus({
        ok: false,
        action: "failed",
        message: error.message || "Unable to send the movie to Roku.",
        details: [
          "Check the Roku IP and confirm Control by mobile apps is enabled.",
        ],
      });
    } finally {
      setSendingMovieId(null);
    }
  };

  return (
    <div className="min-h-screen bg-transparent">
      <div className="page-container py-6 sm:py-8">
        <div className="mx-auto max-w-3xl space-y-5">
          <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 shadow-xl shadow-slate-300/30">
            <div className="bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_55%,#38bdf8_100%)] px-5 py-6 text-left text-white sm:px-7">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-100">Roku POC</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Search a movie on your phone and push it to Roku</h1>
              <p className="mt-3 max-w-2xl text-sm text-blue-50 sm:text-base">
                This proof of concept searches TMDB on your phone, then uses Roku local-network control to open Roku search for the movie.
              </p>
            </div>

            <div className="grid gap-5 px-5 py-5 sm:px-7 sm:py-6">
              <section className="panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-left">
                    <h2 className="section-title">Choose a Roku</h2>
                    <p className="mt-1 text-sm text-slate-600">Auto-discover devices on the same Wi-Fi or validate a Roku IP manually.</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary shrink-0"
                    onClick={() => discoverDevices()}
                    disabled={discoveryLoading}
                  >
                    {discoveryLoading ? "Scanning..." : "Rescan"}
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {devices.length > 0 ? (
                    <div className="space-y-2">
                      {devices.map((device) => (
                        <label
                          key={`${device.ip}:${device.port}`}
                          className={`flex cursor-pointer items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                            selectedRokuIp === device.ip
                              ? "border-blue-500 bg-blue-50"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-slate-900">{device.name}</div>
                            <div className="text-sm text-slate-600">{device.ip}:{device.port}</div>
                            {device.model && <div className="text-xs text-slate-500">{device.model}</div>}
                          </div>
                          <input
                            type="radio"
                            name="roku-device"
                            value={device.ip}
                            checked={selectedRokuIp === device.ip}
                            onChange={() => setSelectedRokuIp(device.ip)}
                            className="mt-1 h-4 w-4"
                          />
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                      No Roku devices discovered yet. Manual IP entry is the reliable fallback for this POC.
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <label htmlFor="roku-manual-ip" className="text-sm font-semibold text-slate-800">
                      Manual Roku IP
                    </label>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input
                        id="roku-manual-ip"
                        name="roku_manual_ip"
                        type="text"
                        value={manualIp}
                        onChange={(event) => setManualIp(event.target.value)}
                        placeholder="192.168.1.120"
                        className="input-field"
                      />
                      <button type="button" className="btn btn-primary sm:min-w-40" onClick={handleManualIpValidation} disabled={discoveryLoading}>
                        Validate Roku
                      </button>
                    </div>
                    {deviceError && <p className="mt-2 text-sm text-red-600">{deviceError}</p>}
                    <RokuSetupList steps={setupSteps} />
                  </div>
                </div>
              </section>

              <section className="panel p-4">
                <div className="text-left">
                  <h2 className="section-title">Find a movie</h2>
                  <p className="mt-1 text-sm text-slate-600">Search by title, then send the selection to Roku search.</p>
                </div>

                <div className="mt-4">
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search movies..."
                    className="input-field"
                  />
                </div>

                {searchError && <p className="mt-3 text-sm text-red-600">{searchError}</p>}

                <div className="mt-4 space-y-3">
                  {results.map((movie) => {
                    const year = movie.release_date ? movie.release_date.split("-")[0] : "—";

                    return (
                      <article key={movie.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                        <img src={getPosterUrl(movie)} alt={movie.title} className="h-20 w-14 rounded-lg object-cover bg-slate-100" />

                        <div className="min-w-0 flex-1 text-left">
                          <h3 className="truncate text-base font-semibold text-slate-900">{movie.title}</h3>
                          <p className="text-sm text-slate-500">{year}</p>
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <button
                              type="button"
                              className="btn btn-primary w-full sm:w-auto"
                              onClick={() => handleSend(movie)}
                              disabled={!canSend || sendingMovieId === movie.id}
                            >
                              {sendingMovieId === movie.id ? "Sending..." : "Send to Roku"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {!searchError && query.trim() && results.length === 0 && (
                  <p className="mt-4 text-sm text-slate-600">No matches yet. Try a more specific title.</p>
                )}
              </section>

              <section className="grid gap-4 sm:grid-cols-[1.1fr_0.9fr]">
                <div className="panel p-4 text-left">
                  <h2 className="section-title">Selected movie</h2>
                  {selectedMovie ? (
                    <div className="mt-3 flex items-start gap-3">
                      <img src={getPosterUrl(selectedMovie)} alt={selectedMovie.title} className="h-24 w-16 rounded-lg object-cover bg-slate-100" />
                      <div>
                        <div className="font-semibold text-slate-900">{selectedMovie.title}</div>
                        <div className="text-sm text-slate-600">
                          {selectedMovie.release_date ? selectedMovie.release_date.split("-")[0] : "Year unavailable"}
                        </div>
                        <div className="mt-2 text-sm text-slate-500">
                          Sending to {selectedRoku ? `${selectedRoku.name} (${selectedRoku.ip})` : selectedRokuIp || "your Roku"}.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-600">Search for a movie and tap Send to Roku to preview the active selection.</p>
                  )}
                </div>

                <div className="panel p-4 text-left">
                  <h2 className="section-title">Status</h2>
                  {status ? (
                    <div className={`mt-3 rounded-2xl px-4 py-3 text-sm ${status.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>
                      <p className="font-semibold">{status.message}</p>
                      {Array.isArray(status.details) && status.details.length > 0 && (
                        <ul className="mt-2 space-y-2">
                          {status.details.map((detail) => (
                            <li key={detail}>{detail}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-600">No movie has been sent yet. A successful result means Roku search opened for the title, not guaranteed playback.</p>
                  )}
                </div>
              </section>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
