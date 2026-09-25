import { useState } from "react";
import { getStarterPackPhotoUrl } from "../lib/starterPacks";

function PersonSilhouette({ className = "" }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <circle cx="50" cy="30" r="17" fill="rgba(203,213,225,0.32)" />
      <path d="M16 90 C 18 60, 82 60, 84 90 Z" fill="rgba(203,213,225,0.32)" />
    </svg>
  );
}

// A starter pack person's TMDB photo, or a silhouette of the same size while it
// loads, when TMDB has none, or when the lookup failed. Decorative: the name is
// always beside it.
export default function StarterPackPhoto({ profilePath, className = "" }) {
  const [failed, setFailed] = useState(false);
  const url = failed ? null : getStarterPackPhotoUrl(profilePath);
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-slate-600 to-slate-900 ${className}`}>
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover object-top"
        />
      ) : (
        <PersonSilhouette className="absolute inset-x-0 top-[6%] mx-auto h-[78%]" />
      )}
    </div>
  );
}
