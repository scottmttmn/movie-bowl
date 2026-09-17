import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TvRevealScreen } from "../components/TvDrawExperience";

function renderReveal(movie, overrides = {}) {
  return render(
    <TvRevealScreen
      bowlName="Family Night"
      movie={movie}
      streamingServices={["Netflix"]}
      isPreparingPreviews={false}
      showTrailer={false}
      isDialogOpen={false}
      webLaunchCandidate={null}
      providerLaunchMessage={null}
      onProviderLaunch={vi.fn()}
      onCloseTrailer={vi.fn()}
      onToggleTrailer={vi.fn()}
      {...overrides}
    />
  );
}

describe("TvRevealScreen", () => {
  afterEach(() => cleanup());

  it("uses a decorative backdrop only when the final movie has one", () => {
    const { container, rerender } = renderReveal({
      title: "Fight Club",
      release_date: "1999-10-15",
      poster_path: "/poster.jpg",
      backdrop_path: "/backdrop.jpg",
    });

    const backdrop = container.querySelector(".tv-reveal-backdrop img");
    expect(backdrop).toHaveAttribute(
      "src",
      "https://image.tmdb.org/t/p/w1280/backdrop.jpg"
    );
    expect(backdrop).toHaveAttribute("alt", "");

    rerender(
      <TvRevealScreen
        bowlName="Family Night"
        movie={{ title: "Custom Movie", poster_path: null }}
        streamingServices={[]}
        isPreparingPreviews={false}
        showTrailer={false}
        isDialogOpen={false}
        webLaunchCandidate={null}
        providerLaunchMessage={null}
        onProviderLaunch={vi.fn()}
        onCloseTrailer={vi.fn()}
        onToggleTrailer={vi.fn()}
      />
    );
    expect(container.querySelector(".tv-reveal-backdrop")).not.toBeInTheDocument();
  });

  it("preloads the backdrop under a theater overlay while keeping the page inert", () => {
    const { container } = renderReveal(
      { title: "Fight Club", backdrop_path: "/backdrop.jpg" },
      { isDialogOpen: true }
    );

    const page = container.querySelector(".tv-reveal-page");
    expect(page).toHaveAttribute("aria-hidden", "true");
    expect(page).toHaveAttribute("inert");
    expect(container.querySelector(".tv-reveal-backdrop img")).toBeInTheDocument();
  });

  it("keeps release and transactional provider context compact", () => {
    renderReveal({
      title: "Future Movie",
      status: "Post Production",
      release_date: "2099-10-23",
      streamingProviders: ["Netflix"],
      streamingAvailability: {
        subscription: [{ id: 8, name: "Netflix" }],
        free: [],
        ads: [],
        rent: [{ id: 2, name: "Apple TV" }],
        buy: [],
      },
      streamingWatchUrl: "https://www.themoviedb.org/movie/1/watch",
    });

    expect(screen.getByText("Post-production")).toBeInTheDocument();
    expect(screen.getByText("Rent or buy options available")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "JustWatch" })).toBeInTheDocument();
    expect(screen.queryByText("Apple TV")).not.toBeInTheDocument();
  });
});
