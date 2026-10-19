import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import MovieSearch from "../MovieSearch";
const mocks = vi.hoisted(() => ({ providers: vi.fn(), departures: vi.fn() }));
vi.mock("../../lib/tmdbApi", () => ({
  searchTmdbPeople: vi.fn(async () => ({ people: [] })),
  suggestTmdbQuery: vi.fn(async () => null),
  getTmdbMovieDetails: vi.fn(),
  searchTmdbMovies: vi.fn(async () => ({
    page: 1,
    totalPages: 1,
    results: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, title: `Feature ${i + 1}` })),
  })),
}));
vi.mock("../../lib/streamingProviders", () => ({ fetchStreamingProviders: mocks.providers }));
vi.mock("../../lib/titleDepartures", () => ({ fetchTitleDepartures: mocks.departures }));

it("checks a visible result beyond the initial availability batch and hides its notice when saved services change", async () => {
  mocks.providers.mockResolvedValue({ providers: ["Netflix"], status: "ready" });
  mocks.departures.mockResolvedValue({
    validUntil: new Date(Date.now() + 86400000).toISOString(),
    departures: [{ service: "Netflix", expiresOn: null }],
  });
  const { rerender } = render(
    <MovieSearch onAddMovie={vi.fn()} userStreamingServices={["Netflix"]} />,
  );
  fireEvent.change(screen.getByPlaceholderText("Movie, actor or director"), {
    target: { value: "Feature" },
  });
  const last = await screen.findByRole("button", { name: "Details for Feature 12" });
  const row = last.closest('[role="row"]');
  expect(await within(row).findByText("Leaving Netflix soon")).toBeVisible();
  expect(mocks.departures).toHaveBeenCalledWith(12, "Netflix", { bowlId: null });
  rerender(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);
  expect(within(row).queryByText("Leaving Netflix soon")).not.toBeInTheDocument();
});
