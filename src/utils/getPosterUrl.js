export function getPosterUrl(movie, size = "w92") {
    return movie.poster_path
        ? `https://image.tmdb.org/t/p/${size}${movie.poster_path}`
        : "/icons/poster-placeholder.svg";
}
