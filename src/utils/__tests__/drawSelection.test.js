import { describe, expect, it, vi } from "vitest";
import { getDrawSelection } from "../drawSelection";

describe("getDrawSelection", () => {
  it("applies active filters before contributor bucket grouping", async () => {
    const fetchProviders = vi.fn(async () => ({ providers: [], region: "US", fetchedAt: null }));

    const { selected, errorMessage } = await getDrawSelection({
      remainingMovies: [
        { id: "u1-a", tmdb_id: 101, title: "Action A", added_by: "user-1", genres: ["Action"] },
        { id: "u1-b", tmdb_id: 102, title: "Action B", added_by: "user-1", genres: ["Action"] },
        { id: "u2-a", tmdb_id: 201, title: "Comedy A", added_by: "user-2", genres: ["Comedy"] },
      ],
      genreFilter: {
        allowedGenres: ["Comedy"],
        includeUnknown: false,
      },
      fetchProviders,
      fetchMovieDetails: vi.fn(),
      randomFn: () => 0,
    });

    expect(errorMessage).toBeNull();
    expect(selected.movie.id).toBe("u2-a");
    expect(fetchProviders).toHaveBeenCalledWith(201);
  });
});
