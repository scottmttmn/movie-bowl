export function getBackdropUrl(movie, size = "w1280") {
  return movie?.backdrop_path
    ? `https://image.tmdb.org/t/p/${size}${movie.backdrop_path}`
    : null;
}
