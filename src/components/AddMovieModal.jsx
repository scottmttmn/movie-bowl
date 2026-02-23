import React from "react";
import { getPosterUrl } from "../utils/getPosterUrl";
export default function AddMovieModal({ movie, onClose,  }) {
  if (!movie) return null;

  const posterUrl = getPosterUrl(movie)

  const year = movie.release_date
    ? movie.release_date.split("-")[0]
    : "—";

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



        <div className="flex gap-3 justify-center">
          { (
            <button
              onClick={() => {
                
                onClose();
              }}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Mark as Watched
            </button>
          )}

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
