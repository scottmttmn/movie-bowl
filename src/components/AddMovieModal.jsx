import React from "react";
import MovieSearch from "./MovieSearch";
import { getPosterUrl } from "../utils/getPosterUrl";
import { matchUserServices, normalizeStreamingServices } from "../utils/streamingServices";

export default function AddMovieModal({ movie, onClose, onAddMovie, userStreamingServices = [] }) {
  // This modal is used in two contexts:
  // 1) "Add movie" flow (movie is undefined): show search UI.
  // 2) "Just drawn" flow (movie is defined): show details for the drawn movie.
  if (!movie) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
        <div className="bg-white rounded-lg shadow-lg max-w-lg w-full mx-4 p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-gray-500 hover:text-black"
            aria-label="Close"
          >
            ✕
          </button>

          <h2 className="text-xl font-bold mb-4 text-center">Add a movie</h2>

          {/* MovieSearch handles TMDB search + details fetch and returns a full movie object */}
          <MovieSearch
            userStreamingServices={userStreamingServices}
            onAddMovie={async (selectedMovie) => {
              // Parent is responsible for persisting to Supabase.
              if (onAddMovie) {
                await onAddMovie(selectedMovie);
              }
            }}
            onClose={onClose}
          />
        </div>
      </div>
    );
  }

  // Compute poster URL in the UI so we can store raw TMDB poster_path in the DB.
  const posterUrl = getPosterUrl(movie);

  const year = movie.release_date
    ? movie.release_date.split("-")[0]
    : "—";
  const availableProviders = normalizeStreamingServices(movie.streamingProviders || []);
  const matchingProviders = matchUserServices(availableProviders, userStreamingServices);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-black"
        >
          ✕
        </button>

        {posterUrl && (
          <img
            src={posterUrl}
            alt={movie.title}
            className="w-full rounded mb-4"
          />
        )}

        <h2 className="text-2xl font-bold text-center mb-2">
          {movie.title} ({year})
        </h2>

        {movie.runtime && (
          <p className="text-center text-sm text-gray-600 mb-2">
            Runtime: {movie.runtime} minutes
          </p>
        )}

        <div className="mb-4 text-sm">
          <p className="font-semibold text-gray-800">Available on</p>
          {availableProviders.length > 0 ? (
            <p className="text-gray-700">{availableProviders.join(", ")}</p>
          ) : (
            <p className="text-gray-500">No US streaming providers found right now.</p>
          )}
        </div>

        <div className="mb-4 text-sm">
          <p className="font-semibold text-gray-800">Your services</p>
          {matchingProviders.length > 0 ? (
            <p className="text-green-700">{matchingProviders.join(", ")}</p>
          ) : (
            <p className="text-gray-500">None of your saved services match this title.</p>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => {
              // TODO: when we support manual marking, persist this as a draw event in bowl_movies.
              onClose();
            }}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Mark as Watched
          </button>

          {/* Just dismisses the modal */}
          <button
            onClick={onClose}
            className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
