// Served from TMDB's own image CDN rather than copied into the repo. The API
// terms cap caching TMDB content at six months, and a bundled logo set would
// put that clock on files somebody has to remember to regenerate. Displaying
// what TMDB distributes keeps the obligation where it already is: the
// attribution on the About page.
export function getProviderLogoUrl(logoPath, size = "w45") {
  return logoPath ? `https://image.tmdb.org/t/p/${size}${logoPath}` : null;
}
