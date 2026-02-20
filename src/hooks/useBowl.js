import { useState } from "react";
// useBowl is the core state engine for a bowl.
// It manages bowl state and defines how that state transitions (add + draw).

export default function useBowl() {
  // Primary bowl state:
  // - remaining: movies not yet drawn
  // - watched: movies that have been drawn
  // - contributions: count of movies added per member
  const [bowl, setBowl] = useState({
    remaining: [],
    watched: [],
    contributions: {
      You: 0,
      Partner: 0,
    },
  });

  // Randomly select a movie from remaining,
  // move it to watched, and timestamp the draw.
  const handleDraw = () => {
    if (bowl.remaining.length === 0) return null;

    const index = Math.floor(Math.random() * bowl.remaining.length);
    const drawn = {
      ...bowl.remaining[index],
      drawnAt: new Date().toISOString(),
    };

    // Update Bowl after draw
    setBowl((prev) => ({
      ...prev,
      remaining: prev.remaining.filter((_, i) => i !== index),
      watched: [drawn, ...prev.watched],
    }));

    return drawn;
  };

  // Add a movie to the bowl and increment the contributor's count.
  const handleAddMovie = (movie, addedBy = "You") => {
    const newMovie = {
      ...movie,          // keep full TMDB object
      addedBy,
    };

    // Append movie to remaining and update contribution totals.
    setBowl((prev) => ({
      ...prev,
      remaining: [...prev.remaining, newMovie],
      contributions: {
        ...prev.contributions,
        [addedBy]: (prev.contributions[addedBy] || 0) + 1,
      },
    }));
  };


  return { bowl, handleDraw, handleAddMovie };
}