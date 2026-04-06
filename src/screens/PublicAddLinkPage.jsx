import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import MovieSearch from "../components/MovieSearch";
import { consumeAddLink, getAddLinkMetadata } from "../lib/addLinks";

export default function PublicAddLinkPage() {
  const { token } = useParams();
  const [metadata, setMetadata] = useState({
    status: "loading",
    bowlName: "Movie Bowl",
    remainingAdds: 0,
    defaultContributorName: "",
  });
  const [errorMessage, setErrorMessage] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [contributorName, setContributorName] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!token) {
        setMetadata({ status: "not_found", bowlName: "Movie Bowl", remainingAdds: 0, defaultContributorName: "" });
        return;
      }

      setErrorMessage(null);

      try {
        const next = await getAddLinkMetadata(token);
        if (!cancelled) {
          setMetadata(next);
          setContributorName(next.defaultContributorName || "");
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage("Could not load this add link.");
          setMetadata({ status: "not_found", bowlName: "Movie Bowl", remainingAdds: 0, defaultContributorName: "" });
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const isLinkActive = metadata.status === "active" && metadata.remainingAdds > 0;

  const statusText = useMemo(() => {
    if (metadata.status === "loading") return "Loading add link…";
    if (metadata.status === "revoked") return "This add link has been revoked.";
    if (metadata.status === "exhausted") return "This add link has already been used up.";
    if (metadata.status === "not_found") return "This add link is not valid.";
    return null;
  }, [metadata.status]);

  const handleAddMovie = async (movie) => {
    if (!token) return false;

    setActionMessage(null);
    setErrorMessage(null);

    try {
      const result = await consumeAddLink(token, movie, contributorName);
      setMetadata((prev) => ({
        ...prev,
        status: result.remainingAdds > 0 ? "active" : "exhausted",
        bowlName: result.bowlName || prev.bowlName,
        remainingAdds: Number(result.remainingAdds || 0),
        defaultContributorName: prev.defaultContributorName || "",
      }));
      setActionMessage(
        result.remainingAdds > 0
          ? `Movie added as ${result.addedByName}. ${result.remainingAdds} add${result.remainingAdds === 1 ? "" : "s"} remaining.`
          : `Movie added as ${result.addedByName}. This link is now used up.`
      );
      return true;
    } catch (error) {
      const message = error?.message || "Failed to add movie through link.";
      setErrorMessage(message);
      const normalized = message.toLowerCase();
      if (normalized.includes("exhausted")) {
        setMetadata((prev) => ({ ...prev, status: "exhausted", remainingAdds: 0 }));
      } else if (normalized.includes("revoked")) {
        setMetadata((prev) => ({ ...prev, status: "revoked", remainingAdds: 0 }));
      } else if (normalized.includes("not found")) {
        setMetadata((prev) => ({ ...prev, status: "not_found", remainingAdds: 0 }));
      }
      return false;
    }
  };

  return (
    <div className="page-container py-10">
      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl shadow-black/30">
        <h1 className="text-3xl font-semibold text-slate-100">Add movies to {metadata.bowlName}</h1>
        <p className="mt-2 text-base text-slate-300">
          Use this link to add movies directly to the bowl. You do not need to sign in.
        </p>

        <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Adds remaining</p>
          <p className="mt-2 text-3xl font-semibold text-slate-100">{metadata.remainingAdds}</p>
        </div>

        {actionMessage && <div className="mt-4 rounded-xl bg-emerald-950/50 px-4 py-3 text-sm text-emerald-300">{actionMessage}</div>}
        {errorMessage && <div className="mt-4 rounded-xl bg-red-950/50 px-4 py-3 text-sm text-red-300">{errorMessage}</div>}

        {!isLinkActive ? (
          <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/60 p-5 text-sm text-slate-300">
            {statusText || "This add link is unavailable."}
          </div>
        ) : (
          <div className="mt-6">
            <div className="mb-4 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <label htmlFor="public-add-link-contributor-name" className="mb-1 block text-sm font-medium text-slate-200">
                Added by
              </label>
              <input
                id="public-add-link-contributor-name"
                name="public_add_link_contributor_name"
                type="text"
                value={contributorName}
                onChange={(event) => setContributorName(event.target.value)}
                placeholder="Link Guest"
                className="input-field"
              />
              <p className="mt-2 text-sm text-slate-400">
                You can keep the suggested name, change it, or leave it blank.
              </p>
            </div>
            <MovieSearch onAddMovie={handleAddMovie} userStreamingServices={[]} />
          </div>
        )}
      </div>
    </div>
  );
}
