import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyMoviesStrip from "../MyMoviesStrip";
import WatchedMovieCard from "../WatchedMovieCard";
import WatchedMoviesStrip from "../WatchedMoviesStrip";
import { MY_MOVIE_ELIGIBILITY_STATUS } from "../../hooks/useMyMovieEligibility";

describe("movie strip components", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders MyMoviesStrip and forwards detail/delete actions for added items", () => {
    const onViewMovie = vi.fn();
    const onDeleteMovie = vi.fn();
    const movies = [
      { id: "1", source: "added", title: "Movie One", poster_path: "/one.jpg", added_at: "2026-02-23T00:00:00.000Z" },
      { id: "2", source: "added", title: "Wildcard", tmdb_id: null, poster_path: null },
    ];

    render(<MyMoviesStrip movies={movies} onViewMovie={onViewMovie} onDeleteMovie={onDeleteMovie} />);

    fireEvent.click(screen.getAllByRole("button", { name: /details/i })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);

    expect(screen.getAllByText("Custom").length).toBeGreaterThan(0);
    expect(onViewMovie).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
    expect(onDeleteMovie).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
  });

  it("shows syncing state and disables actions for optimistic rows", () => {
    const onViewMovie = vi.fn();
    const onDeleteMovie = vi.fn();
    const movies = [
      {
        id: "temp:1",
        local_temp_id: "temp:1",
        local_status: "syncing",
        title: "Movie Pending",
        source: "added",
        added_at: "2026-03-06T00:00:00.000Z",
      },
    ];

    render(<MyMoviesStrip movies={movies} onViewMovie={onViewMovie} onDeleteMovie={onDeleteMovie} />);

    expect(screen.getByText(/syncing\.\.\./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /details/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /delete/i })).toBeDisabled();
  });

  it("does not render pending badge for added items", () => {
    const movies = [
      { id: "a1", source: "added", title: "Added Title", added_at: "2026-03-06T00:00:00.000Z" },
    ];
    render(<MyMoviesStrip movies={movies} onViewMovie={vi.fn()} onDeleteMovie={vi.fn()} />);
    const addedCard = screen.getAllByText(/Added Title/i)[0].closest("article");
    expect(addedCard).toHaveClass("border-slate-700");
    expect(addedCard).toHaveClass("bg-slate-950/50");
    expect(screen.queryByText(/pending/i)).not.toBeInTheDocument();
  });

  it("stably orders eligible movies first, greys exclusions, and leaves actions enabled", () => {
    const onViewMovie = vi.fn();
    const onDeleteMovie = vi.fn();
    const movies = [
      { id: "a1", source: "added", title: "Excluded First" },
      { id: "a2", source: "added", title: "Eligible First" },
      { id: "a3", source: "added", title: "Excluded Second" },
      { id: "a4", source: "added", title: "Eligible Second" },
    ];

    const { container } = render(
      <MyMoviesStrip
        movies={movies}
        onViewMovie={onViewMovie}
        onDeleteMovie={onDeleteMovie}
        eligibilityStatus={MY_MOVIE_ELIGIBILITY_STATUS.ready}
        eligibleMovieIds={["a2", "a4"]}
      />
    );

    const cards = [...container.querySelectorAll("article")];
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining("Eligible First"),
      expect.stringContaining("Eligible Second"),
      expect.stringContaining("Excluded First"),
      expect.stringContaining("Excluded Second"),
    ]);
    expect(cards[0]).not.toHaveAttribute("data-filter-excluded");
    expect(cards[2]).toHaveAttribute("data-filter-excluded", "true");
    expect(cards[2]).toHaveTextContent("Outside current filters");

    const detailButtons = screen.getAllByRole("button", { name: /details/i });
    const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
    expect(detailButtons[2]).toBeEnabled();
    expect(deleteButtons[2]).toBeEnabled();
    fireEvent.click(detailButtons[2]);
    fireEvent.click(deleteButtons[2]);
    expect(onViewMovie).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));
    expect(onDeleteMovie).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));
  });

  it("puts syncing movies last while preserving persisted order before resolution", () => {
    const movies = [
      { id: "sync", source: "added", title: "Syncing Movie", local_status: "syncing" },
      { id: "eligible", source: "added", title: "Eligible Movie" },
      { id: "excluded", source: "added", title: "Excluded Movie" },
    ];
    const { container, rerender } = render(
      <MyMoviesStrip
        movies={movies}
        onViewMovie={vi.fn()}
        onDeleteMovie={vi.fn()}
        eligibilityStatus={MY_MOVIE_ELIGIBILITY_STATUS.checking}
      />
    );

    expect([...container.querySelectorAll("article")].map((card) => card.textContent)).toEqual([
      expect.stringContaining("Eligible Movie"),
      expect.stringContaining("Excluded Movie"),
      expect.stringContaining("Syncing Movie"),
    ]);

    rerender(
      <MyMoviesStrip
        movies={movies}
        onViewMovie={vi.fn()}
        onDeleteMovie={vi.fn()}
        eligibilityStatus={MY_MOVIE_ELIGIBILITY_STATUS.ready}
        eligibleMovieIds={["eligible"]}
      />
    );

    const cards = [...container.querySelectorAll("article")];
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining("Eligible Movie"),
      expect.stringContaining("Excluded Movie"),
      expect.stringContaining("Syncing Movie"),
    ]);
    expect(cards[2]).not.toHaveAttribute("data-filter-excluded");
  });

  it("offers the manual filter-match gate and reports checking state", () => {
    const onRunEligibilityLookups = vi.fn();
    const props = {
      movies: [{ id: "a1", source: "added", title: "Movie One" }],
      onViewMovie: vi.fn(),
      onDeleteMovie: vi.fn(),
      onRunEligibilityLookups,
    };
    const { rerender } = render(
      <MyMoviesStrip
        {...props}
        eligibilityStatus={MY_MOVIE_ELIGIBILITY_STATUS.manual}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /check filter matches/i }));
    expect(onRunEligibilityLookups).toHaveBeenCalledTimes(1);

    rerender(
      <MyMoviesStrip
        {...props}
        eligibilityStatus={MY_MOVIE_ELIGIBILITY_STATUS.checking}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("Previewing filter matches");
  });

  it("orders a pinned eligible movie first without lifting a pinned exclusion", () => {
    const onTogglePin = vi.fn();
    const movies = [
      { id: "eligible", source: "added", title: "Eligible" },
      { id: "excluded-pinned", source: "added", title: "Excluded Pinned", is_pinned: true },
      { id: "excluded", source: "added", title: "Excluded" },
      { id: "eligible-pinned", source: "added", title: "Eligible Pinned", is_pinned: true },
      { id: "syncing", source: "added", title: "Syncing", local_status: "syncing" },
    ];

    const { container } = render(
      <MyMoviesStrip
        movies={movies}
        onViewMovie={vi.fn()}
        onDeleteMovie={vi.fn()}
        onTogglePin={onTogglePin}
        eligibilityStatus={MY_MOVIE_ELIGIBILITY_STATUS.ready}
        eligibleMovieIds={["eligible", "eligible-pinned"]}
      />
    );

    const cards = [...container.querySelectorAll("article")];
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining("Eligible Pinned"),
      expect.stringContaining("Eligible"),
      expect.stringContaining("Excluded Pinned"),
      expect.stringContaining("Excluded"),
      expect.stringContaining("Syncing"),
    ]);
    expect(screen.queryByText("Pinned", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText(/Up first when you're picked/i)).not.toBeInTheDocument();
    expect(cards[2]).toHaveAttribute("data-filter-excluded", "true");
    expect(cards[2]).toContainElement(screen.getByRole("img", { name: "Pinned", exact: true }));
    expect(screen.queryByText(/Outside tonight's filters/i)).not.toBeInTheDocument();

    const pressedPins = screen.getAllByRole("button", { pressed: true });
    expect(pressedPins).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: /unpin "excluded pinned"/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /pin "excluded"/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pin "eligible"/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: /pin "syncing"/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /pin "eligible"/i }));
    expect(onTogglePin).toHaveBeenCalledWith(
      expect.objectContaining({ id: "eligible" }),
      true
    );
  });

  it("explains title-first and keeps only the saved pin icon on the poster", () => {
    render(
      <MyMoviesStrip
        movies={[{ id: "pinned", source: "added", title: "Pinned Movie", is_pinned: true }]}
        onViewMovie={vi.fn()}
        onDeleteMovie={vi.fn()}
        onTogglePin={vi.fn()}
        drawMethod="title_first"
      />
    );

    expect(screen.getByText(/title-first, so pins don't change anything/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Pinned", exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Pinned", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /unpin/i })).not.toBeInTheDocument();
  });

  it("omits the optional pin control when no pin callback is supplied", () => {
    render(
      <MyMoviesStrip
        movies={[{ id: "movie", source: "added", title: "Movie" }]}
        onViewMovie={vi.fn()}
        onDeleteMovie={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /pin "movie"/i })).not.toBeInTheDocument();
  });

  it("renders WatchedMovieCard and forwards click", () => {
    const onClick = vi.fn();
    render(
      <WatchedMovieCard
        movie={{
          id: "w1",
          title: "Arrival",
          poster_path: "/arrival.jpg",
          added_by: "dan-user-id",
          profiles: { email: "dan@example.com" },
          drawn_by: "scott-user-id",
        }}
        onClick={onClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /arrival/i }));
    expect(screen.getByAltText("Arrival")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Added by dan" })).toHaveAttribute("title", "Added by dan");
    expect(screen.queryByText("Added by dan")).not.toBeInTheDocument();
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: "w1" }));
  });

  it("shows custom badge on watched custom entries", () => {
    render(<WatchedMovieCard movie={{ id: "w1", title: "Wildcard", tmdb_id: null }} />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("renders WatchedMoviesStrip posters", () => {
    const movies = [
      { id: "1", title: "Movie One", poster_path: "/one.jpg" },
      { id: "2", title: "Movie Two", poster_path: "/two.jpg" },
    ];
    render(<WatchedMoviesStrip movies={movies} />);
    expect(screen.getByText("2 watched")).toBeInTheDocument();
    expect(screen.getByAltText("Movie One")).toBeInTheDocument();
    expect(screen.getByAltText("Movie Two")).toBeInTheDocument();
  });

  it("shows zero watched count for an empty watched strip", () => {
    render(<WatchedMoviesStrip movies={[]} />);
    expect(screen.getByText("0 watched")).toBeInTheDocument();
  });

  it("can collapse watched posters while keeping its count visible", () => {
    const onToggleExpanded = vi.fn();
    render(
      <WatchedMoviesStrip
        movies={[{ id: "1", title: "Movie One", poster_path: "/one.jpg" }]}
        isExpanded={false}
        onToggleExpanded={onToggleExpanded}
      />
    );

    expect(screen.getByText("1 watched")).toBeInTheDocument();
    expect(screen.queryByAltText("Movie One")).not.toBeInTheDocument();
    const showButton = screen.getByRole("button", { name: "Show" });
    expect(showButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(showButton);
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
  });
});
