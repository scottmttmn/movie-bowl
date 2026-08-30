import lookupProviderLinks from "./_lib/lookupProviderLinks.js";
import warmFilterMetadata from "./_lib/warmFilterMetadata.js";

// Both public URLs are rewritten here to stay within Vercel Hobby's
// twelve-function limit. Each handler keeps its own authorization checks.
export default async function handler(req, res) {
  if (req.query?.action === "provider-links") {
    return lookupProviderLinks(req, res);
  }
  if (req.query?.action === "warm-filter-metadata") {
    return warmFilterMetadata(req, res);
  }
  res.status(404).json({ error: "Not found" });
}
