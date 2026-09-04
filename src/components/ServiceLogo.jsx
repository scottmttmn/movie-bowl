import { getProviderLogoUrl } from "../utils/getProviderLogoUrl";
import { getServiceLogoPath } from "../utils/providerLogos";

// TMDB serves these as JPEGs, so each carries its own baked-in background --
// Netflix black, Hulu green, Prime Video white. That cannot be stripped without
// editing the image, which is a derivative work and forbidden. A uniform plate
// and border behind every tile is the version of consistency that is available:
// it keeps the dark ones legible against a dark page and stops the white ones
// flashing, without touching the artwork.
export default function ServiceLogo({ service, size = "h-7 w-7" }) {
  const logoUrl = getProviderLogoUrl(getServiceLogoPath(service), "w92");
  if (!logoUrl) return null;

  return (
    <img
      src={logoUrl}
      alt=""
      loading="lazy"
      className={`${size} shrink-0 rounded-md border border-slate-700/70 bg-slate-800/60 object-contain`}
    />
  );
}
