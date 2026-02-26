import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MovieSearch from "../MovieSearch";

vi.mock("../../lib/tmdbApi", () => ({
  searchTmdbMovies: vi.fn(async () => ({ results: [] })),
  getTmdbMovieDetails: vi.fn(async () => ({})),
}));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: vi.fn(async () => ({ providers: [], region: "US", fetchedAt: null })),
}));

describe("MovieSearch custom add", () => {
  it("adds a custom entry when user clicks add custom", async () => {
    const onAddMovie = vi.fn(async () => {});
    render(<MovieSearch onAddMovie={onAddMovie} userStreamingServices={[]} />);

    const input = screen.getByPlaceholderText("Search movies...");
    fireEvent.change(input, { target: { value: "Wildcard" } });

    const addCustomButton = await screen.findByRole("button", { name: /add "wildcard"/i });
    fireEvent.click(addCustomButton);

    await waitFor(() => {
      expect(onAddMovie).toHaveBeenCalledWith(
        expect.objectContaining({
          id: null,
          title: "Wildcard",
          isCustomEntry: true,
        })
      );
    });
  });
});
