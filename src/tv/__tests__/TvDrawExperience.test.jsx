import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TvRevealScreen } from "../components/TvDrawExperience";
import useTvSpatialNavigation from "../hooks/useTvSpatialNavigation";

function Navigable({ children }) {
  useTvSpatialNavigation({ scopeKey: "reveal" });
  return children;
}

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
    // The stores are a glance, not a sentence: the TV has nowhere to list them.
    expect(screen.getByRole("img", { name: "Also on Netflix, Apple TV" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "JustWatch" })).toBeInTheDocument();
    expect(screen.queryByText("Apple TV")).not.toBeInTheDocument();
  });

  it("shows the drawn movie as tonight's pick: the slip, one watch button and a labelled trailer", () => {
    const onToggleTrailer = vi.fn();
    renderReveal(
      {
        title: "Moonstruck",
        release_date: "1987-12-16",
        note: "Cher slaps Nic Cage.",
        added_by_name: "Casey",
        streamingProviders: ["Netflix", "Max"],
        streamingAvailability: { subscription: [{ id: 8, name: "Netflix" }, { id: 1899, name: "Max" }], free: [], ads: [], rent: [], buy: [] },
        trailer: { embedUrl: "https://www.youtube-nocookie.com/embed/abc" },
      },
      {
        onToggleTrailer,
        webLaunchCandidate: { serviceName: "Netflix", url: "https://www.netflix.com/search?q=Moonstruck" },
      }
    );

    expect(screen.queryByText(/decision made/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/tonight's pick/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/why it’s in the bowl/i)).not.toBeInTheDocument();
    expect(screen.getByText("Cher slaps Nic Cage.").closest("figure")).toHaveTextContent("C");
    expect(screen.getByText("From Casey")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Watch on Netflix" })).toHaveAttribute("data-tv-autofocus", "true");
    // The service on the button is not repeated behind the logos.
    expect(screen.getByRole("img", { name: "Also on Max" })).toBeInTheDocument();

    screen.getByRole("button", { name: "Trailer" }).click();
    expect(onToggleTrailer).toHaveBeenCalledTimes(1);
  });

  describe("renting a movie none of your services carry", () => {
    const movie = {
      title: "Heat",
      release_date: "1995-12-15",
      streamingProviders: [],
      streamingAvailability: { subscription: [], free: [], ads: [], rent: [{ id: 2, name: "Apple TV", logoPath: "/apple-tv.jpg" }], buy: [] },
      streamingWatchUrl: "https://www.themoviedb.org/movie/949/watch",
    };
    const rentCandidate = { storeName: "Apple TV", url: "https://tv.apple.com/us/movie/heat/1", linkType: "rent" };

    it("offers the store in place of the bare rent-or-buy line, marked as costing money", () => {
      const onProviderLaunch = vi.fn();
      renderReveal(movie, { rentCandidate, onProviderLaunch });

      const rent = screen.getByRole("link", { name: /Rent on Apple TV/ });
      expect(rent).toHaveAttribute("href", rentCandidate.url);
      expect(rent).toHaveAttribute("data-tv-focusable");
      expect(rent.querySelector(".tv-rent-mark")).toHaveTextContent("$");
      // The store's logo names it, so the words don't repeat it.
      expect(rent.textContent).toBe("$Rent");
      expect(screen.queryByText("Rent or buy options available")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Watchmode" })).toBeInTheDocument();

      rent.click();
      expect(onProviderLaunch).toHaveBeenCalledTimes(1);
    });

    it("keeps the store as a logo when there is only a list of stores, or one of yours to open", () => {
      renderReveal(movie, { rentCandidate: { ...rentCandidate, storeName: null, linkType: "rent-options" } });
      expect(screen.queryByRole("link", { name: /Rent on/ })).not.toBeInTheDocument();
      expect(screen.getByRole("img", { name: "Also on Apple TV" })).toBeInTheDocument();
      cleanup();

      renderReveal(movie, {
        rentCandidate,
        webLaunchCandidate: { serviceName: "Netflix", url: "https://www.netflix.com/title/1", linkType: "title" },
      });
      expect(screen.getByRole("link", { name: /Watch on Netflix/ })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Rent on/ })).not.toBeInTheDocument();
    });

    it("is where the remote starts, ahead of the trailer, with the store's logo", async () => {
      render(
        <Navigable>
          <TvRevealScreen
            bowlName="Family Night"
            movie={{ ...movie, trailer: { embedUrl: "https://www.youtube-nocookie.com/embed/abc" } }}
            streamingServices={["Netflix"]}
            isPreparingPreviews={false}
            showTrailer={false}
            isDialogOpen={false}
            webLaunchCandidate={null}
            rentCandidate={rentCandidate}
            providerLaunchMessage={null}
            onProviderLaunch={vi.fn()}
            onCloseTrailer={vi.fn()}
            onToggleTrailer={vi.fn()}
          />
        </Navigable>
      );

      // Pressing it only opens the store's page, so it is the next step like
      // any other; the $ is what says it costs money.
      const rent = screen.getByRole("link", { name: /Rent on Apple TV/ });
      await vi.waitFor(() => expect(rent).toHaveFocus());
      expect(screen.getByRole("button", { name: /Trailer/ })).not.toHaveFocus();
      expect(rent.querySelector("img")).toHaveAttribute("src", expect.stringContaining("/apple-tv.jpg"));
    });

    it("keeps the rental when what failed to open was something else", () => {
      renderReveal(movie, {
        rentCandidate,
        providerLaunchMessage: "That streaming app could not be opened on this TV.",
        providerLaunchFailedUrl: "https://www.watchmode.com/",
      });

      expect(screen.getByRole("link", { name: /Rent on Apple TV/ })).toHaveAttribute("href", rentCandidate.url);
      expect(screen.getByRole("status")).toHaveTextContent("could not be opened");
      cleanup();

      renderReveal(movie, {
        rentCandidate,
        providerLaunchMessage: "Apple TV isn't installed on this TV.",
        providerLaunchFailedUrl: rentCandidate.url,
      });
      expect(screen.getByRole("button", { name: /Rent on Apple TV/ })).toBeDisabled();
    });

    it("disables the rental after the TV reports it could not open the store", () => {
      renderReveal(movie, { rentCandidate, providerLaunchMessage: "Apple TV isn't installed on this TV." });

      expect(screen.getByRole("button", { name: /Rent on Apple TV/ })).toBeDisabled();
      expect(screen.getByRole("status")).toHaveTextContent("Apple TV isn't installed on this TV.");
    });
  });
});
