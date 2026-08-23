import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchTmdbMovies: vi.fn(async () => ({ results: [] })),
  getTmdbMovieDetails: vi.fn(async () => ({})),
}));

vi.mock("../../lib/tmdbApi", () => ({
  searchTmdbMovies: mocks.searchTmdbMovies,
  getTmdbMovieDetails: mocks.getTmdbMovieDetails,
}));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: vi.fn(async () => ({ providers: [], region: "US", fetchedAt: null })),
}));

import MovieSearch from "../MovieSearch";
import { OFFLINE_MESSAGE } from "../../utils/networkErrors";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function searchFor(term) {
  render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);
  fireEvent.change(screen.getByPlaceholderText("Search movies..."), {
    target: { value: term },
  });
}

describe("MovieSearch when the connection is down", () => {
  it("does not blame the movie service for the user's connection", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    mocks.searchTmdbMovies.mockRejectedValue(new TypeError("Failed to fetch"));

    searchFor("Arrival");

    await waitFor(() => {
      expect(screen.getByText(OFFLINE_MESSAGE)).toBeInTheDocument();
    });
  });

  it("still reports a genuine service outage as a service outage", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    mocks.searchTmdbMovies.mockRejectedValue(new Error("Request failed with 503"));

    searchFor("Arrival");

    await waitFor(() => {
      expect(
        screen.getByText("Movie service is unavailable right now. Please try again.")
      ).toBeInTheDocument();
    });
  });
});
